import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/postgres";
import { tenants } from "../../db/postgres/schema";
import { env, shopGeofenceKm } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { resolveTenantId } from "../fund-requests/tenant";

/** Admin-editable location limits, stored at `tenants.settings.geofence`. */
export interface StoredGeofence {
  enabled?: boolean;
  shopKm?: number;
  homeKm?: number;
}

export type GeofenceSource = "admin" | "server";

/** Effective limits used by the service geofence gate. */
export interface GeofenceLimits {
  enabled: boolean;
  shopKm: number;
  homeKm: number;
  /** "server" = env (SHOP_GEOFENCE_KM / HOME_GEOFENCE_KM / legacy AEPS_GEOFENCE_KM) or built-in default. */
  shopKmSource: GeofenceSource;
  homeKmSource: GeofenceSource;
}

export const GEOFENCE_BOUNDS = {
  shopKm: { min: 1, max: 50 },
  homeKm: { min: 1, max: 20 },
} as const;

const SHOP_RANGE_MSG = `Shop radius must be between ${GEOFENCE_BOUNDS.shopKm.min} and ${GEOFENCE_BOUNDS.shopKm.max} km`;
const HOME_RANGE_MSG = `Home radius must be between ${GEOFENCE_BOUNDS.homeKm.min} and ${GEOFENCE_BOUNDS.homeKm.max} km`;

export const geofencePatchSchema = z
  .object({
    enabled: z.boolean({ error: "Location check must be on or off" }).optional(),
    shopKm: z
      .number({ error: SHOP_RANGE_MSG })
      .min(GEOFENCE_BOUNDS.shopKm.min, SHOP_RANGE_MSG)
      .max(GEOFENCE_BOUNDS.shopKm.max, SHOP_RANGE_MSG)
      .optional(),
    homeKm: z
      .number({ error: HOME_RANGE_MSG })
      .min(GEOFENCE_BOUNDS.homeKm.min, HOME_RANGE_MSG)
      .max(GEOFENCE_BOUNDS.homeKm.max, HOME_RANGE_MSG)
      .optional(),
  }, { error: "Location limits must be an object with enabled, shopKm and homeKm" });

/** Validate a PATCH body's `geofence` value; throws a 422 naming the bad field. */
export function parseGeofencePatch(raw: unknown): StoredGeofence {
  const parsed = geofencePatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues[0]?.message ?? SHOP_RANGE_MSG, "INVALID_GEOFENCE");
  }
  return parsed.data;
}

function inRange(v: unknown, bounds: { min: number; max: number }): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= bounds.min && v <= bounds.max;
}

export function serverGeofenceLimits(): { shopKm: number; homeKm: number } {
  return { shopKm: shopGeofenceKm(), homeKm: env.HOME_GEOFENCE_KM };
}

/** Pure: admin setting → server (env / default). Out-of-range stored values are ignored. */
export function resolveGeofenceLimits(
  stored: unknown,
  server: { shopKm: number; homeKm: number },
): GeofenceLimits {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as StoredGeofence) : {};
  const shopAdmin = inRange(s.shopKm, GEOFENCE_BOUNDS.shopKm);
  const homeAdmin = inRange(s.homeKm, GEOFENCE_BOUNDS.homeKm);
  return {
    enabled: s.enabled !== false,
    shopKm: shopAdmin ? (s.shopKm as number) : server.shopKm,
    homeKm: homeAdmin ? (s.homeKm as number) : server.homeKm,
    shopKmSource: shopAdmin ? "admin" : "server",
    homeKmSource: homeAdmin ? "admin" : "server",
  };
}

const CACHE_TTL_MS = 30_000;
let cached: { value: GeofenceLimits; expiresAt: number } | null = null;

/** Effective limits for the txn gate. Cached ~30 s per process; PATCH invalidates. */
export async function getGeofenceLimits(): Promise<GeofenceLimits> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let stored: unknown;
  try {
    const tenantId = await resolveTenantId();
    const [row] = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    stored = (row?.settings as Record<string, unknown> | undefined)?.geofence;
  } catch (err) {
    // Keep the last known (stale) value, else server limits — never fail every transaction.
    logger.warn({ err }, "geofence settings lookup failed — using last known or server limits");
    return cached?.value ?? resolveGeofenceLimits(undefined, serverGeofenceLimits());
  }
  const value = resolveGeofenceLimits(stored, serverGeofenceLimits());
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export function invalidateGeofenceLimits(): void {
  cached = null;
}
