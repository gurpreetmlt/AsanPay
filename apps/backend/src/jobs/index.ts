/**
 * Scheduled work, as its own process.
 *
 * Spec §11.1: cron must not live inside the API process. A reconciliation sweep walks every
 * account of every tenant and can hold pg connections for a long time; run in-process it
 * competes with request handlers for the same pool, so a slow sweep shows up as slow API
 * responses. Deployed as a second Coolify service off the same image with `npm run start:jobs`.
 *
 * Nothing here moves money on its own. Reconciliation is detection-only (spec §7) and every
 * correction still goes through postJournal() as a RECON_ADJUSTMENT raised by a human.
 */
import { and, eq } from "drizzle-orm";
import { assertNobleAepsProviderConfig, env } from "../config/env";
import { db, pgPool } from "../db/postgres";
import { auditLogs, tenants } from "../db/postgres/schema";
import { insertAuditLog } from "../db/postgres/repositories/auditLog";
import { deleteExpiredOtpRequests } from "../db/postgres/repositories/otpRequest";
import { runReconciliation } from "../modules/reconciliation/checks";
import { reconcileStaleTransactions, runDailyReconciliation } from "../modules/transactions/txn.service";
import { runStatementEmailJobs } from "../modules/notifications/userEmail.service";
import { sweepLogPartitions } from "./logPartitions";
import { runNobleReconTick } from "../modules/providers/noble/reconJob";
import { sweepExpiringRdLicenses } from "../modules/risk/riskSignal.service";
import { listOverdueDisputes } from "../modules/disputes/dispute.service";
import { sendSlackAlert } from "../utils/alert";
import { logger } from "../utils/logger";

const OTP_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const DAILY_CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** Daily jobs run once per IST day, from this hour on — independent of redeploy times. */
const DAILY_RUN_IST_HOUR = 2;
const JOBS_LEADER_LOCK_KEY = 815_204_001;
const PARTITION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RD_LICENSE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const AEPS_RECON_TICK_MS = 15 * 60 * 1000;

/** Ledger recon across every active tenant. Detection only — never mutates balances. */
export async function runLedgerReconciliationSweep(): Promise<void> {
  const active = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  for (const tenant of active) {
    try {
      const findings = await runReconciliation(tenant.id);
      if (findings.length > 0) {
        logger.warn(
          { tenantId: tenant.id, tenantCode: tenant.code, findings: findings.length },
          "ledger reconciliation found exceptions",
        );
      }
    } catch (err: unknown) {
      logger.error(
        { err, tenantId: tenant.id, tenantCode: tenant.code },
        "ledger reconciliation failed for tenant",
      );
    }
  }
}

/** Alerts (never auto-closes) on disputes past their SLA — task #11. */
async function sweepOverdueDisputes(): Promise<void> {
  const active = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  for (const tenant of active) {
    const overdue = await listOverdueDisputes(tenant.id).catch((err: unknown) => {
      logger.error({ err, tenantId: tenant.id }, "overdue dispute lookup failed for tenant");
      return [];
    });
    const pastSla = overdue.filter((d) => d.slaDueAt.getTime() < Date.now());
    if (pastSla.length === 0) continue;

    logger.warn({ tenantId: tenant.id, count: pastSla.length }, "disputes past SLA");
    void sendSlackAlert("Disputes past SLA", "general", {
      tenantCode: tenant.code,
      count: pastSla.length,
      oldestId: pastSla[0]?.id,
      oldestDueAt: pastSla[0]?.slaDueAt.toISOString(),
    });
  }
}

/**
 * Only one jobs worker may run timers (a rolling redeploy briefly starts two). The session-level
 * advisory lock lives on a dedicated connection that is never released while this process runs.
 */
async function acquireLeaderLock(): Promise<void> {
  const client = await pgPool.connect();
  for (;;) {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [
      JOBS_LEADER_LOCK_KEY,
    ]);
    if (rows[0]?.ok) {
      logger.info("Jobs worker: leader lock acquired");
      return;
    }
    logger.warn("Jobs worker: another worker holds the leader lock — standing by");
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

function istDate(d: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Daily reconciliation, statements and dispute alerts — at most once per IST day (marker in audit log). */
async function runDailyJobsIfDue(): Promise<void> {
  const { day, hour } = istDate(new Date());
  if (hour < DAILY_RUN_IST_HOUR) return;
  const [done] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "jobs.daily_run"), eq(auditLogs.entityId, day)))
    .limit(1);
  if (done) return;
  await insertAuditLog({ userId: null, action: "jobs.daily_run", entityType: "jobs", entityId: day, metadata: {} });

  await runDailyReconciliation()
    .then((r) => logger.info(r, "daily reconciliation sweep"))
    .catch((err: unknown) => logger.error({ err }, "daily reconciliation sweep failed"));
  await runStatementEmailJobs()
    .then((r) => logger.info(r, "statement email jobs"))
    .catch((err: unknown) => logger.error({ err }, "statement email jobs failed"));
  await sweepOverdueDisputes().catch((err: unknown) => logger.error({ err }, "overdue dispute sweep failed"));
}

