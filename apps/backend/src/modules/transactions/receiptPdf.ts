import type { Response } from "express";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { services, transactions, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { BRAND_DEFAULTS } from "@asanpay/shared-types";
import type { UserRole } from "@asanpay/shared-types";

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
};

const STATUS_STYLE: Record<string, { fg: string; bg: string; label: string }> = {
  success: { fg: PALETTE.success, bg: PALETTE.successBg, label: "SUCCESS" },
  pending: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "PENDING" },
  initiated: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "PENDING" },
  failed: { fg: PALETTE.failed, bg: PALETTE.failedBg, label: "FAILED" },
  reversed: { fg: PALETTE.failed, bg: PALETTE.failedBg, label: "REVERSED" },
  refunded: { fg: PALETTE.pending, bg: PALETTE.pendingBg, label: "REFUNDED" },
};

function metadataCustomerLine(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const mobile = m.customerMobile;
  return typeof mobile === "string" ? mobile : null;
}

export async function streamTxnReceiptPdf(actor: Actor, txnRef: string, res: Response): Promise<void> {
  const row = await getReceiptForPdf(actor, txnRef);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="receipt-${row.txnRef}.pdf"`);

  const doc = new PDFDocument({ size: "A5", margin: 0 });
  doc.pipe(res);

  const brandName = process.env.BRAND_NAME || BRAND_DEFAULTS.name;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const marginX = 32;
  const style = STATUS_STYLE[row.status] ?? { fg: PALETTE.ink, bg: PALETTE.panel, label: row.status.toUpperCase() };

  // ── Header band ─────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 100).fill(PALETTE.navy);
  // Faint decorative circle for a bit of visual polish, clipped by the header band.
  doc.save();
  doc.rect(0, 0, pageW, 100).clip();
  doc.circle(pageW - 20, 100, 70).fillOpacity(0.06).fill("#FFFFFF");
  doc.restore();

  // Logo mark: white rounded badge with a navy rupee glyph, next to the wordmark.
  const logoSize = 34;
  const logoX = marginX;
  const logoY = 24;
  doc.roundedRect(logoX, logoY, logoSize, logoSize, 9).fill("#FFFFFF");
  doc
    .fillColor(PALETTE.navy)
    .font("Helvetica-Bold")
    .fontSize(19)
    .text("Rs", logoX, logoY + 8, { width: logoSize, align: "center" });

  doc.fontSize(20).fillColor("#FFFFFF").font("Helvetica-Bold").text(brandName, logoX + logoSize + 12, 28);
  doc
    .fontSize(9)
    .fillColor("#C9D6F5")
    .font("Helvetica")
    .text("TRANSACTION RECEIPT", logoX + logoSize + 12, 60, { characterSpacing: 1.2 });

  // Status pill, top-right of header
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
    .text(`Rs. ${row.amount}`, marginX + 20, y + 28);
  y += amountCardH + 22;

  // ── Detail table ────────────────────────────────────────────────────────
  const rows: [string, string][] = [
    ["Reference No.", row.txnRef],
    ["Service", row.serviceName],
  ];
  if (Number(row.customerFee) > 0) rows.push(["Fee", `Rs. ${row.customerFee}`]);
  const customerMobile = metadataCustomerLine(row.metadata);
  if (customerMobile) rows.push(["Customer Mobile", customerMobile]);
  if (row.providerTxnId) rows.push(["Provider Ref.", row.providerTxnId]);
  if (row.walletType) {
    const balanceLabel =
      row.walletType === "main" ? "Service Balance" : row.walletType === "aeps" ? "Earnings" : row.walletType;
    rows.push(["Balance", balanceLabel]);
  }
  rows.push(["Date & Time", new Date(row.completedAt ?? row.initiatedAt).toLocaleString("en-IN")]);
  rows.push(["Retailer", `${row.retailerName} (${row.retailerMobile})`]);
  if (row.status === "failed" && row.failureReason) rows.push(["Reason", row.failureReason]);

  const tableX = marginX;
  const tableW = pageW - marginX * 2;
  const labelColW = 150;
  const rowH = 28;
  const tableTop = y;
  const tableBottom = tableTop + rowH * rows.length;

  // Outer border + label-column shading (clip so the shaded column respects rounded corners)
  doc.save();
  doc.roundedRect(tableX, tableTop, tableW, tableBottom - tableTop, 8).clip();
  doc.rect(tableX, tableTop, labelColW, tableBottom - tableTop).fill(PALETTE.panel);
  doc.restore();
  doc
    .roundedRect(tableX, tableTop, tableW, tableBottom - tableTop, 8)
    .strokeColor(PALETTE.border)
    .lineWidth(1)
    .stroke();
  // Vertical divider between label and value columns
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
      .text(label, tableX + 10, rowY + 9, { width: labelColW - 18 });
    doc
      .fillColor(PALETTE.ink)
      .font("Helvetica-Bold")
      .text(value, tableX + labelColW + 10, rowY + 9, { width: tableW - labelColW - 18 });
  });

  y = tableBottom + 22;

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerY = Math.max(y, pageH - 70);
  const dividerW = 40;
  doc
    .moveTo(pageW / 2 - dividerW / 2, footerY - 14)
    .lineTo(pageW / 2 + dividerW / 2, footerY - 14)
    .strokeColor(PALETTE.navy)
    .lineWidth(2)
    .stroke();
  doc
    .fontSize(8)
    .fillColor(PALETTE.faint)
    .font("Helvetica")
    .text("This is a system-generated receipt and does not require a signature.", marginX, footerY, {
      width: pageW - marginX * 2,
      align: "center",
    });
  doc.text(`${brandName} — Payment Made Easy`, marginX, footerY + 14, {
    width: pageW - marginX * 2,
    align: "center",
  });

  doc.end();
}
