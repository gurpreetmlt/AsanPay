import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, or } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db } from "../../db/postgres";
import { devices, loginApprovals, pushTokens, users } from "../../db/postgres/schema";
import type { LoginLocationStatus } from "../../db/postgres/schema/loginApprovals";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { findDevice } from "../../db/postgres/repositories/device";
import { env } from "../../config/env";
import { haversineKm } from "../../core/geo";
import { hashToken } from "../../utils/uid";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { isPushConfigured, sendPushToUser } from "../push/push.sender";
import { recordWebLoginDeniedSignal, recordWebLoginLocationSignal } from "../risk/riskSignal.service";

export const LOGIN_APPROVAL_TTL_MS = 2 * 60 * 1000;
/** After the tap, the browser has this long to collect its session. */
const APPROVED_PICKUP_MS = 2 * 60 * 1000;
const TRUSTED_BROWSER_TTL_S = 24 * 60 * 60;
const TRUSTED_BROWSER_TYPE = "trusted_browser";
const QR_PREFIX = "asanpay:login:";

/** Phone GPS vs registered shop. First guesses — tune after a month of real data. */
const NEAR_KM = 5;
const FAR_KM = 50;
/** A fix worse than this says nothing about distance. */
const MAX_TRUSTED_ACCURACY_M = 1000;

type AuthContext = { ipAddress: string | null; userAgent: string | null };
type LoginApprovalRow = typeof loginApprovals.$inferSelect;

export type PhoneFix = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  isMockLocation?: boolean;
};

export type LoginApprovalChallenge = {
  approvalRequired: true;
  approvalId: string;
  matchNumber: number;
  /** Secret the browser sends when polling — never sent to the phone. */
  pollToken: string;
  expiresAt: string;
  expiresInSeconds: number;
};

const NOT_FOUND = new HttpError(
  404,
  "This login request was not found. Sign in again on the web.",
  "LOGIN_APPROVAL_NOT_FOUND",
);
const EXPIRED = new HttpError(
  410,
  "This login request expired after 2 minutes. Sign in again on the web to get a new request.",
  "LOGIN_APPROVAL_EXPIRED",
);
const ALREADY_USED = new HttpError(
  409,
  "This login was already completed. Sign in again if you were signed out.",
  "LOGIN_APPROVAL_USED",
);
const QR_INVALID = new HttpError(
  422,
  "This is not a valid AsanPay login QR. Refresh the QR on the web login page and scan again.",
  "QR_LOGIN_INVALID",
);
const QR_EXPIRED = new HttpError(
  410,
  "This QR has expired. The web login page shows a new QR — scan that one.",
  "LOGIN_APPROVAL_EXPIRED",
);
const MOCK_BLOCKED = new HttpError(
  422,
  "Your phone reported a fake location. Turn off mock / fake location apps, then sign in again on the web.",
  "LOGIN_APPROVAL_MOCK_LOCATION",
);

/** Binds trust to the current password so a password change ends it. */
function passwordFingerprint(passwordHash: string): string {
  return hashToken(passwordHash).slice(0, 16);
}

export function signTrustedBrowserToken(
  user: { id: string; passwordHash: string },
  deviceId: string | null,
): { token: string; expiresAt: string } {
  const token = jwt.sign(
    {
      sub: user.id,
      type: TRUSTED_BROWSER_TYPE,
      pwf: passwordFingerprint(user.passwordHash),
      ...(deviceId ? { dev: deviceId } : {}),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: TRUSTED_BROWSER_TTL_S, algorithm: "HS256" },
  );
  return { token, expiresAt: new Date(Date.now() + TRUSTED_BROWSER_TTL_S * 1000).toISOString() };
}

function isTrustedBrowser(
  token: string | undefined,
  user: { id: string; passwordHash: string },
  deviceId: string | undefined,
): boolean {
  if (!token) return false;
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as {
      sub?: string;
      type?: string;
      pwf?: string;
      dev?: string;
    };
    return (
      p.type === TRUSTED_BROWSER_TYPE &&
      p.sub === user.id &&
      p.pwf === passwordFingerprint(user.passwordHash) &&
      (!p.dev || p.dev === deviceId)
    );
  } catch {
    return false;
  }
}

