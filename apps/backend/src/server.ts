import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { assertAepsProviderConfig, assertPaySprintProviderConfig, env } from "./config/env";
import { db, pgPool } from "./db/postgres";
import { tenants } from "./db/postgres/schema";
import { deleteExpiredOtpRequests } from "./db/postgres/repositories/otpRequest";
import { bootstrapLedger } from "./modules/bootstrap/systemAccounts";
import { runReconciliation } from "./modules/reconciliation/checks";
import { reconcileStaleTransactions, runDailyReconciliation } from "./modules/transactions/txn.service";
import { runStatementEmailJobs } from "./modules/notifications/userEmail.service";
import { logger } from "./utils/logger";

const OTP_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const DAILY_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Ledger recon across every active tenant. Detection only — never mutates balances. */
async function runLedgerReconciliationSweep(): Promise<void> {
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
  assertAepsProviderConfig();
  assertPaySprintProviderConfig();
  logger.info({ aepsMode: env.AEPS_PROVIDER_MODE }, "AEPS provider mode");

  await pgPool.query("SELECT 1");
  logger.info("PostgreSQL connected");

  // Fail fast. If a system account is missing or has the wrong flags, the ledger cannot post
  // correctly — and a half-initialised financial system is worse than a stopped one. This
  // must run before listen(), never from a route.
  await bootstrapLedger();
  logger.info("Ledger system accounts verified");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`AsanPay backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // No native TTL in Postgres like Mongo had — periodically sweep expired OTP rows.
  const otpSweepTimer = setInterval(() => {
    deleteExpiredOtpRequests().catch((err: unknown) =>
      logger.error({ err }, "failed to sweep expired OTP requests"),
    );
  }, OTP_SWEEP_INTERVAL_MS);

  // Settle pending / crash-stale initiated txns so held wallet money is not stuck forever.
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  if (env.TXN_RECONCILE_INTERVAL_MS > 0) {
    reconcileTimer = setInterval(() => {
      reconcileStaleTransactions()
        .then((r) => {
          if (r.checked > 0) logger.info(r, "txn reconcile sweep");
        })
        .catch((err: unknown) => logger.error({ err }, "txn reconcile sweep failed"));
    }, env.TXN_RECONCILE_INTERVAL_MS);
  }

  // Once-daily full-sweep reconciliation against the provider's live status API.
  const dailyReconcileTimer = setInterval(() => {
    runDailyReconciliation()
      .then((r) => logger.info(r, "daily reconciliation sweep"))
      .catch((err: unknown) => logger.error({ err }, "daily reconciliation sweep failed"));
    runStatementEmailJobs()
      .then((r) => logger.info(r, "statement email jobs"))
      .catch((err: unknown) => logger.error({ err }, "statement email jobs failed"));
  }, DAILY_RECONCILE_INTERVAL_MS);

  // Ledger integrity + ops staleness checks. Env 0 disables; findings go to reconciliation_exceptions only.
  let ledgerReconTimer: ReturnType<typeof setInterval> | null = null;
  if (env.LEDGER_RECON_INTERVAL_MS > 0) {
    ledgerReconTimer = setInterval(() => {
      runLedgerReconciliationSweep().catch((err: unknown) =>
        logger.error({ err }, "ledger reconciliation sweep failed"),
      );
    }, env.LEDGER_RECON_INTERVAL_MS);
    logger.info(
      { intervalMs: env.LEDGER_RECON_INTERVAL_MS },
      "ledger reconciliation cron enabled",
    );
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(otpSweepTimer);
    clearInterval(dailyReconcileTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (ledgerReconTimer) clearInterval(ledgerReconTimer);
    server.close(async () => {
      await pgPool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
