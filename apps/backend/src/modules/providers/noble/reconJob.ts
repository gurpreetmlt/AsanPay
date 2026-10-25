import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { isNobleConfigured } from "../../../config/env";
import { db } from "../../../db/postgres";
import { providerLogs, providers, services, transactions } from "../../../db/postgres/schema";
import { insertProviderLog } from "../../../db/postgres/repositories/providerLog";
import { logger } from "../../../utils/logger";
import { nobleSubmitRecon, type NobleReconTxnType } from "./recon.service";

/** Recon types we hold txn rows for. UPI QR collections are not recorded as transactions yet. */
const RECON_SERVICES: { type: NobleReconTxnType; serviceCode: string }[] = [
  { type: "CW", serviceCode: "aeps_cash_withdrawal" },
  { type: "MT", serviceCode: "aadhaar_pay" },
  { type: "CD", serviceCode: "aeps_cash_deposit" },
];

const BATCH_SIZE = 500;
/** Provider only accepts same-day recon after 11 PM IST; 23:15 leaves a margin. */
const SAME_DAY_AFTER_MINUTES = 23 * 60 + 15;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** YYYY-MM-DD for an IST calendar day `daysAgo` before now. */
export function istDate(daysAgo = 0, now = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS - daysAgo * 24 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function istMinutesNow(now = new Date()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** UTC bounds of an IST calendar day. */
function istDayRange(day: string): { from: Date; to: Date } {
  const from = new Date(new Date(`${day}T00:00:00Z`).getTime() - IST_OFFSET_MS);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** Stable per type + date (10–15 chars) so re-sent batches for the same day share one id. */
export function reconBatchId(type: NobleReconTxnType, day: string): string {
  return `AP${type}${day.replace(/-/g, "")}`;
}

/** One recon line: status~our transactionId~RRN. */
export function reconLine(status: "success" | "failed", txnRef: string, rrn: string): string {
  return `${status === "success" ? 1 : 0}~${txnRef}~${rrn}`;
}

function reconOperation(type: NobleReconTxnType, day: string): string {
  return `recon:${type}:${day}`;
}

async function alreadySubmitted(type: NobleReconTxnType, day: string): Promise<boolean> {
  const [row] = await db
    .select({ id: providerLogs.id })
    .from(providerLogs)
    .where(
      and(
        eq(providerLogs.providerCode, "noble"),
        eq(providerLogs.operation, reconOperation(type, day)),
        eq(providerLogs.status, "success"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function reconLinesFor(serviceCode: string, day: string): Promise<string[]> {
  const { from, to } = istDayRange(day);
  const rows = await db
    .select({
      txnRef: transactions.txnRef,
      status: transactions.status,
      rrn: sql<string | null>`${transactions.metadata} -> 'provider' ->> 'rrn'`,
    })
    .from(transactions)
    .innerJoin(services, eq(transactions.serviceId, services.id))
    .innerJoin(providers, eq(transactions.providerId, providers.id))
    .where(
      and(
        eq(services.code, serviceCode),
        eq(providers.code, "noble"),
        inArray(transactions.status, ["success", "failed"]),
        gte(transactions.createdAt, from),
        lt(transactions.createdAt, to),
      ),
    );
  return rows.map((r) => reconLine(r.status as "success" | "failed", r.txnRef, (r.rrn ?? "").trim()));
}

/** Submit one IST day for every recon type. Skips types already accepted or with no txns. */
export async function submitNobleReconForDay(day: string): Promise<{ type: string; records: number; result: string }[]> {
  const [yyyy, mm, dd] = day.split("-");
  const transactionDate = `${dd}/${mm}/${yyyy}`;
  const out: { type: string; records: number; result: string }[] = [];

  for (const { type, serviceCode } of RECON_SERVICES) {
    if (await alreadySubmitted(type, day)) {
      out.push({ type, records: 0, result: "already submitted" });
      continue;
    }
    const lines = await reconLinesFor(serviceCode, day);
    if (lines.length === 0) {
      out.push({ type, records: 0, result: "no transactions" });
      continue;
    }

    const started = Date.now();
    let status = "success";
    let message = "";
    try {
      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const res = await nobleSubmitRecon({
          uniqueDateTransactionId: reconBatchId(type, day),
          transactionType: type,
          transactionDate,
          reconData: lines.slice(i, i + BATCH_SIZE),
        });
        message = res.message;
      }
    } catch (err) {
      status = "failed";
      message = err instanceof Error ? err.message : String(err);
      logger.error({ err, type, day, records: lines.length }, "AEPS recon submission failed");
    }

    await insertProviderLog({
      txnRef: null,
      providerCode: "noble",
      operation: reconOperation(type, day),
      requestPayload: { type, day, records: lines.length },
      responsePayload: { message },
      status,
      durationMs: Date.now() - started,
    }).catch((err: unknown) => logger.error({ err }, "failed to log AEPS recon submission"));

    out.push({ type, records: lines.length, result: status === "success" ? "submitted" : `failed: ${message}` });
  }
  return out;
}

/**
 * Jobs-worker tick: yesterday is always eligible (catch-up after downtime); today only after
 * 23:15 IST. Already-accepted days are skipped, so running every few minutes is safe.
 */
export async function runNobleReconTick(now = new Date()): Promise<void> {
  if (!isNobleConfigured()) return;
  const days = [istDate(1, now)];
  if (istMinutesNow(now) >= SAME_DAY_AFTER_MINUTES) days.push(istDate(0, now));
  for (const day of days) {
    const result = await submitNobleReconForDay(day);
    const sent = result.filter((r) => r.records > 0);
    if (sent.length > 0) logger.info({ day, result }, "AEPS recon tick");
  }
}
