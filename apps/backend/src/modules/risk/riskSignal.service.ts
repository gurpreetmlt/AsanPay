/**
 * Log-only device and location risk signals (task #15).
 *
 * Every function here writes a finding and returns — none of them throw, none of them block a
 * transaction or a device registration. The thresholds below are a first guess, not a tuned
 * policy: run for a month, look at how many mock-location flags turn out to be real, then decide
 * what (if anything) should start blocking.
 *
 * Device-sharing (one serial, two agents) is NOT handled here — that is a database constraint
 * in agent_devices, enforced at the moment of registration. This module only covers the softer
 * signal: an honest agent's device changing more often than normal.
 */
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "../../db/postgres";
import { agentDevices, agentRiskSignals } from "../../db/postgres/schema";
import { haversineKm } from "../../core/geo";
import { lookupIpIntel, pincodeCentroid } from "./geoIntel";
import type { RiskSignalSeverity, RiskSignalType } from "../../db/postgres/schema/riskSignals";

async function record(
  userId: string,
  signalType: RiskSignalType,
  severity: RiskSignalSeverity,
  details: Record<string, unknown>,
  referenceId?: string,
): Promise<void> {
  await db.insert(agentRiskSignals).values({
    userId,
    signalType,
    severity,
    referenceId: referenceId ?? null,
    details,
  });
}

export interface GeoSignalInput {
  latitude: string;
  longitude: string;
  /** GPS accuracy in metres, as reported by the client. */
  accuracyMeters?: number;
  /** True when the OS reports the location as coming from a mock provider (Android). */
  isMockLocation?: boolean;
}

const LOW_ACCURACY_THRESHOLD_M = 1000;

/**
 * Evaluate one AePS-style transaction's location data and file whatever findings apply.
 * Call this alongside the existing (blocking) geofence check in modules/aeps/compliance.ts —
 * never instead of it, and never let a finding here change the transaction's outcome.
 *
 *   mock ON                    -> critical, no legitimate reason for it
 *   accuracy > 1km              -> info, and the geofence check should be skipped for this call
 *   no geo at all                -> info, soft signal only
 *   outside outlet geofence,
 *   accuracy otherwise good      -> warn, would gate on distributor OTP once out of log-only
 */
export async function evaluateGeoSignal(
  userId: string,
  txnRef: string,
  geo: GeoSignalInput | null,
  outlet: { latitude: string | null; longitude: string | null },
): Promise<void> {
  if (!geo) {
    await record(userId, "gps_missing", "info", { reason: "no location reported" }, txnRef);
    return;
  }

  if (geo.isMockLocation) {
    await record(
      userId,
      "mock_location",
      "critical",
      { latitude: geo.latitude, longitude: geo.longitude },
      txnRef,
    );
    return;
  }

  if (geo.accuracyMeters !== undefined && geo.accuracyMeters > LOW_ACCURACY_THRESHOLD_M) {
    await record(
      userId,
      "low_accuracy_ignored",
      "info",
      { accuracyMeters: geo.accuracyMeters },
      txnRef,
    );
    return;
  }

  if (!outlet.latitude || !outlet.longitude) return;

  const km = haversineKm(
    Number(outlet.latitude),
    Number(outlet.longitude),
    Number(geo.latitude),
    Number(geo.longitude),
  );
  if (km > 3) {
    await record(
      userId,
      "out_of_zone",
      "warn",
      { distanceKm: Number(km.toFixed(2)), accuracyMeters: geo.accuracyMeters ?? null },
      txnRef,
    );
  }
}

const SHOP_PINCODE_MAX_KM = 25;

/** Signup: shop GPS more than 25 km from the typed shop pincode → warn. Lookup failure = no flag. */
export async function evaluateShopPincodeSignal(
  userId: string,
  shop: { latitude: string; longitude: string },
  pincode: string | null | undefined,
): Promise<void> {
  if (!pincode) return;
  const centre = await pincodeCentroid(pincode);
  if (!centre) return;
  const km = haversineKm(centre.lat, centre.lng, Number(shop.latitude), Number(shop.longitude));
  if (!Number.isFinite(km) || km <= SHOP_PINCODE_MAX_KM) return;
  await record(userId, "shop_far_from_pincode", "warn", {
    pincode,
    distanceKm: Number(km.toFixed(1)),
    maxKm: SHOP_PINCODE_MAX_KM,
  });
}

