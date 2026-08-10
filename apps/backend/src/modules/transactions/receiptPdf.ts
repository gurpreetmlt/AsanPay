import type { Response } from "express";
import path from "node:path";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { services, transactions, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { BRAND_DEFAULTS } from "@asanpay/shared-types";
import type { UserRole } from "@asanpay/shared-types";
import { resolveTenantId } from "../fund-requests/tenant";
import { getSupportContacts } from "../tenants/tenantSettings.service";

type Actor = { id: string; role: UserRole };

async function getReceiptForPdf(actor: Actor, txnRef: string) {
  const [row] = await db
    .select({
      txnRef: transactions.txnRef,
      amount: transactions.amount,
      customerFee: transactions.customerFee,
      status: transactions.status,
      walletType: transactions.walletType,
      failureReason: transactions.failureReason,
      providerTxnId: transactions.providerTxnId,
      metadata: transactions.metadata,
      serviceName: services.name,
      serviceCode: services.code,
      userId: transactions.userId,
      retailerName: users.name,
      retailerMobile: users.mobile,
      initiatedAt: transactions.initiatedAt,
      completedAt: transactions.completedAt,
    })
    .from(transactions)
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .innerJoin(users, eq(transactions.userId, users.id))
    .where(eq(transactions.txnRef, txnRef));

  if (!row) throw new HttpError(404, "Transaction not found", "TXN_NOT_FOUND");
  if (actor.role !== "admin" && row.userId !== actor.id) {
    throw new HttpError(403, "Not your transaction", "FORBIDDEN");
  }
  return row;
}

const PALETTE = {
  navy: "#123A9E",
  ink: "#111827",
  muted: "#6B7280",
  faint: "#9CA3AF",
  border: "#E5E7EB",
  panel: "#F7F9FC",
  success: "#0FA35C",
  successBg: "#E7F8EF",
  pending: "#B7791F",
  pendingBg: "#FCF3DC",
  failed: "#D0342C",
  failedBg: "#FCE9E8",
  fb: "#1877F2",
  ig: "#E1306C",
  yt: "#FF0000",
};

const STATUS_STYLE: Record<string, { fg: string; bg: string; label: string }> = {
  success: { fg: PALETTE.success, bg: PALETTE.successBg, label: "SUCCESS" },
  pending: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "PENDING" },
  initiated: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "PENDING" },
  failed: { fg: PALETTE.failed, bg: PALETTE.failedBg, label: "FAILED" },
  reversed: { fg: PALETTE.failed, bg: PALETTE.failedBg, label: "REVERSED" },
  refunded: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "REFUNDED" },
};

/** Light logo for blue header — PNG lives in apps/backend/assets/brand. */
function lightLogoBuffer(): Buffer | null {
  // ESM: never use `__dirname`. Coolify cwd is typically the backend app root.
  const candidates = [
    path.join(process.cwd(), "assets/brand/AsanPay-Light-Icon.png"),
    path.join(process.cwd(), "apps/backend/assets/brand/AsanPay-Light-Icon.png"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      // Reject empty / tiny garbage so PDFKit never throws after headers are sent.
      if (buf.length > 64) return buf;
    } catch {
      /* try next path — missing logo must not block the PDF */
    }
  }
  return null;
}

function brandContactFromAdmin(contacts: {
  supportWebsite: string;
  supportEmail: string;
  supportPhone: string;
}) {
  const website = (contacts.supportWebsite || "https://asanpay.in").replace(/\/$/, "");
  let slug = "asanpay";
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    if (base) slug = base.toLowerCase().replace(/[^a-z0-9]/g, "") || "asanpay";
  } catch {
    /* keep default */
  }
  return {
    website,
    email: contacts.supportEmail || "help@asanpay.in",
    phone: contacts.supportPhone || "",
    socialHandle: slug,
    facebook: `https://facebook.com/${slug}`,
    instagram: `https://instagram.com/${slug}`,
    youtube: `https://youtube.com/@${slug}`,
  };
}

function metadataCustomerLine(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const mobile = m.customerMobile;
  return typeof mobile === "string" ? mobile : null;
}

function drawSocialChip(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  fill: string,
): number {
  const w = 22;
  const h = 22;
  doc.roundedRect(x, y, w, h, 6).fill(fill);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(label.length > 2 ? 7 : 8)
    .text(label, x, y + (label.length > 2 ? 7 : 6), { width: w, align: "center" });
  return w + 6;
}

