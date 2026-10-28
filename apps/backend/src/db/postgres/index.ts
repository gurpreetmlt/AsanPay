import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import * as schema from "./schema";

/**
 * RDS: verified TLS with the Amazon CA bundle (DATABASE_SSL_CA_PATH). `sslmode` is removed from the
 * URL because pg would otherwise build its own ssl config from it and ignore the CA we pass.
 */
function poolConfig(): PoolConfig {
  const base: PoolConfig = {
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    idle_in_transaction_session_timeout: 60_000,
  };
  if (!env.DATABASE_SSL_CA_PATH) return { ...base, connectionString: env.DATABASE_URL };

  const url = new URL(env.DATABASE_URL);
  url.searchParams.delete("sslmode");
  return {
    ...base,
    connectionString: url.toString(),
    ssl: { ca: readFileSync(env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true },
  };
}

export const pgPool = new Pool(poolConfig());

// An idle client dropped by the server (RDS reboot / failover) emits here; without a listener the
// process crashes. The pool replaces the client on the next checkout.
pgPool.on("error", (err) => {
  logger.error({ err }, "PostgreSQL idle client error");
});

export const db = drizzle(pgPool, { schema });

export type Database = typeof db;