/** Device ids of non-revoked trusted devices that also have a push token. */
async function listApprovalPhoneIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ deviceId: pushTokens.deviceId })
    .from(pushTokens)
    .innerJoin(
      devices,
      and(eq(devices.userId, pushTokens.userId), eq(devices.deviceId, pushTokens.deviceId)),
    )
    .where(and(eq(pushTokens.userId, userId), isNull(devices.revokedAt)));
  return rows.map((r) => r.deviceId);
}

/** "Chrome on macOS" from the forwarded User-Agent; the client's deviceLabel when the UA is unknown. */
function browserLabel(deviceLabel: string | undefined, userAgent: string | null): string {
  const fromUa = labelFromUserAgent(userAgent ?? "");
  if (fromUa) return fromUa;
  return deviceLabel?.trim() ? deviceLabel.trim().slice(0, 150) : "Web browser";
}

function labelFromUserAgent(ua: string): string | null {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  if (!browser) return null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** 2-digit number shown on the web + three shuffled choices for the phone. */
function pickMatchNumbers(): { matchNumber: number; choices: number[] } {
  const matchNumber = randomInt(10, 100);
  const set = new Set([matchNumber]);
  while (set.size < 3) set.add(randomInt(10, 100));
  const choices = [...set];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  return { matchNumber, choices };
}

function secretMatches(storedHash: string, candidate: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidate), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type LocationVerdict = {
  phoneLatitude: string;
  phoneLongitude: string;
  phoneAccuracyM: number | null;
  phoneMock: boolean | null;
  phoneIp: string | null;
  sameNetwork: boolean | null;
  distanceKm: number | null;
  locationStatus: LoginLocationStatus;
};

/** Phone GPS → distance to the registered shop, fake-GPS flag, and same public IP as the browser. */
async function evaluatePhoneLocation(
  userId: string,
  fix: PhoneFix,
  phoneIp: string | null,
  browserIp: string | null,
): Promise<LocationVerdict> {
  const accuracy = fix.accuracyMeters != null && Number.isFinite(fix.accuracyMeters) ? Math.round(fix.accuracyMeters) : null;
  const base = {
    phoneLatitude: fix.latitude.toFixed(6),
    phoneLongitude: fix.longitude.toFixed(6),
    phoneAccuracyM: accuracy,
    phoneMock: fix.isMockLocation ?? null,
    phoneIp: phoneIp?.slice(0, 64) ?? null,
    sameNetwork: phoneIp && browserIp ? phoneIp === browserIp : null,
  };
  if (fix.isMockLocation) return { ...base, distanceKm: null, locationStatus: "mock" };

  const [shop] = await db
    .select({ lat: users.outletLatitude, lng: users.outletLongitude })
    .from(users)
    .where(eq(users.id, userId));
  const shopLat = Number(shop?.lat);
  const shopLng = Number(shop?.lng);
  if (!shop?.lat || !shop?.lng || !Number.isFinite(shopLat) || !Number.isFinite(shopLng)) {
    return { ...base, distanceKm: null, locationStatus: "unknown" };
  }
  const km = haversineKm(fix.latitude, fix.longitude, shopLat, shopLng);
  const distanceKm = Math.round(km * 10) / 10;
  if (accuracy != null && accuracy > MAX_TRUSTED_ACCURACY_M) return { ...base, distanceKm, locationStatus: "unknown" };
  return { ...base, distanceKm, locationStatus: km <= NEAR_KM ? "ok" : km <= FAR_KM ? "near" : "far" };
}

/**
 * Web sign-in gate. Password login: enforced for every client — when the user has a trusted
 * phone with push and this device is neither that phone nor a browser approved in the last day,
 * the login needs a tap (clients without the wait screen get LOGIN_APPROVAL_REQUIRED). OTP login:
 * only for clients with the wait screen (agent web), so the mobile app's OTP stays the fallback.
 * Null means "log in as today" (no phone, push off or not delivered).
 */
export async function startLoginApproval(input: {
  user: { id: string; passwordHash: string };
  method: "password" | "otp";
  supportsLoginApproval?: boolean;
  trustedBrowserToken?: string;
  deviceId?: string;
  deviceLabel?: string;
  context: AuthContext;
}): Promise<LoginApprovalChallenge | null> {
  const { user, context } = input;
  if (input.method === "otp" && !input.supportsLoginApproval) return null;
  if (isTrustedBrowser(input.trustedBrowserToken, user, input.deviceId)) return null;
  if (!isPushConfigured()) return null;
  const phones = await listApprovalPhoneIds(user.id);
  if (phones.length === 0 || (input.deviceId && phones.includes(input.deviceId))) return null;
  if (!input.supportsLoginApproval) {
    throw new HttpError(
      403,
      "Password login on a new device needs approval from your AsanPay app. Use OTP login instead.",
      "LOGIN_APPROVAL_REQUIRED",
    );
  }

  // Only the newest request can be approved.
  await db
    .update(loginApprovals)
    .set({ status: "expired" })
    .where(
      and(
        eq(loginApprovals.userId, user.id),
        eq(loginApprovals.status, "pending"),
        ne(loginApprovals.loginMethod, "qr"),
      ),
    );

  const pollToken = randomBytes(32).toString("base64url");
  const { matchNumber, choices } = pickMatchNumbers();
  const browser = browserLabel(input.deviceLabel, context.userAgent);
  const expiresAt = new Date(Date.now() + LOGIN_APPROVAL_TTL_MS);

  const [created] = await db
    .insert(loginApprovals)
    .values({
      userId: user.id,
      matchNumber,
      matchChoices: choices,
      browser,
      ip: context.ipAddress?.slice(0, 64) ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
      deviceId: input.deviceId ?? null,
      loginMethod: input.method,
      pollTokenHash: hashToken(pollToken),
      expiresAt,
    })
    .returning({ id: loginApprovals.id });
  if (!created) return null;

  const push = await sendPushToUser(user.id, {
    title: "Approve web login?",
    body: `${browser} is signing in to your AsanPay account. Tap to approve or deny.`,
    data: { type: "login_approval", approvalId: created.id },
  }).catch((err: unknown) => {
    logger.warn({ userId: user.id, err: err instanceof Error ? err.message : String(err) }, "[LOGIN APPROVAL] push send threw");
    return null;
  });

  if (!push || push.sent === 0) {
    await db.update(loginApprovals).set({ status: "expired" }).where(eq(loginApprovals.id, created.id));
    logger.info({ userId: user.id, approvalId: created.id }, "[LOGIN APPROVAL] push not delivered — direct login");
    return null;
  }

  await insertAuditLog({
    userId: user.id,
    action: "auth.web_login_approval_requested",
    entityType: "login_approval",
    entityId: created.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { method: input.method, browser, pushSent: push.sent },
  });

  return {
    approvalRequired: true,
    approvalId: created.id,
    matchNumber,
    pollToken,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: LOGIN_APPROVAL_TTL_MS / 1000,
  };
}

/** Web "Login with QR code": a request with no user yet; the phone that scans it claims it. */
export async function startQrLogin(
  input: { deviceId?: string; deviceLabel?: string },
  context: AuthContext,
): Promise<{ approvalId: string; pollToken: string; qrValue: string; expiresAt: string; expiresInSeconds: number }> {
  const pollToken = randomBytes(32).toString("base64url");
  const qrSecret = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LOGIN_APPROVAL_TTL_MS);
  const [created] = await db
    .insert(loginApprovals)
    .values({
      loginMethod: "qr",
      browser: browserLabel(input.deviceLabel, context.userAgent),
      ip: context.ipAddress?.slice(0, 64) ?? null,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
      deviceId: input.deviceId ?? null,
      pollTokenHash: hashToken(pollToken),
      qrSecretHash: hashToken(qrSecret),
      expiresAt,
    })
    .returning({ id: loginApprovals.id });
  if (!created) throw new HttpError(500, "Could not create a login QR. Refresh the page and try again.");
  return {
    approvalId: created.id,
    pollToken,
    qrValue: `${QR_PREFIX}${created.id}.${qrSecret}`,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: LOGIN_APPROVAL_TTL_MS / 1000,
  };
}