export async function streamTxnReceiptPdf(actor: Actor, txnRef: string, res: Response): Promise<void> {
  let row: Awaited<ReturnType<typeof getReceiptForPdf>>;
  let contact: ReturnType<typeof brandContactFromAdmin>;
  try {
    row = await getReceiptForPdf(actor, txnRef);
    const tenantId = await resolveTenantId();
    const adminContacts = await getSupportContacts(tenantId);
    contact = brandContactFromAdmin(adminContacts);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const detail = err instanceof Error ? err.message : "unknown error";
    throw new HttpError(500, `Receipt lookup failed: ${detail}`, "RECEIPT_PDF_LOOKUP");
  }

  // Logo is optional — never fail the receipt if the PNG path is missing.
  const logoBuf = lightLogoBuffer();

  let doc: PDFKit.PDFDocument;
  try {
    doc = new PDFDocument({ size: "A5", margin: 0, autoFirstPage: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    throw new HttpError(
      500,
      `Could not start receipt PDF (${detail}). Redeploy backend if pdfkit fonts are missing.`,
      "RECEIPT_PDF_INIT",
    );
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="receipt-${row.txnRef}.pdf"`);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    doc.on("error", fail);
    res.on("error", fail);
    doc.on("end", ok);
    doc.pipe(res);

    try {
      const brandName = process.env.BRAND_NAME || BRAND_DEFAULTS.name;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const marginX = 32;
      const style =
        STATUS_STYLE[row.status] ?? { fg: PALETTE.ink, bg: PALETTE.panel, label: String(row.status).toUpperCase() };

      const money = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : String(v ?? "0");
      };

      // ── Header band ─────────────────────────────────────────────────────────
      doc.rect(0, 0, pageW, 100).fill(PALETTE.navy);
      doc.save();
      doc.rect(0, 0, pageW, 100).clip();
      doc.circle(pageW - 20, 100, 70).fillOpacity(0.06).fill("#FFFFFF");
      doc.restore();
      doc.fillOpacity(1);

      const logoSize = 36;
      const logoX = marginX;
      const logoY = 22;
      if (logoBuf) {
        try {
          doc.image(logoBuf, logoX, logoY, { width: logoSize, height: logoSize });
        } catch {
          doc.roundedRect(logoX, logoY, logoSize, logoSize, 9).fill("#FFFFFF");
          doc
            .fillColor(PALETTE.navy)
            .font("Helvetica-Bold")
            .fontSize(19)
            .text("Rs", logoX, logoY + 8, { width: logoSize, align: "center" });
        }
      } else {
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 9).fill("#FFFFFF");
        doc
          .fillColor(PALETTE.navy)
          .font("Helvetica-Bold")
          .fontSize(19)
          .text("Rs", logoX, logoY + 8, { width: logoSize, align: "center" });
      }

      doc.fontSize(20).fillColor("#FFFFFF").font("Helvetica-Bold").text(brandName, logoX + logoSize + 12, 28);
      doc
        .fontSize(9)
        .fillColor("#C9D6F5")
        .font("Helvetica")
        .text("TRANSACTION RECEIPT", logoX + logoSize + 12, 60);

      const pillLabel = style.label;
      doc.font("Helvetica-Bold").fontSize(10);
      const pillTextW = doc.widthOfString(pillLabel);
      const pillW = pillTextW + 24;
      const pillX = pageW - marginX - pillW;
      const pillY = 33;
      doc.roundedRect(pillX, pillY, pillW, 24, 12).fill("#FFFFFF");
      doc.fillColor(style.fg).text(pillLabel, pillX + 12, pillY + 7);

      let y = 126;

      // ── Amount card ─────────────────────────────────────────────────────────
      const amountCardH = 66;
      doc.roundedRect(marginX, y, pageW - marginX * 2, amountCardH, 10).fill(PALETTE.panel);
      doc.rect(marginX, y, 4, amountCardH).fill(style.fg);
      doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(9).text("AMOUNT", marginX + 20, y + 14);
      doc
        .fillColor(PALETTE.ink)
        .font("Helvetica-Bold")
        .fontSize(26)
        .text(`Rs. ${money(row.amount)}`, marginX + 20, y + 28);
      y += amountCardH + 18;

      // ── Detail table ────────────────────────────────────────────────────────
      const rows: [string, string][] = [
        ["Reference No.", String(row.txnRef)],
        ["Service", String(row.serviceName ?? "")],
      ];
      if (Number(row.customerFee) > 0) rows.push(["Fee", `Rs. ${money(row.customerFee)}`]);
      const customerMobile = metadataCustomerLine(row.metadata);
      if (customerMobile) rows.push(["Customer Mobile", customerMobile]);
      if (row.providerTxnId) rows.push(["Provider Ref.", String(row.providerTxnId)]);
      if (row.walletType) {
        const balanceLabel =
          row.walletType === "main" ? "Main" : row.walletType === "aeps" ? "AEPS" : String(row.walletType);
        rows.push(["Balance", balanceLabel]);
      }
      const when = row.completedAt ?? row.initiatedAt;
      rows.push([
        "Date & Time",
        when ? new Date(when).toLocaleString("en-IN") : "—",
      ]);
      rows.push(["Retailer", `${row.retailerName} (${row.retailerMobile})`]);
      if (row.status === "failed" && row.failureReason) {
        rows.push(["Reason", String(row.failureReason)]);
      }

      const tableX = marginX;
      const tableW = pageW - marginX * 2;
      const labelColW = 150;
      const rowH = 26;
      const tableTop = y;
      const tableBottom = tableTop + rowH * rows.length;

      doc.save();
      doc.roundedRect(tableX, tableTop, tableW, tableBottom - tableTop, 8).clip();
      doc.rect(tableX, tableTop, labelColW, tableBottom - tableTop).fill(PALETTE.panel);
      doc.restore();
      doc
        .roundedRect(tableX, tableTop, tableW, tableBottom - tableTop, 8)
        .strokeColor(PALETTE.border)
        .lineWidth(1)
        .stroke();
      doc
        .moveTo(tableX + labelColW, tableTop)
        .lineTo(tableX + labelColW, tableBottom)
        .strokeColor(PALETTE.border)
        .stroke();

      doc.fontSize(10);
      rows.forEach(([label, value], i) => {
        const rowY = tableTop + i * rowH;
        if (i > 0) {
          doc
            .moveTo(tableX, rowY)
            .lineTo(tableX + tableW, rowY)
            .strokeColor(PALETTE.border)
            .stroke();
        }
        doc
          .fillColor(PALETTE.muted)
          .font("Helvetica")
          .text(label, tableX + 10, rowY + 8, { width: labelColW - 18 });
        doc
          .fillColor(PALETTE.ink)
          .font("Helvetica-Bold")
          .text(value, tableX + labelColW + 10, rowY + 8, { width: tableW - labelColW - 18 });
      });

      y = tableBottom + 16;

      // ── Contact + social ────────────────────────────────────────────────────
      const contactBlockH = 78;
      const contactTop = Math.min(y, pageH - contactBlockH - 52);
      doc.roundedRect(marginX, contactTop, pageW - marginX * 2, contactBlockH, 8).fill(PALETTE.panel);

      const cx = marginX + 12;
      let cy = contactTop + 10;
      doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text("Website", cx, cy);
      doc
        .fillColor(PALETTE.navy)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(contact.website.replace(/^https?:\/\//, ""), cx + 52, cy, {
          link: contact.website,
          underline: false,
        });
      cy += 14;
      doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text("Email", cx, cy);
      doc
        .fillColor(PALETTE.navy)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(contact.email, cx + 52, cy, { link: `mailto:${contact.email}` });
      cy += 14;
      doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text("Contact", cx, cy);
      if (contact.phone) {
        doc
          .fillColor(PALETTE.ink)
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(contact.phone, cx + 52, cy, {
            link: `tel:${contact.phone.replace(/\s/g, "")}`,
          });
      } else {
        doc.fillColor(PALETTE.faint).font("Helvetica").fontSize(9).text("—", cx + 52, cy);
      }
      cy += 16;

      doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(8).text("Social", cx, cy + 4);
      let sx = cx + 52;
      const chipY = cy;
      sx += drawSocialChip(doc, sx, chipY, "f", PALETTE.fb);
      sx += drawSocialChip(doc, sx, chipY, "IG", PALETTE.ig);
      sx += drawSocialChip(doc, sx, chipY, "YT", PALETTE.yt);
      doc
        .fillColor(PALETTE.ink)
        .font("Helvetica")
        .fontSize(8)
        .text(`@${contact.socialHandle}`, sx + 2, chipY + 6, {
          link: contact.instagram,
        });
      try {
        doc.link(cx + 52, chipY, 22, 22, contact.facebook);
        doc.link(cx + 52 + 28, chipY, 22, 22, contact.instagram);
        doc.link(cx + 52 + 56, chipY, 22, 22, contact.youtube);
      } catch {
        /* link targets are optional */
      }

      // ── Footer ──────────────────────────────────────────────────────────────
      const footerY = pageH - 42;
      const dividerW = 40;
      doc
        .moveTo(pageW / 2 - dividerW / 2, footerY - 12)
        .lineTo(pageW / 2 + dividerW / 2, footerY - 12)
        .strokeColor(PALETTE.navy)
        .lineWidth(2)
        .stroke();
      doc
        .fontSize(7.5)
        .fillColor(PALETTE.faint)
        .font("Helvetica")
        .text("This is a system-generated receipt and does not require a signature.", marginX, footerY, {
          width: pageW - marginX * 2,
          align: "center",
        });
      doc.text(`${brandName} — Payment Made Easy`, marginX, footerY + 12, {
        width: pageW - marginX * 2,
        align: "center",
      });

      doc.end();
    } catch (err) {
      fail(err);
      try {
        doc.end();
      } catch {
        /* ignore */
      }
    }
  }).catch((err) => {
    if (!res.headersSent) {
      const detail = err instanceof Error ? err.message : "unknown error";
      throw new HttpError(500, `Could not generate receipt PDF: ${detail}`, "RECEIPT_PDF_FAILED");
    }
    try {
      res.destroy(err instanceof Error ? err : undefined);
    } catch {
      /* ignore */
    }
  });
}
