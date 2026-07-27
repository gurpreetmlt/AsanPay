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

const LOGO_PATH = path.join(process.cwd(), "assets", "brand-logo.png");

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
  doc.rect(0, 0, pageW, 92).fill(PALETTE.navy);
  const hasLogo = fs.existsSync(LOGO_PATH);
  if (hasLogo) {
    try {
      doc.image(LOGO_PATH, marginX, 24, { height: 26, fit: [140, 26] });
    } catch {
      doc.fontSize(19).fillColor("#FFFFFF").font("Helvetica-Bold").text(brandName, marginX, 30);
    }
  } else {
    doc.fontSize(19).fillColor("#FFFFFF").font("Helvetica-Bold").text(brandName, marginX, 30);
  }
  doc
    .fontSize(9)
    .fillColor("#C9D6F5")
    .font("Helvetica")
    .text("TRANSACTION RECEIPT", marginX, 60, { characterSpacing: 1.2 });

  // Status pill, top-right of header
  const pillLabel = style.label;
  doc.font("Helvetica-Bold").fontSize(10);
  const pillTextW = doc.widthOfString(pillLabel);
  const pillW = pillTextW + 24;
  const pillX = pageW - marginX - pillW;
  const pillY = 30;
  doc.roundedRect(pillX, pillY, pillW, 24, 12).fill("#FFFFFF");
  doc.fillColor(style.fg).text(pillLabel, pillX + 12, pillY + 7);

  let y = 118;

  // ── Amount block ────────────────────────────────────────────────────────
  doc.fillColor(PALETTE.muted).font("Helvetica").fontSize(9).text("AMOUNT", marginX, y);
  y += 14;
  doc
    .fillColor(PALETTE.ink)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(`Rs. ${row.amount}`, marginX, y);
  y += 40;

  doc.moveTo(marginX, y).lineTo(pageW - marginX, y).strokeColor(PALETTE.border).lineWidth(1).stroke();
  y += 18;

  // ── Detail rows ─────────────────────────────────────────────────────────
  const rows: [string, string][] = [
    ["Reference No.", row.txnRef],
    ["Service", row.serviceName],
  ];
  if (Number(row.customerFee) > 0) rows.push(["Fee", `Rs. ${row.customerFee}`]);
  const customerMobile = metadataCustomerLine(row.metadata);
  if (customerMobile) rows.push(["Customer Mobile", customerMobile]);
  if (row.providerTxnId) rows.push(["Provider Ref.", row.providerTxnId]);
  if (row.walletType) rows.push(["Wallet", row.walletType.toUpperCase()]);
  rows.push(["Date & Time", new Date(row.completedAt ?? row.initiatedAt).toLocaleString("en-IN")]);
  rows.push(["Retailer", `${row.retailerName} (${row.retailerMobile})`]);
  if (row.status === "failed" && row.failureReason) rows.push(["Reason", row.failureReason]);

  const labelW = 150;
  const rowH = 26;
  doc.fontSize(10.5);
  for (const [label, value] of rows) {
    doc.fillColor(PALETTE.muted).font("Helvetica").text(label, marginX, y, { width: labelW });
    doc
      .fillColor(PALETTE.ink)
      .font("Helvetica-Bold")
      .text(value, marginX + labelW, y, { width: pageW - marginX * 2 - labelW });
    y += rowH;
  }

  y += 6;
  doc.moveTo(marginX, y).lineTo(pageW - marginX, y).strokeColor(PALETTE.border).lineWidth(1).stroke();
  y += 20;

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerY = Math.max(y, pageH - 70);
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
