import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { geoLinkRequests } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";

export type GeoLinkPurpose = "onboarding" | "aeps";

/** How long the QR on the web stays scannable. */
export const GEO_LINK_SCAN_TTL_MS = 2 * 60 * 1000;
/** A verified location may be used by a web submit for this long. */
export const GEO_LINK_USE_TTL_MS = 30 * 60 * 1000;
/** GPS fixes worse than this are rejected — indoor Wi-Fi / cell guesses. */
export const GEO_LINK_MAX_ACCURACY_M = 150;

/** QR payload the mobile app recognises. */
export const GEO_LINK_QR_PREFIX = "asanpay:geo:";

type Row = typeof geoLinkRequests.$inferSelect;

function effectiveStatus(row: Row, now = new Date()): "pending" | "verified" | "used" | "expired" {
  if (row.status === "used") return "used";
  if (row.status === "verified") {
    return row.verifiedAt && now.getTime() - row.verifiedAt.getTime() <= GEO_LINK_USE_TTL_MS ? "verified" : "expired";
  }
  return now <= row.expiresAt ? "pending" : "expired";
}

export async function startGeoLink(userId: string, purpose: GeoLinkPurpose) {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + GEO_LINK_SCAN_TTL_MS);
  await db.insert(geoLinkRequests).values({ token, userId, purpose, expiresAt });
  return { token, qrPayload: `${GEO_LINK_QR_PREFIX}${token}`, expiresAt: expiresAt.toISOString() };
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
  return {
    status,
    purpose: row.purpose,
    latitude: status === "verified" && row.latitude ? Number(row.latitude).toFixed(4) : null,
    longitude: status === "verified" && row.longitude ? Number(row.longitude).toFixed(4) : null,
    accuracyMeters: status === "verified" ? row.accuracyMeters : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Phone side: the mobile app posts its GPS fix for a QR it scanned. */
export async function confirmGeoLink(
  userId: string,
  input: { token: string; latitude: number; longitude: number; accuracyMeters?: number; isMockLocation?: boolean },
) {
  const row = await ownRow(userId, input.token);
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

export async function markGeoLinkUsed(id: string): Promise<void> {
  await db.update(geoLinkRequests).set({ status: "used", usedAt: new Date() }).where(eq(geoLinkRequests.id, id));
}