export type QrScanResult = {
  approvalId: string;
  browser: string | null;
  ip: string | null;
  city: string | null;
  distanceKm: number | null;
  locationStatus: LoginLocationStatus;
  sameNetwork: boolean | null;
  expiresAt: string;
};

async function blockForMockLocation(
  userId: string,
  row: LoginApprovalRow,
  verdict: LocationVerdict,
  deviceId: string | null,
  context: AuthContext,
): Promise<never> {
  await db
    .update(loginApprovals)
    .set({ ...verdict, userId, status: "denied", denyReason: "mock_location", decidedAt: new Date(), decidedDeviceId: deviceId })
    .where(eq(loginApprovals.id, row.id));
  await insertAuditLog({
    userId,
    action: "auth.web_login_denied",
    entityType: "login_approval",
    entityId: row.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { reason: "mock_location", browser: row.browser, browserIp: row.ip, deviceId },
  });
  await Promise.all([
    recordWebLoginDeniedSignal(userId, row.id, { reason: "mock_location", ip: row.ip, browser: row.browser }),
    recordWebLoginLocationSignal(userId, row.id, {
      status: "mock",
      distanceKm: verdict.distanceKm,
      accuracyMeters: verdict.phoneAccuracyM,
      sameNetwork: verdict.sameNetwork,
    }),
  ]).catch((err: unknown) => {
    logger.warn({ userId, err: err instanceof Error ? err.message : String(err) }, "[LOGIN APPROVAL] risk signal failed");
  });
  throw MOCK_BLOCKED;
}

