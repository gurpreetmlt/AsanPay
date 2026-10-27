/**
 * Redis — cache only.
 * Do NOT use for BullMQ / job queues / durable data. App DB = PostgreSQL.
 */
import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "../utils/logger";

let client: Redis | null = null;

function getClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    client.on("error", (err) => {
      logger.warn({ err }, "Redis cache error (non-fatal)");
    });
  }
  return client;
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    if (redis.status !== "ready") await redis.connect();
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, value, "EX", ttlSeconds);
    } else {
      await redis.set(key, value);
    }
  } catch {
    /* cache miss path — ignore */
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    if (redis.status !== "ready") await redis.connect();
    await redis.del(key);
  } catch {
    /* ignore */
  }
}

export function isCacheEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

/** Health check: "off" when REDIS_URL is unset (cache is optional). */
export async function cachePing(): Promise<"ok" | "down" | "off"> {
  const redis = getClient();
  if (!redis) return "off";
  try {
    if (redis.status !== "ready") await redis.connect();
    return (await redis.ping()) === "PONG" ? "ok" : "down";
  } catch {
    return "down";
  }
}
