import { createApp } from "./app";
import { assertAepsProviderConfig, assertPaySprintProviderConfig, env } from "./config/env";
import { pgPool } from "./db/postgres";
import { deleteExpiredOtpRequests } from "./db/postgres/repositories/otpRequest";
import { reconcileStaleTransactions } from "./modules/transactions/txn.service";
import { logger } from "./utils/logger";

const OTP_SWEEP_INTERVAL_MS = 30 * 60 * 1000;

async function main() {
  assertAepsProviderConfig();
  assertPaySprintProviderConfig();
  logger.info({ aepsMode: env.AEPS_PROVIDER_MODE }, "AEPS provider mode");

  await pgPool.query("SELECT 1");
  logger.info("PostgreSQL connected");

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

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(otpSweepTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);
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