/** Phone scanned the web QR: claim it for this user, record GPS, return what to confirm. */
export async function scanQrLogin(
  userId: string,
  input: { qr: string; deviceId: string } & PhoneFix,
  context: AuthContext,
): Promise<QrScanResult> {
  const raw = input.qr.trim();
  const body = raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
  const dot = body.indexOf(".");
  const approvalId = dot > 0 ? body.slice(0, dot) : "";
  const secret = dot > 0 ? body.slice(dot + 1) : "";
  if (!/^[0-9a-f-]{36}$/i.test(approvalId) || secret.length < 20) throw QR_INVALID;

  const [row] = await db.select().from(loginApprovals).where(eq(loginApprovals.id, approvalId));
  if (!row || row.loginMethod !== "qr" || !row.qrSecretHash || !secretMatches(row.qrSecretHash, secret)) throw QR_INVALID;
  if (row.status === "expired") throw QR_EXPIRED;
  if (row.status !== "pending") {
    throw new HttpError(409, "This QR was already used. Refresh the QR on the web login page and scan again.", "LOGIN_APPROVAL_DECIDED");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.update(loginApprovals).set({ status: "expired" }).where(eq(loginApprovals.id, row.id));
    throw QR_EXPIRED;
  }
  if (row.userId && row.userId !== userId) {
    throw new HttpError(409, "This QR was already scanned by another AsanPay account.", "LOGIN_APPROVAL_DECIDED");
  }

  const device = await findDevice(userId, input.deviceId);
  if (!device || device.revokedAt) {
    throw new HttpError(
      403,
      "This phone is not trusted yet. Log in on this phone with OTP first, then scan the QR again.",
      "QR_LOGIN_DEVICE_NOT_TRUSTED",
    );
  }

  const verdict = await evaluatePhoneLocation(userId, input, context.ipAddress, row.ip);
  if (verdict.locationStatus === "mock") await blockForMockLocation(userId, row, verdict, input.deviceId, context);

  const [claimed] = await db
    .update(loginApprovals)
    .set({ ...verdict, userId, scannedAt: new Date() })
    .where(
      and(
        eq(loginApprovals.id, row.id),
        eq(loginApprovals.status, "pending"),
        or(isNull(loginApprovals.userId), eq(loginApprovals.userId, userId)),
      ),
    )
    .returning();
  if (!claimed) {
    throw new HttpError(409, "This QR was already used. Refresh the QR on the web login page and scan again.", "LOGIN_APPROVAL_DECIDED");
  }

  return {
    approvalId: claimed.id,
    browser: claimed.browser,
    ip: claimed.ip,
    city: claimed.city,
    distanceKm: verdict.distanceKm,
    locationStatus: verdict.locationStatus,
    sameNetwork: verdict.sameNetwork,
    expiresAt: claimed.expiresAt.toISOString(),
  };
}

export type LoginApprovalPollState =
  | { status: "pending"; expiresAt: string; expiresInSeconds: number; scanned: boolean }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; approval: LoginApprovalRow };

