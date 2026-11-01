import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db } from "../../db/postgres";
import { devices, loginApprovals, pushTokens } from "../../db/postgres/schema";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { env } from "../../config/env";
import { hashToken } from "../../utils/uid";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { isPushConfigured, sendPushToUser } from "../push/push.sender";
import { recordWebLoginDeniedSignal } from "../risk/riskSignal.service";

export const LOGIN_APPROVAL_TTL_MS = 2 * 60 * 1000;
/** After the tap, the browser has this long to collect its session. */
const APPROVED_PICKUP_MS = 2 * 60 * 1000;
const TRUSTED_BROWSER_TTL_S = 24 * 60 * 60;
const TRUSTED_BROWSER_TYPE = "trusted_browser";

type AuthContext = { ipAddress: string | null; userAgent: string | null };
type LoginApprovalRow = typeof loginApprovals.$inferSelect;

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

function pollTokenMatches(storedHash: string, candidate: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidate), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Password sign-in gate (OTP login is the fallback and is never gated). Applies to every client:
 * when the user has a trusted phone with push and this device is neither that phone nor a browser
 * approved in the last day, the login needs a tap on the phone. Clients without the wait screen
 * get LOGIN_APPROVAL_REQUIRED. Null means "log in as today" (no phone, push off or not delivered).
 */
export async function startLoginApproval(input: {
  user: { id: string; passwordHash: string };
  supportsLoginApproval?: boolean;
  trustedBrowserToken?: string;
  deviceId?: string;
  deviceLabel?: string;
  context: AuthContext;
}): Promise<LoginApprovalChallenge | null> {
  const { user, context } = input;
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
    .where(and(eq(loginApprovals.userId, user.id), eq(loginApprovals.status, "pending")));

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
      loginMethod: "password",
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
    metadata: { method: "password", browser, pushSent: push.sent },
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

export type LoginApprovalPollState =
  | { status: "pending"; expiresAt: string; expiresInSeconds: number }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; approval: LoginApprovalRow };

/** Browser poll. On the first poll after approval the row is consumed and handed back once. */
export async function claimLoginApproval(approvalId: string, pollToken: string): Promise<LoginApprovalPollState> {
  const [row] = await db.select().from(loginApprovals).where(eq(loginApprovals.id, approvalId));
  if (!row || !pollTokenMatches(row.pollTokenHash, pollToken)) throw NOT_FOUND;

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
    };
  }
  if (row.status === "denied") return { status: "denied" };
  if (row.status !== "approved") return { status: "expired" };

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
  | { kind: "approved"; row: LoginApprovalRow }
  | { kind: "denied"; row: LoginApprovalRow; reason: "user" | "wrong_number" };

/** Phone: approve (with the number picked) or deny. Wrong number = denied, never a retry. */
export async function decideLoginApproval(
  userId: string,
  approvalId: string,
  input: { decision: "approve" | "deny"; matchNumber?: number; deviceId?: string },
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

    const approve = input.decision === "approve" && input.matchNumber === row.matchNumber;
    const reason = input.decision === "approve" ? "wrong_number" : "user";
    const [updated] = await tx
      .update(loginApprovals)
      .set({
        status: approve ? "approved" : "denied",
        denyReason: approve ? null : reason,
        decidedAt: new Date(),
        decidedDeviceId: input.deviceId ?? null,
      })
      .where(eq(loginApprovals.id, row.id))
      .returning();
    if (!updated) return { kind: "missing" };
    return approve ? { kind: "approved", row: updated } : { kind: "denied", row: updated, reason };
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

  if (outcome.kind === "approved") {
    await insertAuditLog({
      userId,
      action: "auth.web_login_approved",
      entityType: "login_approval",
      entityId: approvalId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { browser: outcome.row.browser, browserIp: outcome.row.ip, deviceId: input.deviceId ?? null },
    });
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

/** Phone app open: requests it may have missed the push for. */
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
    choices: r.matchChoices,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}
