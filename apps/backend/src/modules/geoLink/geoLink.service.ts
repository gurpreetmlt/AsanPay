import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { geoLinkRequests } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { evaluateCaptureIpSignal } from "../risk/riskSignal.service";

/**
 * onboarding / aeps: the AsanPay app (same login) scans an `asanpay:geo:` QR.
 * shop / home: signup — the phone camera opens the public https page `/geo/<token>`, no app or login.
 */
export type GeoLinkPurpose = "onboarding" | "aeps" | "shop" | "home";
export const SIGNUP_GEO_PURPOSES = ["shop", "home"] as const;
export type SignupGeoPurpose = (typeof SIGNUP_GEO_PURPOSES)[number];

/** How long the QR on the web stays scannable. */
export const GEO_LINK_SCAN_TTL_MS = 2 * 60 * 1000;
export const SIGNUP_GEO_SCAN_TTL_MS = 10 * 60 * 1000;
/** A verified location may be used by a web submit for this long. */
export const GEO_LINK_USE_TTL_MS = 30 * 60 * 1000;
/** Signup drafts are often finished another day; the captured point stays valid until KYC submit. */
export const SIGNUP_GEO_USE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** GPS fixes worse than this are rejected — indoor Wi-Fi / cell guesses. */
export const GEO_LINK_MAX_ACCURACY_M = 150;

export const SIGNUP_GEO_LOW_ACCURACY_MESSAGE =
  "Location is not accurate enough. Turn on GPS, go near a window and try again.";

/** QR payload the mobile app recognises. */
export const GEO_LINK_QR_PREFIX = "asanpay:geo:";

type Row = typeof geoLinkRequests.$inferSelect;

export function isSignupGeoPurpose(purpose: string): purpose is SignupGeoPurpose {
  return (SIGNUP_GEO_PURPOSES as readonly string[]).includes(purpose);
}

function effectiveStatus(row: Row, now = new Date()): "pending" | "verified" | "used" | "expired" {
  if (row.status === "used") return "used";
  if (row.status === "verified") {
    const useTtl = isSignupGeoPurpose(row.purpose) ? SIGNUP_GEO_USE_TTL_MS : GEO_LINK_USE_TTL_MS;
    return row.verifiedAt && now.getTime() - row.verifiedAt.getTime() <= useTtl ? "verified" : "expired";
  }
  return now <= row.expiresAt ? "pending" : "expired";
}

export async function startGeoLink(userId: string, purpose: GeoLinkPurpose) {
  const token = randomBytes(24).toString("hex");
  const signup = isSignupGeoPurpose(purpose);
  const expiresAt = new Date(Date.now() + (signup ? SIGNUP_GEO_SCAN_TTL_MS : GEO_LINK_SCAN_TTL_MS));
  await db.insert(geoLinkRequests).values({ token, userId, purpose, expiresAt });
  return {
    token,
    qrPayload: `${GEO_LINK_QR_PREFIX}${token}`,
    /** Signup only: the web turns this into `<portal origin>/geo/<token>` for the phone camera. */
    capturePath: signup ? `/geo/${token}` : null,
    expiresAt: expiresAt.toISOString(),
  };
}

async function ownRow(userId: string, token: string): Promise<Row> {
  const [row] = await db.select().from(geoLinkRequests).where(eq(geoLinkRequests.token, token)).limit(1);
  if (!row) throw new HttpError(404, "This location QR is not valid. Tap Fetch Location on the web for a new QR.", "GEO_LINK_NOT_FOUND");
  if (row.userId !== userId) {
    throw new HttpError(
      403,
      "This QR belongs to a different account. Log in to the same AsanPay account on your phone and scan again.",
      "GEO_LINK_OTHER_ACCOUNT",
    );
  }
  return row;
}

