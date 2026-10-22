import { createApp } from "./app";
import {
  assertAepsProviderConfig,
  assertNobleAepsProviderConfig,
  assertPaySprintProviderConfig,
  env,
} from "./config/env";
import { pgPool } from "./db/postgres";
import { bootstrapLedger } from "./modules/bootstrap/systemAccounts";
import { logger } from "./utils/logger";

async function main() {
  assertAepsProviderConfig();
  assertPaySprintProviderConfig();
  assertNobleAepsProviderConfig();
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

  void import("./modules/telegram/client").then(({ telegramSetWebhookIfConfigured }) =>
    telegramSetWebhookIfConfigured(),
  );

  // Scheduled work runs in its own process — see src/jobs/index.ts and spec §11.1. Nothing
  // here may hold a pg connection on a timer: this pool belongs to request handlers.

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
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
