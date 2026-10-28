import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { isNobleConfigured } from "../../../config/env";
import { db } from "../../../db/postgres";
import { providerLogs, providers, services, transactions } from "../../../db/postgres/schema";
import { insertProviderLog } from "../../../db/postgres/repositories/providerLog";
import { logger } from "../../../utils/logger";
import { nobleSubmitRecon, type NobleReconTxnType } from "./recon.service";

/** Recon types we hold txn rows for. */
const RECON_SERVICES: { type: NobleReconTxnType; serviceCode: string }[] = [
  { type: "CW", serviceCode: "aeps_cash_withdrawal" },
  { type: "MT", serviceCode: "aadhaar_pay" },
  { type: "CD", serviceCode: "aeps_cash_deposit" },
  { type: "QR", serviceCode: "UPI_CASH_POINT" },
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

/** When the provider last accepted this type + day, or null if it never has. */
async function lastSubmittedAt(type: NobleReconTxnType, day: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${providerLogs.createdAt})` })
    .from(providerLogs)
    .where(
      and(
        eq(providerLogs.providerCode, "noble"),
        eq(providerLogs.operation, reconOperation(type, day)),
        eq(providerLogs.status, "success"),
      ),
    );
  return row?.at ? new Date(row.at) : null;
}

/**
 * A recon-eligible txn of this day that was created — or reached success/failed — after the
 * file was accepted. The 23:15 same-day file misses everything from the last 45 minutes.
 */
async function hasTxnsSince(serviceCode: string, day: string, since: Date): Promise<boolean> {
  const { from, to } = istDayRange(day);
  const [row] = await db
    .select({ id: transactions.id })
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
        sql`(${transactions.createdAt} > ${since} OR ${transactions.updatedAt} > ${since})`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Minutes after IST midnight from which yesterday's file is re-sent if it went out incomplete. */
export const RESUBMIT_AFTER_MINUTES = 30;

/** Which IST days a tick should send, and whether an already-accepted file may be re-sent. */
export function reconDaysToRun(now = new Date()): { day: string; resubmitIfStale: boolean }[] {
  const minutes = istMinutesNow(now);
  const days = [{ day: istDate(1, now), resubmitIfStale: minutes >= RESUBMIT_AFTER_MINUTES }];
  if (minutes >= SAME_DAY_AFTER_MINUTES) days.push({ day: istDate(0, now), resubmitIfStale: false });
  return days;
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

/**
 * Submit one IST day for every recon type. Skips types with no txns and types already accepted —
 * unless `resubmitIfStale` and txns landed after the accepted file, in which case the whole
 * day is re-sent under the same batch id.
 */
export async function submitNobleReconForDay(
  day: string,
  opts: { resubmitIfStale?: boolean } = {},
): Promise<{ type: string; records: number; result: string }[]> {
  const [yyyy, mm, dd] = day.split("-");
  const transactionDate = `${dd}/${mm}/${yyyy}`;
  const out: { type: string; records: number; result: string }[] = [];

  for (const { type, serviceCode } of RECON_SERVICES) {
    const submittedAt = await lastSubmittedAt(type, day);
    if (submittedAt && !(opts.resubmitIfStale && (await hasTxnsSince(serviceCode, day, submittedAt)))) {
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
 * Jobs-worker tick: yesterday is always eligible (catch-up after downtime) and, from 00:30 IST,
 * is re-sent if txns arrived after its file was accepted; today only after 23:15 IST. Accepted,
 * up-to-date days are skipped, so running every few minutes is safe.
 */
export async function runNobleReconTick(now = new Date()): Promise<void> {
  if (!isNobleConfigured()) return;
  for (const { day, resubmitIfStale } of reconDaysToRun(now)) {
    const result = await submitNobleReconForDay(day, { resubmitIfStale });
    const sent = result.filter((r) => r.records > 0);
    if (sent.length > 0) logger.info({ day, result }, "AEPS recon tick");
  }
}