/** Browser poll. On the first poll after approval the row is consumed and handed back once. */
export async function claimLoginApproval(approvalId: string, pollToken: string): Promise<LoginApprovalPollState> {
  const [row] = await db.select().from(loginApprovals).where(eq(loginApprovals.id, approvalId));
  if (!row || !secretMatches(row.pollTokenHash, pollToken)) throw NOT_FOUND;

  const now = Date.now();
  if (row.status === "pending") {
    if (row.expiresAt.getTime() <= now) {
      await db
        .update(loginApprovals)
        .set({ status: "expired" })
        .where(and(eq(loginApprovals.id, row.id), eq(loginApprovals.status, "pending")));
      return { status: "expired" };
    }
    return {
      status: "pending",
      expiresAt: row.expiresAt.toISOString(),
      expiresInSeconds: Math.max(0, Math.ceil((row.expiresAt.getTime() - now) / 1000)),
      scanned: Boolean(row.scannedAt),
    };
  }
  if (row.status === "denied") return { status: "denied" };
  if (row.status !== "approved" || !row.userId) return { status: "expired" };

  if (row.consumedAt) throw ALREADY_USED;
  if (!row.decidedAt || row.decidedAt.getTime() + APPROVED_PICKUP_MS < now) return { status: "expired" };

  const [claimed] = await db
    .update(loginApprovals)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginApprovals.id, row.id), isNull(loginApprovals.consumedAt)))
    .returning();
  if (!claimed) throw ALREADY_USED;
  return { status: "approved", approval: claimed };
}

type DecideOutcome =
  | { kind: "missing" }
  | { kind: "expired" }
  | { kind: "closed"; status: string }
  | { kind: "need_location" }
  | { kind: "confirm_far"; distanceKm: number | null }
  | { kind: "mock"; row: LoginApprovalRow; verdict: LocationVerdict }
  | { kind: "approved"; row: LoginApprovalRow }
  | { kind: "denied"; row: LoginApprovalRow; reason: "user" | "wrong_number" };

export type DecideInput = {
  decision: "approve" | "deny";
  matchNumber?: number;
  deviceId?: string;
  /** Required to approve a password / OTP request (QR records it at scan). */
  location?: PhoneFix;
  /** Phone already showed "you are far from your shop" and the agent still approved. */
  confirmFar?: boolean;
};

/**
 * Phone: approve (number + GPS) or deny. Wrong number or fake GPS = denied, never a retry.
 * More than 50 km from the shop needs a second, explicit confirm on the phone.
 */
