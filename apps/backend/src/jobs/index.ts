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
import { eq } from "drizzle-orm";
import { assertAepsProviderConfig, assertPaySprintProviderConfig, env } from "../config/env";
import { db, pgPool } from "../db/postgres";
import { tenants } from "../db/postgres/schema";
import { deleteExpiredOtpRequests } from "../db/postgres/repositories/otpRequest";
import { runReconciliation } from "../modules/reconciliation/checks";
import { reconcileStaleTransactions, runDailyReconciliation } from "../modules/transactions/txn.service";
import { runStatementEmailJobs } from "../modules/notifications/userEmail.service";
import { sweepLogPartitions } from "./logPartitions";
import { logger } from "../utils/logger";

const OTP_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const DAILY_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PARTITION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

async function main() {
  // The txn sweeps call provider status APIs, so the same config the API asserts must hold here.
  assertAepsProviderConfig();
  assertPaySprintProviderConfig();

  await pgPool.query("SELECT 1");
  logger.info("Jobs worker: PostgreSQL connected");

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

  // Once-daily full-sweep reconciliation against the provider's live status API.
  timers.push(
    setInterval(() => {
      runDailyReconciliation()
        .then((r) => logger.info(r, "daily reconciliation sweep"))
        .catch((err: unknown) => logger.error({ err }, "daily reconciliation sweep failed"));
      runStatementEmailJobs()
        .then((r) => logger.info(r, "statement email jobs"))
        .catch((err: unknown) => logger.error({ err }, "statement email jobs failed"));
    }, DAILY_RECONCILE_INTERVAL_MS),
  );

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
