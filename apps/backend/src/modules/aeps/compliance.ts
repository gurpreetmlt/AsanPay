import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { aepsBioMismatchCounters, aepsCashReceipts, users } from "../../db/postgres/schema";
import { env, shopGeofenceKm } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { evaluateGeoSignal } from "../risk/riskSignal.service";
import { haversineKm } from "../../core/geo";
import { getGeofenceLimits } from "../tenants/geofenceSettings";
import { claimTxnGeoLink, readTxnGeoLink } from "../geoLink/geoLink.service";

// Re-exported for backward compatibility — haversineKm moved to core/geo to break a circular
// import with risk/riskSignal.service.ts, which also needs it and is imported here.
export { haversineKm };

export function hashAadhaar(aadhaarNumber: string): string {
  return createHash("sha256").update(aadhaarNumber).digest("hex");
}

export interface AepsGeoInput {
  latitude: string;
  longitude: string;
  /** GPS accuracy in metres, when the client reports it. */
  accuracyMeters?: number;
  /** True when the OS flags the location as coming from a mock provider (Android). */
  isMockLocation?: boolean;
}

export const LOCATION_REQUIRED_MESSAGE = "Allow location access before continuing";
const LOCATION_INVALID_MESSAGE = "Location is not valid. Allow location access and try again.";

export interface LiveTxnGeoInput {
  latitude?: string;
  longitude?: string;
  accuracyMeters?: number;
  isMockLocation?: boolean;
  /** Web fallback when the browser blocks location: a phone-QR fix verified on the server. */
  geoLinkToken?: string;
}

export interface LiveTxnGeo {
  geo: AepsGeoInput;
  /** Consumes the phone-QR fix (no-op for a device fix). Call right before moving money. */
  claim: () => Promise<void>;
}

/**
 * Money transactions (DMT transfer, AePS withdrawal / deposit, Aadhaar Pay) need a live fix:
 * device lat/lng from the body, else a fresh single-use phone-QR fix. The saved shop point is
 * never a substitute.
 */
export async function resolveLiveTxnGeo(userId: string, input: LiveTxnGeoInput): Promise<LiveTxnGeo> {
  const lat = input.latitude?.trim() ?? "";
  const lng = input.longitude?.trim() ?? "";
  if (lat && lng) {
    const la = Number(lat);
    const ln = Number(lng);
    const valid =
      Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
    if (!valid) {
      throw new HttpError(422, LOCATION_INVALID_MESSAGE, "LOCATION_INVALID", { location: [LOCATION_INVALID_MESSAGE] });
    }
    return {
      geo: { latitude: lat, longitude: lng, accuracyMeters: input.accuracyMeters, isMockLocation: input.isMockLocation },
      claim: async () => {},
    };
  }
  if (input.geoLinkToken) {
    const fix = await readTxnGeoLink(userId, input.geoLinkToken);
    return {
      geo: { latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: fix.accuracyMeters ?? undefined },
      claim: () => claimTxnGeoLink(fix.id),
    };
  }
  throw new HttpError(422, LOCATION_REQUIRED_MESSAGE, "LOCATION_REQUIRED", { location: [LOCATION_REQUIRED_MESSAGE] });
}

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Pre-txn gates shared by every AePS rail:
 * KYC verified, not AEPS-blocked, not EDD-locked, not dormant, within geofence.
 */
