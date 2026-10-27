import { and, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { commissionLedger, disputes, transactions } from "../../db/postgres/schema";
import { cachePing } from "../../cache/redis";
import { getRateCard } from "../commission/rateCard.service";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A txn still initiated / pending after this long is treated as stuck. */
const STUCK_AFTER_MS = 30 * 60 * 1000;
/** Rate card scan is ~2 queries per service — reuse it for a few minutes. */
const COMMISSION_HEALTH_TTL_MS = 5 * 60 * 1000;

function istDayStart(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

async function dayMoney(from: Date, to: Date) {
  const [txn] = await db
    .select({
      total: sql<number>`count(*)::int`,
      success: sql<number>`count(*) filter (where ${transactions.status} = 'success')::int`,
      failed: sql<number>`count(*) filter (where ${transactions.status} = 'failed')::int`,
      volume: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.status} = 'success'), 0)::text`,
      feeIncome: sql<string>`coalesce(sum(${transactions.customerFee}) filter (where ${transactions.status} = 'success'), 0)::text`,
      feeGst: sql<string>`coalesce(sum(${transactions.customerFeeGst}) filter (where ${transactions.status} = 'success'), 0)::text`,
    })
    .from(transactions)
    .where(and(gte(transactions.createdAt, from), lt(transactions.createdAt, to)));

  const [comm] = await db
    .select({
      gross: sql<string>`coalesce(sum(coalesce(${commissionLedger.grossAmount}, ${commissionLedger.amount})), 0)::text`,
      net: sql<string>`coalesce(sum(${commissionLedger.amount}), 0)::text`,
      tds: sql<string>`coalesce(sum(${commissionLedger.tdsAmount}), 0)::text`,
    })
    .from(commissionLedger)
    .where(
      and(
        gte(commissionLedger.createdAt, from),
        lt(commissionLedger.createdAt, to),
        isNull(commissionLedger.reversedAt),
      ),
    );

  const money = (v: string | undefined) => Number(v ?? 0).toFixed(2);
  return {
    txnCount: txn?.total ?? 0,
    successCount: txn?.success ?? 0,
    failedCount: txn?.failed ?? 0,
    volume: money(txn?.volume),
    feeIncome: money(txn?.feeIncome),
    feeGst: money(txn?.feeGst),
    commissionGross: money(comm?.gross),
    commissionNet: money(comm?.net),
    commissionTds: money(comm?.tds),
  };
}

let commissionHealthCache: { at: number; value: { servicesLosing: number; servicesMissingRole: number } } | null =
  null;

async function commissionHealth() {
  if (commissionHealthCache && Date.now() - commissionHealthCache.at < COMMISSION_HEALTH_TTL_MS) {
    return commissionHealthCache.value;
  }
  const card = await getRateCard();
  const value = {
    servicesLosing: card.services.filter((s) => s.slabs.some((x) => x.underwater)).length,
    servicesMissingRole: card.services.filter((s) => s.slabs.some((x) => x.missingRoles.length > 0)).length,
  };
  commissionHealthCache = { at: Date.now(), value };
  return value;
}

async function databaseHealth(): Promise<{ status: "ok" | "down"; latencyMs: number | null }> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { status: "ok", latencyMs: Date.now() - started };
  } catch {
    return { status: "down", latencyMs: null };
  }
}

/** GET /admin/dashboard — today vs yesterday (IST), queues not covered by /admin/alerts, health. */
export async function getDashboardSummary() {
  const now = new Date();
  const todayStart = istDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  const [today, yesterday, stuck, openDisputes, commission, database, redis] = await Promise.all([
    dayMoney(todayStart, now),
    // Same time window yesterday so the comparison is fair mid-day.
    dayMoney(yesterdayStart, new Date(now.getTime() - DAY_MS)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(
        and(
          inArray(transactions.status, ["initiated", "pending"]),
          lt(transactions.createdAt, new Date(now.getTime() - STUCK_AFTER_MS)),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(disputes)
      .where(inArray(disputes.status, ["raised", "under_review"])),
    commissionHealth().catch(() => null),
    databaseHealth(),
    cachePing(),
  ]);

  return {
    at: now.toISOString(),
    today,
    yesterday,
    queues: {
      stuckTxns: stuck[0]?.n ?? 0,
      openDisputes: openDisputes[0]?.n ?? 0,
    },
    commission,
    health: { api: "ok" as const, database, redis },
  };
}
