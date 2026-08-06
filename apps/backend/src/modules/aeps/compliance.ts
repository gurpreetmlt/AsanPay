import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { aepsBioMismatchCounters, aepsCashReceipts, users } from "../../db/postgres/schema";
import { env, isInstantPayAepsMode } from "../../config/env";
import { HttpError } from "../../utils/httpError";

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in km between two WGS84 points. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function hashAadhaar(aadhaarNumber: string): string {
  return createHash("sha256").update(aadhaarNumber).digest("hex");
}

export interface AepsGeoInput {
  latitude: string;
  longitude: string;
}

function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Pre-txn gates shared by dummy and InstantPay modes:
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
  // three consecutive months with no transactions. Dummy mode only flags merchants who
  // previously did AEPS then went idle (so seed/test accounts aren't locked by createdAt).
  //
  // The anchor is the LATER of the last transaction and the last admin reactivation. Anchoring
  // on the transaction alone made this a one-way door: a dormant merchant cannot transact, so
  // that timestamp could never advance and the block was permanent.
  const dormantMs = env.AEPS_DORMANCY_DAYS * 24 * 60 * 60 * 1000;
  const txnAnchor = user.lastAepsTxnAt ?? (isInstantPayAepsMode() ? user.createdAt : null);
  const anchor = laterOf(txnAnchor, user.aepsReactivatedAt);
  if (anchor && Date.now() - anchor.getTime() > dormantMs) {
    throw new HttpError(
      403,
      `Merchant dormant (no AePS for ${env.AEPS_DORMANCY_DAYS}+ days) — contact support to re-verify KYC and reactivate`,
      "AEPS_DORMANT",
    );
  }

  if (geo && user.outletLatitude && user.outletLongitude) {
    assertWithinOutletGeofence(user.outletLatitude, user.outletLongitude, geo);
  }
}

/**
 * Shared geofence gate: rejects a transaction whose reported geo is further than
 * AEPS_GEOFENCE_KM from the user's registered outlet. Used by AePS (via assertAepsCompliance)
 * and directly by DMT, since cash-handling fraud risk applies to both rails.
 */
export function assertWithinOutletGeofence(
  outletLatitude: string,
  outletLongitude: string,
  geo: AepsGeoInput,
): void {
  const oLat = Number(outletLatitude);
  const oLng = Number(outletLongitude);
  const tLat = Number(geo.latitude);
  const tLng = Number(geo.longitude);
  if (![oLat, oLng, tLat, tLng].every((n) => Number.isFinite(n))) {
    throw new HttpError(422, "Invalid geo coordinates", "GEO_INVALID");
  }
  const km = haversineKm(oLat, oLng, tLat, tLng);
  if (km > env.AEPS_GEOFENCE_KM) {
    throw new HttpError(
      403,
      `Transaction location is ${km.toFixed(2)} km from outlet (max ${env.AEPS_GEOFENCE_KM} km)`,
      "GEOFENCE_VIOLATION",
    );
  }
}

/** Look up a user's registered outlet coordinates, if any. */
export async function getOutletGeo(userId: string): Promise<{ latitude: string; longitude: string } | null> {
  const [user] = await db
    .select({ outletLatitude: users.outletLatitude, outletLongitude: users.outletLongitude })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.outletLatitude || !user?.outletLongitude) return null;
  return { latitude: user.outletLatitude, longitude: user.outletLongitude };
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

/**
 * Reject biometric captures from RD-service devices whose declared device-provider id (dpId)
 * isn't on our STQC-certified allowlist (Mantra, Morpho/IDEMIA, Precision, etc.). Dummy AePS
 * mode is exempt since it never talks to a real device. Configurable via
 * AEPS_CERTIFIED_DEVICE_PROVIDERS so ops can add a newly certified vendor without a code change.
 */
export function assertCertifiedBiometricDevice(dpId: string): void {
  if (!isInstantPayAepsMode()) return;
  const allowlist = env.AEPS_CERTIFIED_DEVICE_PROVIDERS;
  if (allowlist.length === 0) return;

  const normalized = (dpId || "").trim().toUpperCase();
  const isCertified = normalized.length > 0 && allowlist.some((prefix) => normalized.startsWith(prefix));
  if (!isCertified) {
    throw new HttpError(
      403,
      `Biometric device provider "${dpId || "unknown"}" is not an STQC-certified RD service`,
      "AEPS_DEVICE_NOT_CERTIFIED",
    );
  }
}

/** Pure helper for unit tests — geofence decision without DB. */
export function isWithinGeofence(
  outletLat: number,
  outletLng: number,
  txnLat: number,
  txnLng: number,
  maxKm = env.AEPS_GEOFENCE_KM,
): boolean {
  return haversineKm(outletLat, outletLng, txnLat, txnLng) <= maxKm;
}
