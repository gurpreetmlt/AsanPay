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

const STATUS_COLOR: Record<string, string> = {
  success: "#12A150",
  pending: "#C08A00",
  initiated: "#C08A00",
  failed: "#D0342C",
  reversed: "#D0342C",
  refunded: "#C08A00",
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

  const doc = new PDFDocument({ size: "A5", margin: 36 });
  doc.pipe(res);

  const brandName = process.env.BRAND_NAME || BRAND_DEFAULTS.name;
  const statusColor = STATUS_COLOR[row.status] ?? "#333333";

  doc.fontSize(18).fillColor("#123A9E").text(brandName, { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor("#666666").text("Transaction Receipt", { align: "center" });
  doc.moveDown(1);

  doc
    .fontSize(13)
    .fillColor(statusColor)
    .text(row.status.toUpperCase(), { align: "center" });
  doc.moveDown(1);

  doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor("#E5E7EB").stroke();
  doc.moveDown(0.8);

  const rows: [string, string][] = [
    ["Reference No.", row.txnRef],
    ["Service", row.serviceName],
    ["Amount", `Rs. ${row.amount}`],
  ];
  if (Number(row.customerFee) > 0) rows.push(["Fee", `Rs. ${row.customerFee}`]);
  const customerMobile = metadataCustomerLine(row.metadata);
  if (customerMobile) rows.push(["Customer Mobile", customerMobile]);
  if (row.providerTxnId) rows.push(["Provider Ref.", row.providerTxnId]);
  if (row.walletType) rows.push(["Wallet", row.walletType.toUpperCase()]);
  rows.push(["Date & Time", new Date(row.completedAt ?? row.initiatedAt).toLocaleString("en-IN")]);
  rows.push(["Retailer", `${row.retailerName} (${row.retailerMobile})`]);
  if (row.status === "failed" && row.failureReason) rows.push(["Reason", row.failureReason]);

  doc.fontSize(11);
  for (const [label, value] of rows) {
    doc.fillColor("#666666").text(label, 36, doc.y, { continued: true, width: 160 });
    doc.fillColor("#111827").text(`  ${value}`);
    doc.moveDown(0.5);
  }

  doc.moveDown(1);
  doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor("#E5E7EB").stroke();
  doc.moveDown(0.6);
  doc
    .fontSize(8)
    .fillColor("#9CA3AF")
    .text("This is a system-generated receipt and does not require a signature.", { align: "center" });

  doc.end();
}