/** Signup: the phone that captured a shop / home location was on a foreign IP or a proxy → "Possible VPN". */
export async function evaluateCaptureIpSignal(
  userId: string,
  ip: string | null | undefined,
  purpose: string,
  referenceId: string,
): Promise<void> {
  const intel = await lookupIpIntel(ip);
  if (!intel) return;
  const foreign = intel.country != null && intel.country !== "IN";
  if (!foreign && !intel.proxy) return;
  await record(
    userId,
    "possible_vpn",
    "warn",
    {
      label: "Possible VPN",
      purpose,
      country: intel.country,
      proxy: intel.proxy,
      sources: intel.sources,
    },
    referenceId,
  );
}

/** Signup: the app reported a rooted / jailbroken phone when it captured the shop or home location. */
export async function recordRootedDeviceSignal(userId: string, purposes: string[]): Promise<void> {
  await record(userId, "rooted_device", "warn", { purposes, source: "signup_location" });
}

/**
 * Device serial change frequency. Called after a successful registration in
 * modules/devices/agentDevice.service.ts. Counts registrations in the trailing week and month —
 * deliberately excludes the one just created from the "first ever device" case, since an agent's
 * very first registration is not a change.
 *
 *   3+ in a week   -> device_change_investigate (would gate services off, once out of log-only)
 *   3+ in a month   -> device_change_flag (would notify the distributor)
 *   fewer            -> nothing written; 2-3 a year is normal churn
 */
export async function evaluateDeviceChangeVelocity(userId: string): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentWeek = await db
    .select({ id: agentDevices.id })
    .from(agentDevices)
    .where(and(eq(agentDevices.userId, userId), gte(agentDevices.registeredAt, weekAgo)));

  if (recentWeek.length >= 3) {
    await record(userId, "device_change_investigate", "critical", {
      windowDays: 7,
      count: recentWeek.length,
    });
    return;
  }

  const recentMonth = await db
    .select({ id: agentDevices.id })
    .from(agentDevices)
    .where(and(eq(agentDevices.userId, userId), gte(agentDevices.registeredAt, monthAgo)));

  if (recentMonth.length >= 3) {
    await record(userId, "device_change_flag", "warn", {
      windowDays: 30,
      count: recentMonth.length,
    });
  }
}

/**
 * RD licence expiry, across all agents. Run daily from the jobs process (see src/jobs/index.ts).
 * A large share of "my scanner is broken" tickets are an expired licence — this is what makes
 * the two distinguishable before the agent even notices.
 */
export async function sweepExpiringRdLicenses(withinDays = 15): Promise<number> {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const expiring = await db
    .select({
      id: agentDevices.id,
      userId: agentDevices.userId,
      serial: agentDevices.serial,
      expiry: agentDevices.rdLicenseExpiry,
    })
    .from(agentDevices)
    .where(
      and(
        isNull(agentDevices.deregisteredAt),
        gte(agentDevices.rdLicenseExpiry, new Date()),
        lt(agentDevices.rdLicenseExpiry, cutoff),
      ),
    );

  let written = 0;
  for (const row of expiring) {
    // The job runs daily; skip a device already flagged in the last 20h so a restart or a
    // slightly-early re-run doesn't spam the same finding.
    const [already] = await db
      .select({ id: agentRiskSignals.id })
      .from(agentRiskSignals)
      .where(
        and(
          eq(agentRiskSignals.referenceId, row.id),
          eq(agentRiskSignals.signalType, "rd_license_expiring"),
          gte(agentRiskSignals.createdAt, new Date(Date.now() - 20 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);
    if (already) continue;

    await record(
      row.userId,
      "rd_license_expiring",
      "info",
      { serial: row.serial, expiresAt: row.expiry!.toISOString() },
      row.id,
    );
    written += 1;
  }

  return written;
}