export async function getGeoLinkStatus(userId: string, token: string) {
  const row = await ownRow(userId, token);
  const status = effectiveStatus(row);
  const showFix = status === "verified" || (status === "used" && isSignupGeoPurpose(row.purpose));
  return {
    status,
    purpose: row.purpose,
    latitude: showFix && row.latitude ? Number(row.latitude).toFixed(4) : null,
    longitude: showFix && row.longitude ? Number(row.longitude).toFixed(4) : null,
    accuracyMeters: showFix ? row.accuracyMeters : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Phone side: the mobile app posts its GPS for a QR it scanned. */
export async function confirmGeoLink(
  userId: string,
  input: { token: string; latitude: number; longitude: number; accuracyMeters?: number; isMockLocation?: boolean },
) {
  const row = await ownRow(userId, input.token);
  if (isSignupGeoPurpose(row.purpose)) {
    throw new HttpError(
      422,
      "This QR is for signup. Scan it with your phone camera (not the AsanPay app) and allow location.",
      "GEO_LINK_USE_CAMERA",
    );
  }
  const status = effectiveStatus(row);
  if (status === "expired") {
    throw new HttpError(410, "This QR has expired. Tap Fetch Location on the web to get a new QR.", "GEO_LINK_EXPIRED");
  }
  if (status !== "pending") {
    throw new HttpError(409, "This QR was already used. Tap Fetch Location on the web for a new QR.", "GEO_LINK_USED");
  }
  if (input.isMockLocation) {
    throw new HttpError(422, "Turn off mock / fake location apps on your phone, then scan again.", "GEO_LINK_MOCK_LOCATION");
  }
  const accuracy = input.accuracyMeters != null ? Math.round(input.accuracyMeters) : null;
  if (accuracy == null || accuracy > GEO_LINK_MAX_ACCURACY_M) {
    throw new HttpError(
      422,
      `Phone location is not accurate enough${accuracy != null ? ` (±${accuracy} m)` : ""}. Turn on GPS (high accuracy), step near a window and scan again.`,
      "GEO_LINK_LOW_ACCURACY",
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(geoLinkRequests)
    .set({
      status: "verified",
      latitude: input.latitude.toFixed(6),
      longitude: input.longitude.toFixed(6),
      accuracyMeters: accuracy,
      verifiedAt: now,
    })
    .where(and(eq(geoLinkRequests.id, row.id), eq(geoLinkRequests.status, "pending")))
    .returning();
  if (!updated) {
    throw new HttpError(409, "This QR was already used. Tap Fetch Location on the web for a new QR.", "GEO_LINK_USED");
  }

  await insertAuditLog({
    userId,
    action: "geo_link.verified",
    entityType: "geo_link",
    entityId: row.id,
    ipAddress: null,
    userAgent: null,
    metadata: { purpose: row.purpose, accuracyMeters: accuracy },
  });

  return { purpose: row.purpose, accuracyMeters: accuracy };
}

const PUBLIC_NOT_FOUND = "This location link is not valid. Tap Generate new QR on the computer and scan again.";

async function publicRow(token: string): Promise<Row> {
  const [row] = await db.select().from(geoLinkRequests).where(eq(geoLinkRequests.token, token)).limit(1);
  // Only signup links are public; app-scan tokens never resolve here.
  if (!row || !isSignupGeoPurpose(row.purpose)) {
    throw new HttpError(404, PUBLIC_NOT_FOUND, "GEO_LINK_NOT_FOUND");
  }
  return row;
}

/** Public phone page: what to capture and whether the link is still open. No account data. */
export async function getPublicGeoLink(token: string) {
  const row = await publicRow(token);
  const status = effectiveStatus(row);
  return {
    purpose: row.purpose as SignupGeoPurpose,
    status: status === "pending" ? "pending" : status === "expired" ? "expired" : "captured",
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Public phone page: posts the browser's high-accuracy GPS for a signup QR. The token is the credential. */
export async function confirmPublicGeoLink(
  token: string,
  input: { latitude: number; longitude: number; accuracyMeters?: number },
  context: { ipAddress: string | null; userAgent: string | null },
) {
  const row = await publicRow(token);
  const status = effectiveStatus(row);
  if (status === "expired") {
    throw new HttpError(410, "This QR has expired. Tap Generate new QR on the computer and scan again.", "GEO_LINK_EXPIRED");
  }
  if (status !== "pending") {
    throw new HttpError(409, "This location was already captured. You can close this page.", "GEO_LINK_USED");
  }
  const accuracy = input.accuracyMeters != null ? Math.round(input.accuracyMeters) : null;
  if (accuracy == null || accuracy > GEO_LINK_MAX_ACCURACY_M) {
    throw new HttpError(422, SIGNUP_GEO_LOW_ACCURACY_MESSAGE, "GEO_LINK_LOW_ACCURACY");
  }

  const [updated] = await db
    .update(geoLinkRequests)
    .set({
      status: "verified",
      latitude: input.latitude.toFixed(6),
      longitude: input.longitude.toFixed(6),
      accuracyMeters: accuracy,
      verifiedAt: new Date(),
      captureIp: context.ipAddress?.slice(0, 64) ?? null,
    })
    .where(and(eq(geoLinkRequests.id, row.id), eq(geoLinkRequests.status, "pending")))
    .returning();
  if (!updated) {
    throw new HttpError(409, "This location was already captured. You can close this page.", "GEO_LINK_USED");
  }

  await insertAuditLog({
    userId: row.userId,
    action: "geo_link.verified",
    entityType: "geo_link",
    entityId: row.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { purpose: row.purpose, accuracyMeters: accuracy, channel: "phone_browser" },
  });

  void evaluateCaptureIpSignal(row.userId, context.ipAddress, row.purpose, row.id).catch((err: unknown) =>
    logger.error({ err, geoLinkId: row.id }, "capture IP risk signal failed"),
  );

  return { purpose: row.purpose as SignupGeoPurpose, accuracyMeters: accuracy };
}

/** Coordinates of a verified, unused hand-off (4 decimals, as providers expect). */
export async function readVerifiedGeoLink(userId: string, token: string, purpose: GeoLinkPurpose) {
  const row = await ownRow(userId, token);
  if (row.purpose !== purpose || effectiveStatus(row) !== "verified" || !row.latitude || !row.longitude) {
    throw new HttpError(
      422,
      "Shop location is not verified or has expired. Tap Fetch Location and scan the QR with your phone again.",
      "GEO_LINK_NOT_VERIFIED",
    );
  }
  return { id: row.id, latitude: Number(Number(row.latitude).toFixed(4)), longitude: Number(Number(row.longitude).toFixed(4)) };
}

/**
 * Signup KYC submit: server-stored shop / home fix for this user's token. A token already consumed
 * by an earlier submit of the same user stays readable so a rejected KYC can be resubmitted.
 */
export async function readSignupGeoLink(userId: string, token: string, purpose: SignupGeoPurpose) {
  const label = purpose === "shop" ? "Shop location" : "Home location";
  const [row] = await db.select().from(geoLinkRequests).where(eq(geoLinkRequests.token, token)).limit(1);
  const usable =
    row &&
    row.userId === userId &&
    row.purpose === purpose &&
    row.latitude &&
    row.longitude &&
    row.verifiedAt &&
    (row.status === "verified" || row.status === "used") &&
    Date.now() - row.verifiedAt.getTime() <= SIGNUP_GEO_USE_TTL_MS;
  if (!usable) {
    throw new HttpError(
      422,
      `${label} is not captured or has expired. Capture the ${label.toLowerCase()} again, then submit.`,
      purpose === "shop" ? "SHOP_LOCATION_REQUIRED" : "HOME_LOCATION_REQUIRED",
    );
  }
  return {
    id: row.id,
    latitude: Number(row.latitude).toFixed(6),
    longitude: Number(row.longitude).toFixed(6),
    accuracyMeters: row.accuracyMeters,
  };
}

/** A phone-QR fix backs at most one money transaction, and only this soon after the phone sent it. */
export const TXN_GEO_LINK_MAX_AGE_MS = 10 * 60 * 1000;

export const TXN_GEO_LINK_STALE_MESSAGE =
  "Phone location has expired or was already used. Verify your location again, then submit.";

/**
 * Money transactions on the web: the phone-QR fix behind `token`. Read-only — the caller claims
 * it with `claimTxnGeoLink` once the cheaper checks (PIN, biometric) have passed, so a typo does
 * not burn the scan.
 */
export async function readTxnGeoLink(userId: string, token: string) {
  const [row] = await db.select().from(geoLinkRequests).where(eq(geoLinkRequests.token, token)).limit(1);
  const usable =
    row &&
    row.userId === userId &&
    row.purpose === "aeps" &&
    row.status === "verified" &&
    row.latitude &&
    row.longitude &&
    row.verifiedAt &&
    Date.now() - row.verifiedAt.getTime() <= TXN_GEO_LINK_MAX_AGE_MS;
  if (!usable) {
    throw new HttpError(422, TXN_GEO_LINK_STALE_MESSAGE, "LOCATION_EXPIRED", { location: [TXN_GEO_LINK_STALE_MESSAGE] });
  }
  return {
    id: row.id,
    latitude: Number(row.latitude).toFixed(6),
    longitude: Number(row.longitude).toFixed(6),
    accuracyMeters: row.accuracyMeters,
  };
}

/** Single use: fails when a parallel submit already consumed the same scan. */
export async function claimTxnGeoLink(id: string): Promise<void> {
  const [claimed] = await db
    .update(geoLinkRequests)
    .set({ status: "used", usedAt: new Date() })
    .where(and(eq(geoLinkRequests.id, id), eq(geoLinkRequests.status, "verified")))
    .returning({ id: geoLinkRequests.id });
  if (!claimed) {
    throw new HttpError(422, TXN_GEO_LINK_STALE_MESSAGE, "LOCATION_EXPIRED", { location: [TXN_GEO_LINK_STALE_MESSAGE] });
  }
}

export async function markGeoLinkUsed(id: string): Promise<void> {
  await db.update(geoLinkRequests).set({ status: "used", usedAt: new Date() }).where(eq(geoLinkRequests.id, id));
}