export async function assertAepsCompliance(
  userId: string,
  geo?: AepsGeoInput | null,
): Promise<void> {
  const [user] = await db
    .select({
      isActive: users.isActive,
      kycStatus: users.kycStatus,
      aepsEddRequired: users.aepsEddRequired,
      aepsBlockReason: users.aepsBlockReason,
      lastAepsTxnAt: users.lastAepsTxnAt,
      aepsReactivatedAt: users.aepsReactivatedAt,
      createdAt: users.createdAt,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
      homeLatitude: users.homeLatitude,
      homeLongitude: users.homeLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user || !user.isActive) {
    throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  }
  if (user.kycStatus !== "verified") {
    throw new HttpError(403, "Complete KYC before AePS transactions", "KYC_REQUIRED");
  }
  if (user.aepsBlockReason) {
    throw new HttpError(
      403,
      `AePS blocked: ${user.aepsBlockReason}. Complete EDD / contact support.`,
      "AEPS_BLOCKED",
    );
  }
  if (user.aepsEddRequired) {
    throw new HttpError(
      403,
      "Extended Due Diligence required before further AePS transactions",
      "AEPS_EDD_REQUIRED",
    );
  }

  // RBI's AePS Touchpoint Operator Directions (in force 1 Jan 2026) require fresh KYC after
  // three consecutive months with no transactions. Only merchants who previously did AEPS then
  // went idle are flagged (so seed/test accounts aren't locked by createdAt).
  //
  // The anchor is the LATER of the last transaction and the last admin reactivation. Anchoring
  // on the transaction alone made this a one-way door: a dormant merchant cannot transact, so
  // that timestamp could never advance and the block was permanent.
  const dormantMs = env.AEPS_DORMANCY_DAYS * 24 * 60 * 60 * 1000;
  const anchor = laterOf(user.lastAepsTxnAt, user.aepsReactivatedAt);
  if (anchor && Date.now() - anchor.getTime() > dormantMs) {
    throw new HttpError(
      403,
      `Merchant dormant (no AePS for ${env.AEPS_DORMANCY_DAYS}+ days) — contact support to re-verify KYC and reactivate`,
      "AEPS_DORMANT",
    );
  }

  // Log-only risk signals (task #15) — mock location, low accuracy, missing GPS, out-of-zone.
  // Deliberately fire-and-forget: a write failure here must never fail a transaction, and the
  // whole point of this phase is that nothing here is allowed to change the outcome below.
  const txnRef = `${userId}:${Date.now()}`;
  void evaluateGeoSignal(userId, txnRef, geo ?? null, {
    latitude: user.outletLatitude,
    longitude: user.outletLongitude,
  }).catch((err: unknown) => logger.error({ err, userId }, "geo risk signal evaluation failed"));

  if (geo) {
    await assertWithinServiceGeofence(
      toServiceGeoAnchors(user.outletLatitude, user.outletLongitude, user.homeLatitude, user.homeLongitude),
      geo,
    );
  }
}

type GeoPoint = { latitude: string; longitude: string };

/** Registered points a transaction may happen near. Either may be missing (older accounts). */
export interface ServiceGeoAnchors {
  shop: GeoPoint | null;
  home: GeoPoint | null;
}

function toServiceGeoAnchors(
  outletLatitude: string | null,
  outletLongitude: string | null,
  homeLatitude: string | null,
  homeLongitude: string | null,
): ServiceGeoAnchors {
  return {
    shop: outletLatitude && outletLongitude ? { latitude: outletLatitude, longitude: outletLongitude } : null,
    home: homeLatitude && homeLongitude ? { latitude: homeLatitude, longitude: homeLongitude } : null,
  };
}

/**
 * Shared geofence gate: allowed within the shop radius OR within the home radius (admin
 * Platform Settings → Location limits, else env, else 15 / 5 km). No-op when the user has
 * neither point or an admin turned the check off. Used by AePS (via assertAepsCompliance) and
 * directly by DMT, since cash-handling fraud risk applies to both rails.
 */
export async function assertWithinServiceGeofence(anchors: ServiceGeoAnchors, geo: AepsGeoInput): Promise<void> {
  if (!anchors.shop && !anchors.home) return;
  const limits = await getGeofenceLimits();
  if (!limits.enabled) return;
  const tLat = Number(geo.latitude);
  const tLng = Number(geo.longitude);
  const points = [anchors.shop, anchors.home].filter((p): p is GeoPoint => p != null);
  const coords = points.flatMap((p) => [Number(p.latitude), Number(p.longitude)]);
  if (![tLat, tLng, ...coords].every((n) => Number.isFinite(n))) {
    throw new HttpError(422, "Invalid geo coordinates", "GEO_INVALID");
  }
  const decision = serviceGeofenceDecision(
    {
      shop: anchors.shop ? { lat: Number(anchors.shop.latitude), lng: Number(anchors.shop.longitude) } : null,
      home: anchors.home ? { lat: Number(anchors.home.latitude), lng: Number(anchors.home.longitude) } : null,
    },
    tLat,
    tLng,
    limits,
  );
  if (decision.allowed) return;
  const parts: string[] = [];
  if (decision.shopKm != null) parts.push(`${decision.shopKm.toFixed(1)} km from your shop (max ${decision.shopMaxKm} km)`);
  if (decision.homeKm != null) parts.push(`${decision.homeKm.toFixed(1)} km from your home (max ${decision.homeMaxKm} km)`);
  throw new HttpError(
    403,
    `You are ${parts.join(" and ")}. Services work only near your registered shop or home location.`,
    "GEOFENCE_VIOLATION",
  );
}

/** Look up a user's registered shop + home coordinates. */
export async function getServiceGeoAnchors(userId: string): Promise<ServiceGeoAnchors> {
  const [user] = await db
    .select({
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
      homeLatitude: users.homeLatitude,
      homeLongitude: users.homeLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return { shop: null, home: null };
  return toServiceGeoAnchors(user.outletLatitude, user.outletLongitude, user.homeLatitude, user.homeLongitude);
}

/** Record a biometric mismatch; block + EDD after AEPS_BIO_MISMATCH_LIMIT consecutive fails. */
export async function recordBiometricMismatch(userId: string, aadhaarNumber: string): Promise<void> {
  const aadhaarHash = hashAadhaar(aadhaarNumber);
  const [existing] = await db
    .select()
    .from(aepsBioMismatchCounters)
    .where(and(eq(aepsBioMismatchCounters.userId, userId), eq(aepsBioMismatchCounters.aadhaarHash, aadhaarHash)));

  const next = (existing?.consecutiveMismatches ?? 0) + 1;
  const now = new Date();
  if (existing) {
    await db
      .update(aepsBioMismatchCounters)
      .set({ consecutiveMismatches: next, updatedAt: now })
      .where(eq(aepsBioMismatchCounters.id, existing.id));
  } else {
    await db.insert(aepsBioMismatchCounters).values({
      userId,
      aadhaarHash,
      consecutiveMismatches: next,
      updatedAt: now,
    });
  }

  if (next >= env.AEPS_BIO_MISMATCH_LIMIT) {
    await db
      .update(users)
      .set({
        aepsEddRequired: true,
        aepsBlockReason: "biometric_mismatch_limit",
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  }
}

/** Reset mismatch streak after a successful customer biometric txn. */
export async function clearBiometricMismatch(userId: string, aadhaarNumber: string): Promise<void> {
  const aadhaarHash = hashAadhaar(aadhaarNumber);
  await db
    .update(aepsBioMismatchCounters)
    .set({ consecutiveMismatches: 0, updatedAt: new Date() })
    .where(and(eq(aepsBioMismatchCounters.userId, userId), eq(aepsBioMismatchCounters.aadhaarHash, aadhaarHash)));
}

export async function touchLastAepsTxn(userId: string): Promise<void> {
  const now = new Date();
  await db.update(users).set({ lastAepsTxnAt: now, updatedAt: now }).where(eq(users.id, userId));
}

export async function recordCashReceipt(input: {
  userId: string;
  txnId?: string | null;
  txnRef?: string | null;
  amount: string;
  customerMobile?: string;
  bankIin?: string;
  notes?: string;
  latitude?: string;
  longitude?: string;
}): Promise<void> {
  const mobile = input.customerMobile?.replace(/\D/g, "") ?? "";
  const masked = mobile.length >= 4 ? `XXXXXX${mobile.slice(-4)}` : null;
  await db.insert(aepsCashReceipts).values({
    userId: input.userId,
    txnId: input.txnId ?? null,
    txnRef: input.txnRef ?? null,
    amount: input.amount,
    customerMobileMasked: masked,
    bankIin: input.bankIin ?? null,
    notes: input.notes ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  });
}

/** Pure helper for unit tests — single-point geofence decision without DB. */
export function isWithinGeofence(
  outletLat: number,
  outletLng: number,
  txnLat: number,
  txnLng: number,
  maxKm = shopGeofenceKm(),
): boolean {
  return haversineKm(outletLat, outletLng, txnLat, txnLng) <= maxKm;
}

type LatLng = { lat: number; lng: number };

/**
 * Pure helper — shop OR home decision. No anchors at all = allowed (nothing registered yet);
 * `enabled: false` (admin turned the check off) = allowed.
 */
export function serviceGeofenceDecision(
  anchors: { shop: LatLng | null; home: LatLng | null },
  txnLat: number,
  txnLng: number,
  limits: { shopKm?: number; homeKm?: number; enabled?: boolean } = {},
): { allowed: boolean; shopKm: number | null; homeKm: number | null; shopMaxKm: number; homeMaxKm: number } {
  const shopMaxKm = limits.shopKm ?? shopGeofenceKm();
  const homeMaxKm = limits.homeKm ?? env.HOME_GEOFENCE_KM;
  const shopKm = anchors.shop ? haversineKm(anchors.shop.lat, anchors.shop.lng, txnLat, txnLng) : null;
  const homeKm = anchors.home ? haversineKm(anchors.home.lat, anchors.home.lng, txnLat, txnLng) : null;
  const allowed =
    limits.enabled === false ||
    (shopKm == null && homeKm == null) ||
    (shopKm != null && shopKm <= shopMaxKm) ||
    (homeKm != null && homeKm <= homeMaxKm);
  return { allowed, shopKm, homeKm, shopMaxKm, homeMaxKm };
}