export async function decideLoginApproval(
  userId: string,
  approvalId: string,
  input: DecideInput,
  context: AuthContext,
): Promise<{ status: "approved" | "denied" }> {
  const outcome = await db.transaction(async (tx): Promise<DecideOutcome> => {
    const [row] = await tx
      .select()
      .from(loginApprovals)
      .where(eq(loginApprovals.id, approvalId))
      .for("update");
    if (!row || row.userId !== userId) return { kind: "missing" };
    if (row.status !== "pending") return { kind: "closed", status: row.status };
    if (row.expiresAt.getTime() <= Date.now()) {
      await tx.update(loginApprovals).set({ status: "expired" }).where(eq(loginApprovals.id, row.id));
      return { kind: "expired" };
    }

    const decided = { decidedAt: new Date(), decidedDeviceId: input.deviceId ?? null };
    const isQr = row.loginMethod === "qr";

    if (input.decision === "deny") {
      const [updated] = await tx
        .update(loginApprovals)
        .set({ status: "denied", denyReason: "user", ...decided })
        .where(eq(loginApprovals.id, row.id))
        .returning();
      return updated ? { kind: "denied", row: updated, reason: "user" } : { kind: "missing" };
    }

    if (!isQr && input.matchNumber !== row.matchNumber) {
      const [updated] = await tx
        .update(loginApprovals)
        .set({ status: "denied", denyReason: "wrong_number", ...decided })
        .where(eq(loginApprovals.id, row.id))
        .returning();
      return updated ? { kind: "denied", row: updated, reason: "wrong_number" } : { kind: "missing" };
    }

    let verdict: LocationVerdict | null = null;
    if (!isQr) {
      if (!input.location) return { kind: "need_location" };
      verdict = await evaluatePhoneLocation(userId, input.location, context.ipAddress, row.ip);
      if (verdict.locationStatus === "mock") return { kind: "mock", row, verdict };
      if (verdict.locationStatus === "far" && !input.confirmFar) {
        return { kind: "confirm_far", distanceKm: verdict.distanceKm };
      }
    }

    const [updated] = await tx
      .update(loginApprovals)
      .set({ status: "approved", denyReason: null, ...(verdict ?? {}), ...decided })
      .where(eq(loginApprovals.id, row.id))
      .returning();
    return updated ? { kind: "approved", row: updated } : { kind: "missing" };
  });

  if (outcome.kind === "missing") {
    throw new HttpError(
      404,
      "This login request was not found. It may be for a different account or already removed.",
      "LOGIN_APPROVAL_NOT_FOUND",
    );
  }
  if (outcome.kind === "expired" || (outcome.kind === "closed" && outcome.status === "expired")) throw EXPIRED;
  if (outcome.kind === "closed") {
    throw new HttpError(
      409,
      outcome.status === "approved" ? "This login was already approved." : "This login was already denied.",
      "LOGIN_APPROVAL_DECIDED",
    );
  }
  if (outcome.kind === "need_location") {
    throw new HttpError(
      422,
      "Turn on Location (GPS) on your phone to approve this login.",
      "LOGIN_APPROVAL_LOCATION_REQUIRED",
    );
  }
  if (outcome.kind === "confirm_far") {
    const km = outcome.distanceKm != null ? `about ${Math.round(outcome.distanceKm)} km` : "far";
    throw new HttpError(
      409,
      `Your phone is ${km} from your registered shop. Approve only if you or your staff are logging in on this computer.`,
      "LOGIN_APPROVAL_CONFIRM_FAR",
    );
  }
  if (outcome.kind === "mock") {
    return blockForMockLocation(userId, outcome.row, outcome.verdict, input.deviceId ?? null, context);
  }

  if (outcome.kind === "approved") {
    const row = outcome.row;
    await insertAuditLog({
      userId,
      action: "auth.web_login_approved",
      entityType: "login_approval",
      entityId: approvalId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: row.loginMethod,
        browser: row.browser,
        browserIp: row.ip,
        deviceId: input.deviceId ?? null,
        locationStatus: row.locationStatus,
        distanceKm: row.distanceKm,
        sameNetwork: row.sameNetwork,
      },
    });
    if (row.locationStatus === "far") {
      await recordWebLoginLocationSignal(userId, approvalId, {
        status: "far",
        distanceKm: row.distanceKm,
        accuracyMeters: row.phoneAccuracyM,
        sameNetwork: row.sameNetwork,
      }).catch((err: unknown) => {
        logger.warn({ userId, err: err instanceof Error ? err.message : String(err) }, "[LOGIN APPROVAL] risk signal failed");
      });
    }
    return { status: "approved" };
  }

  await insertAuditLog({
    userId,
    action: "auth.web_login_denied",
    entityType: "login_approval",
    entityId: approvalId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      reason: outcome.reason,
      method: outcome.row.loginMethod,
      browser: outcome.row.browser,
      browserIp: outcome.row.ip,
      deviceId: input.deviceId ?? null,
    },
  });
  await recordWebLoginDeniedSignal(userId, approvalId, {
    reason: outcome.reason,
    ip: outcome.row.ip,
    browser: outcome.row.browser,
  }).catch((err: unknown) => {
    logger.warn({ userId, err: err instanceof Error ? err.message : String(err) }, "[LOGIN APPROVAL] risk signal failed");
  });

  if (outcome.reason === "wrong_number") {
    throw new HttpError(
      422,
      "The number you picked does not match the web login screen. This login was blocked — sign in again on the web to get a new number.",
      "LOGIN_APPROVAL_WRONG_NUMBER",
    );
  }
  return { status: "denied" };
}

/** Phone app open: password / OTP requests it may have missed the push for (QR is confirmed in the scanner). */
export async function listPendingLoginApprovals(userId: string): Promise<
  Array<{
    id: string;
    browser: string | null;
    ip: string | null;
    city: string | null;
    loginMethod: string;
    choices: number[];
    createdAt: string;
    expiresAt: string;
  }>
> {
  const rows = await db
    .select()
    .from(loginApprovals)
    .where(
      and(
        eq(loginApprovals.userId, userId),
        eq(loginApprovals.status, "pending"),
        ne(loginApprovals.loginMethod, "qr"),
        gt(loginApprovals.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(loginApprovals.createdAt))
    .limit(5);
  return rows.map((r) => ({
    id: r.id,
    browser: r.browser,
    ip: r.ip,
    city: r.city,
    loginMethod: r.loginMethod,
    choices: r.matchChoices ?? [],
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}
