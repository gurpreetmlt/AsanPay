import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { services, transactions, users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { BRAND_DEFAULTS } from "@asanpay/shared-types";
import type { UserRole } from "@asanpay/shared-types";

type Actor = { id: string; role: UserRole };

function escPos(text: string): Buffer {
  // ESC/POS: init + text + feed + cut
  const init = Buffer.from([0x1b, 0x40]);
  const body = Buffer.from(text, "utf8");
  const feed = Buffer.from([0x0a, 0x0a, 0x0a]);
  const cut = Buffer.from([0x1d, 0x56, 0x00]);
  return Buffer.concat([init, body, feed, cut]);
}

/**
 * 58mm thermal-printer payload for a successful txn. Clients send the binary to a paired ESC/POS printer.
 */
export async function streamTxnReceiptEscPos(
  actor: Actor,
  txnRef: string,
  res: Response,
): Promise<void> {
  const [row] = await db
    .select({
      txnRef: transactions.txnRef,
      amount: transactions.amount,
      customerFee: transactions.customerFee,
      status: transactions.status,
      providerTxnId: transactions.providerTxnId,
      serviceName: services.name,
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

  const brand = process.env.BRAND_NAME || BRAND_DEFAULTS.name;
  const lines = [
    brand,
    "------------------------------",
    row.serviceName,
    `Ref: ${row.txnRef}`,
    row.providerTxnId ? `Provider: ${row.providerTxnId}` : null,
    `Amount: Rs ${row.amount}`,
    row.customerFee && Number(row.customerFee) > 0 ? `Fee: Rs ${row.customerFee}` : null,
    `Status: ${row.status}`,
    `Agent: ${row.retailerName}`,
    `Mobile: ${row.retailerMobile}`,
    `Time: ${(row.completedAt ?? row.initiatedAt).toISOString()}`,
    "------------------------------",
    "Thank you",
  ]
    .filter(Boolean)
    .join("\n");

  const payload = escPos(lines + "\n");
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="receipt-${row.txnRef}.bin"`);
  res.setHeader("X-Receipt-Reprint", "1");
  res.send(payload);
}