async function main() {
  // The txn sweeps call provider status APIs, so the same config the API asserts must hold here.
  assertNobleAepsProviderConfig();

  await pgPool.query("SELECT 1");
  logger.info("Jobs worker: PostgreSQL connected");
  await acquireLeaderLock();

  const timers: ReturnType<typeof setInterval>[] = [];

  // No native TTL in Postgres like Mongo had — periodically sweep expired OTP rows.
  timers.push(
    setInterval(() => {
      deleteExpiredOtpRequests().catch((err: unknown) =>
        logger.error({ err }, "failed to sweep expired OTP requests"),
      );
    }, OTP_SWEEP_INTERVAL_MS),
  );

  // Settle pending / crash-stale initiated txns so held wallet money is not stuck forever.
  if (env.TXN_RECONCILE_INTERVAL_MS > 0) {
    timers.push(
      setInterval(() => {
        reconcileStaleTransactions()
          .then((r) => {
            if (r.checked > 0) logger.info(r, "txn reconcile sweep");
          })
          .catch((err: unknown) => logger.error({ err }, "txn reconcile sweep failed"));
      }, env.TXN_RECONCILE_INTERVAL_MS),
    );
  }

  // Once-daily full-sweep reconciliation against the provider's live status API. Checked every
  // 10 min so a redeploy never pushes the daily run back by a whole day.
  const dailyTick = () =>
    runDailyJobsIfDue().catch((err: unknown) => logger.error({ err }, "daily jobs check failed"));
  void dailyTick();
  timers.push(setInterval(() => void dailyTick(), DAILY_CHECK_INTERVAL_MS));

  // Ledger integrity + ops staleness checks. Env 0 disables; findings go to
  // reconciliation_exceptions only.
  if (env.LEDGER_RECON_INTERVAL_MS > 0) {
    timers.push(
      setInterval(() => {
        runLedgerReconciliationSweep().catch((err: unknown) =>
          logger.error({ err }, "ledger reconciliation sweep failed"),
        );
      }, env.LEDGER_RECON_INTERVAL_MS),
    );
    logger.info({ intervalMs: env.LEDGER_RECON_INTERVAL_MS }, "ledger reconciliation cron enabled");
  }

  // Log partition maintenance. Run once at boot too: if the worker was down across a month
  // boundary, waiting a full day would leave writes falling into the DEFAULT partition.
  const runPartitionSweep = () =>
    sweepLogPartitions()
      .then((r) => {
        if (r.dropped.length > 0 || r.defaultRows > 0) logger.info(r, "log partition sweep");
      })
      .catch((err: unknown) => logger.error({ err }, "log partition sweep failed"));

  void runPartitionSweep();
  timers.push(setInterval(() => void runPartitionSweep(), PARTITION_SWEEP_INTERVAL_MS));

  // RD licence expiry (task #15) — a large share of "my scanner is broken" tickets are an
  // expired licence, not a dead device. Log-only: writes agent_risk_signals, blocks nothing.
  const runRdLicenseSweep = () =>
    sweepExpiringRdLicenses()
      .then((n) => {
        if (n > 0) logger.info({ flagged: n }, "RD licence expiry sweep");
      })
      .catch((err: unknown) => logger.error({ err }, "RD licence expiry sweep failed"));

  void runRdLicenseSweep();
  timers.push(setInterval(() => void runRdLicenseSweep(), RD_LICENSE_SWEEP_INTERVAL_MS));

  // Daily AEPS recon upload — the provider withholds month-end commission without it.
  const runAepsRecon = () =>
    runNobleReconTick().catch((err: unknown) => logger.error({ err }, "AEPS recon tick failed"));
  void runAepsRecon();
  timers.push(setInterval(() => void runAepsRecon(), AEPS_RECON_TICK_MS));

  logger.info({ timers: timers.length }, "AsanPay jobs worker started");

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, stopping jobs worker`);
    for (const t of timers) clearInterval(t);
    await pgPool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start jobs worker");
  process.exit(1);
});
