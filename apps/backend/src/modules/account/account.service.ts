import { findLatestAuditLog, insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { createTicket } from "../support/support.service";

const DELETION_ACTION = "account.deletion_requested";
const OPEN_REQUEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_STORE_URL = "https://play.google.com/store/apps/details?id=com.asanpay.mobile";

export interface AppVersionConfig {
  minVersionCode: number;
  latestVersionCode: number;
  storeUrl: string;
}

function readIntEnv(key: string, fallback: number): number {
  const parsed = Number.parseInt((process.env[key] ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getAppVersionConfig(): AppVersionConfig {
  const minVersionCode = readIntEnv("MIN_APP_VERSION_CODE", 0);
  return {
    minVersionCode,
    latestVersionCode: Math.max(readIntEnv("LATEST_APP_VERSION_CODE", minVersionCode), minVersionCode),
    storeUrl: process.env.PLAY_STORE_URL?.trim() || DEFAULT_STORE_URL,
  };
}

export interface DeletionRequestStatus {
  status: "none" | "requested";
  requestedAt: string | null;
}

async function findOpenDeletionRequest(userId: string): Promise<Date | null> {
  const latest = await findLatestAuditLog({ userId, action: DELETION_ACTION });
  if (!latest) return null;
  return Date.now() - latest.createdAt.getTime() < OPEN_REQUEST_WINDOW_MS ? latest.createdAt : null;
}

export async function getDeletionRequestStatus(userId: string): Promise<DeletionRequestStatus> {
  const openAt = await findOpenDeletionRequest(userId);
  return openAt
    ? { status: "requested", requestedAt: openAt.toISOString() }
    : { status: "none", requestedAt: null };
}

function formatIstDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * Records the request only. KYC and ledger records must be retained for 5 years (RBI / PMLA),
 * so the account is closed by the ops team from the support ticket, never hard-deleted here.
 */
export async function requestAccountDeletion(
  userId: string,
  input: { reason?: string },
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<{ requestedAt: string }> {
  const openAt = await findOpenDeletionRequest(userId);
  if (openAt) {
    throw new HttpError(
      409,
      `A deletion request is already open from ${formatIstDate(openAt)}. We will complete it within 30 days of that date.`,
      "DELETION_ALREADY_REQUESTED",
    );
  }

  const reason = input.reason?.trim() || null;
  let ticketId: string | null = null;
  try {
    const ticket = await createTicket(
      userId,
      "Account deletion request",
      `The user asked to delete their account from the app.\nReason: ${reason ?? "Not given"}\nClose the login within 30 days. Keep KYC and transaction records for 5 years.`,
    );
    ticketId = ticket?.id ?? null;
  } catch (err) {
    logger.warn({ userId, err }, "[ACCOUNT] deletion request ticket not created");
  }

  const requestedAt = new Date();
  await insertAuditLog({
    userId,
    action: DELETION_ACTION,
    entityType: "user",
    entityId: userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { reason, ticketId },
  });

  return { requestedAt: requestedAt.toISOString() };
}
