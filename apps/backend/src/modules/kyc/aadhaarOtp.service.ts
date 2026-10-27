import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { cacheDel, cacheGet, cacheSet } from "../../cache/redis";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { bestApiConfigured, bestApiPost, type BestApiJson } from "../providers/bestapi/client";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { recordKycVerification, statusForKycError } from "./kycVerification.service";

/** BestAPI docs: Identity Verify → Adhar Send OTP / Aadhar OTP Verify */
const SEND_PATH = "/api/gw/identity/verification/aadhar-send-otp";
const VERIFY_PATH = "/api/gw/identity/verification/aadhar-otp-verify";
const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_SEC = Math.ceil(SESSION_TTL_MS / 1000);
const CACHE_KEY_PREFIX = "kyc:aadhaar-otp:";

export const aadhaarOtpRequestSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar"),
});

export const aadhaarOtpVerifySchema = z.object({
  otp: z.string().regex(/^\d{4,8}$/, "Enter the Aadhaar OTP"),
  /** Optional: when the send call timed out on the app, verify uses the latest pending request. */
  requestId: z.string().trim().max(128).optional(),
});

/** Provider request-id keys seen across Aadhaar OTP gateways (BestAPI sample response is `{}`). */
const REQUEST_ID_KEYS = [
  "id",
  "Id",
  "requestId",
  "request_id",
  "reference_id",
  "referenceId",
  "ref_id",
  "refId",
  "client_id",
  "clientId",
  "txnid",
  "txnId",
  "txn_id",
  "transaction_id",
  "transactionId",
  "otp_ref_id",
];

type PendingAadhaarOtp = {
  providerId: string;
  /** Plain digits kept only for BestAPI verify body (memory/Redis TTL). */
  aadhaarDigits: string;
  aadhaarHash: string;
  last4: string;
  expiresAt: number;
};

const pendingByUser = new Map<string, PendingAadhaarOtp>();

function maskAadhaarLast4(digits: string): string {
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) lower.set(k.toLowerCase(), v);
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function deepFindString(root: unknown, keys: string[]): string | null {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  let found: string | null = null;
  function walk(node: unknown, depth: number): void {
    if (found || node == null || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    for (const [k, v] of Object.entries(rec)) {
      // Skip base64 photos / large blobs — they stall the walk and blow memory.
      if (typeof v === "string" && v.length > 500) continue;
      if (want.has(k.toLowerCase())) {
        if (typeof v === "string" && v.trim()) {
          found = v.trim();
          return;
        }
        if (typeof v === "number" && Number.isFinite(v)) {
          found = String(v);
          return;
        }
      }
      walk(v, depth + 1);
    }
  }
  walk(root, 0);
  return found;
}

function providerMessage(json: BestApiJson, fallback: string): string {
  const rec = asRecord(json) ?? {};
  return (
    pickString(rec, [
      "message",
      "msg",
      "error",
      "error_message",
      "statusmessage",
      "StatusMessage",
      "title",
      "detail",
    ]) ??
    deepFindString(json, ["message", "msg", "error", "title", "detail"]) ??
    fallback
  );
}

function isUpstreamUnreachable(message: string): boolean {
  return /could not reach|unable to reach|not reach|timeout|timed out|bad gateway|gateway|unavailable|origin_bad/i.test(
    message,
  );
}

function isFailurePayload(httpStatus: number, json: BestApiJson): boolean {
  if (httpStatus >= 400) return true;
  const rec = asRecord(json) ?? {};
  // Do NOT JSON.stringify the whole payload — verify responses often include huge base64 photos.
  const topBlob = [rec.message, rec.msg, rec.error, rec.title, rec.detail, rec.type]
    .filter((v) => typeof v === "string")
    .join(" ");
  if (/Bad gateway|origin_bad|<!DOCTYPE/i.test(topBlob)) return true;
  const msg = providerMessage(json, "");
  if (msg && isUpstreamUnreachable(msg)) return true;
  const status = (pickString(rec, ["status", "Status", "result", "Result"]) ?? "").toLowerCase();
  if (["fail", "failed", "error", "false"].includes(status)) return true;
  // Some gateways use numeric 0 = fail; others use 0 = success. Only treat explicit string "0" as fail
  // when paired with a failure-looking message (avoid false positives on success status:0).
  if (status === "0" && msg && /fail|invalid|incorrect|error|denied/i.test(msg)) return true;
  return false;
}

function isGatewayFailure(httpStatus: number, json: BestApiJson): boolean {
  if (httpStatus >= 500) return true;
  const raw = providerMessage(json, "");
  return Boolean(raw) && (isUpstreamUnreachable(raw) || /cloudflare|origin_bad|<!DOCTYPE/i.test(raw));
}

/** Status + short provider message only; long digit runs are masked so an Aadhaar never reaches logs. */
function logSendFailure(userId: string, res: { httpStatus: number; json: BestApiJson }): void {
  const providerMsg = providerMessage(res.json, "").slice(0, 160).replace(/\d{6,}/g, "******");
  const top = asRecord(res.json) ?? {};
  logger.warn(
    { userId, httpStatus: res.httpStatus, providerMsg, keys: Object.keys(top) },
    "Aadhaar OTP send failed at BestAPI",
  );
}

function extractProviderRequestId(json: BestApiJson): string | null {
  const rec = asRecord(json) ?? {};
  const data = asRecord(rec.data) ?? asRecord(rec.Data) ?? asRecord(rec.result) ?? asRecord(rec.Result);
  const fromData = data ? pickString(data, REQUEST_ID_KEYS) : null;
  if (fromData && fromData !== "null") return fromData;
  const top = pickString(rec, REQUEST_ID_KEYS);
  if (top && top !== "null") return top;
  const deep = deepFindString(json, REQUEST_ID_KEYS);
  if (deep && deep !== "null") return deep;
  return null;
}

function mapVerifyFailureMessage(raw: string): { status: number; message: string; code: string } {
  const msg = raw.trim() || "Incorrect Aadhaar OTP. Check the code and try again.";
  if (isUpstreamUnreachable(msg)) {
    return {
      status: 502,
      message:
        "Aadhaar verification service is temporarily unavailable. Tap Resend OTP and try again in a minute.",
      code: "AADHAAR_OTP_UPSTREAM",
    };
  }
  if (/incorrect|invalid otp|wrong otp|otp.*(fail|invalid|mismatch)/i.test(msg)) {
    return {
      status: 401,
      message: "Incorrect Aadhaar OTP. Check the code and try again.",
      code: "AADHAAR_OTP_INCORRECT",
    };
  }
  return { status: 401, message: msg, code: "AADHAAR_OTP_INCORRECT" };
}

function assertInPlan(httpStatus: number, raw: string): void {
  if (/not_in_plan|not in plan/i.test(raw)) {
    throw new HttpError(
      503,
      "Aadhaar OTP verification is not active on our provider plan yet. Please try again later or contact support.",
      "AADHAAR_OTP_NOT_IN_PLAN",
    );
  }
  if (httpStatus === 403) {
    throw new HttpError(
      503,
      "Aadhaar OTP verification is blocked by our provider right now. Please try again later or contact support.",
      "AADHAAR_OTP_FORBIDDEN",
    );
  }
}

function assertConfigured(): void {
  if (!bestApiConfigured()) {
    throw new HttpError(
      503,
      "Aadhaar OTP is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }
}

async function savePending(userId: string, pending: PendingAadhaarOtp): Promise<void> {
  pendingByUser.set(userId, pending);
  await cacheSet(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(pending), SESSION_TTL_SEC);
}

async function loadPending(userId: string): Promise<PendingAadhaarOtp | null> {
  const mem = pendingByUser.get(userId);
  if (mem && mem.expiresAt >= Date.now()) return mem;
  if (mem) pendingByUser.delete(userId);

  const raw = await cacheGet(`${CACHE_KEY_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingAadhaarOtp;
    // providerId may be "" when the send gateway failed but the SMS still went out.
    if (typeof parsed?.providerId !== "string" || !parsed?.aadhaarDigits || !parsed?.expiresAt) return null;
    if (parsed.expiresAt < Date.now()) {
      await cacheDel(`${CACHE_KEY_PREFIX}${userId}`);
      return null;
    }
    pendingByUser.set(userId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function clearPending(userId: string): Promise<void> {
  pendingByUser.delete(userId);
  await cacheDel(`${CACHE_KEY_PREFIX}${userId}`);
}

export async function sendAadhaarKycOtp(
  userId: string,
  aadhaarNumber: string,
): Promise<{ requestId: string; message: string }> {
  assertConfigured();
  const digits = aadhaarNumber.replace(/\D/g, "");
  if (!/^\d{12}$/.test(digits)) {
    throw new HttpError(422, "Enter a valid 12-digit Aadhaar", "INVALID_AADHAAR");
  }

  const res = await bestApiPost(SEND_PATH, { Adhar: digits });
  if (isFailurePayload(res.httpStatus, res.json)) {
    logSendFailure(userId, res);
    const raw = providerMessage(res.json, "Could not send Aadhaar OTP. Check the Aadhaar number and try again.");
    assertInPlan(res.httpStatus, raw);
    if (isGatewayFailure(res.httpStatus, res.json)) {
      // The gateway can fail after UIDAI already sent the SMS (no retry: it would send a second OTP).
      // Keep a pending session so an OTP that did arrive can still be verified.
      await savePending(userId, {
        providerId: extractProviderRequestId(res.json) ?? "",
        aadhaarDigits: digits,
        aadhaarHash: sha256(digits),
        last4: digits.slice(-4),
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      throw new HttpError(
        502,
        "Aadhaar OTP service is slow right now. If you received the OTP, enter it below and tap Verify. If not, tap Resend OTP in a minute.",
        "AADHAAR_OTP_UPSTREAM",
      );
    }
    throw new HttpError(502, raw, "AADHAAR_OTP_SEND_FAILED");
  }

  const requestId = extractProviderRequestId(res.json);
  if (!requestId) {
    const top = asRecord(res.json) ?? {};
    const dataRec = asRecord(top.data) ?? asRecord(top.Data) ?? asRecord(top.result) ?? {};
    logger.warn(
      {
        userId,
        httpStatus: res.httpStatus,
        keys: Object.keys(top),
        dataKeys: Object.keys(dataRec),
      },
      "Aadhaar OTP send: no request Id in BestAPI response",
    );
    throw new HttpError(
      502,
      "Aadhaar OTP service did not return a request reference. Tap Resend OTP in a minute.",
      "AADHAAR_OTP_NO_ID",
    );
  }

  await savePending(userId, {
    providerId: requestId,
    aadhaarDigits: digits,
    aadhaarHash: sha256(digits),
    last4: digits.slice(-4),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  logger.info({ userId, aadhaar: maskAadhaarLast4(digits) }, "Aadhaar KYC OTP requested");
  await insertAuditLog({
    userId,
    action: "kyc.aadhaar_otp_requested",
    entityType: "user",
    entityId: userId,
    metadata: { aadhaarLast4: digits.slice(-4) },
  });

  return {
    requestId,
    message: "OTP sent to the mobile number registered with this Aadhaar",
  };
}

type AadhaarOtpVerifyResult = {
  verified: true;
  fullName: string | null;
  address: string | null;
  mobileMatched: boolean | null;
};

export async function verifyAadhaarKycOtp(
  userId: string,
  input: { otp: string; requestId?: string },
): Promise<AadhaarOtpVerifyResult> {
  const ctx = { actorId: userId, source: "aadhaar_otp" as const };
  try {
    const result = await runAadhaarOtpVerify(userId, input);
    await recordKycVerification(
      userId,
      { aadhaarOtp: "verified", aadhaarProviderRequestId: result.providerRequestId },
      ctx,
    );
    return {
      verified: result.verified,
      fullName: result.fullName,
      address: result.address,
      mobileMatched: result.mobileMatched,
    };
  } catch (err) {
    const failure = statusForKycError(err, {
      AADHAAR_MOBILE_MISMATCH: "failed",
      AADHAAR_OTP_INCORRECT: "retry_required",
      AADHAAR_OTP_EXPIRED: "retry_required",
      AADHAAR_OTP_MISMATCH: "retry_required",
    });
    if (failure) {
      await recordKycVerification(
        userId,
        { aadhaarOtp: failure.status, reasons: { aadhaarOtp: failure.message } },
        { ...ctx, reason: failure.message },
      );
    }
    throw err;
  }
}

async function runAadhaarOtpVerify(
  userId: string,
  input: { otp: string; requestId?: string },
): Promise<AadhaarOtpVerifyResult & { providerRequestId: string }> {
  assertConfigured();
  const pending = await loadPending(userId);
  const requestId = input.requestId?.trim() ?? "";
  if (!pending) {
    logger.warn({ userId, hadRequestId: Boolean(requestId) }, "Aadhaar OTP verify: no pending session");
    throw new HttpError(
      401,
      requestId
        ? "Aadhaar OTP has expired. Tap Resend OTP to request a new code."
        : "No Aadhaar OTP was requested for this account. Tap Send OTP to get a new OTP.",
      "AADHAAR_OTP_EXPIRED",
    );
  }
  if (requestId && pending.providerId && pending.providerId !== requestId) {
    logger.warn({ userId, aadhaarLast4: pending.last4 }, "Aadhaar OTP verify: request id mismatch");
    throw new HttpError(
      401,
      "This OTP does not match the latest Aadhaar request. Tap Resend OTP again.",
      "AADHAAR_OTP_MISMATCH",
    );
  }

  const otp = input.otp.trim();
  const providerId = pending.providerId;
  // Official BestAPI sample: { otp, id, aadhar }
  const res = await bestApiPost(
    VERIFY_PATH,
    {
      otp,
      id: providerId,
      aadhar: pending.aadhaarDigits,
    },
    undefined,
    25_000,
  );

  if (isFailurePayload(res.httpStatus, res.json)) {
    const raw = providerMessage(res.json, "Incorrect Aadhaar OTP. Check the code and try again.");
    logger.warn(
      {
        userId,
        httpStatus: res.httpStatus,
        providerMsg: raw.slice(0, 120),
        aadhaarLast4: pending.last4,
      },
      "Aadhaar OTP verify failed at BestAPI",
    );
    assertInPlan(res.httpStatus, raw);
    // BestAPI often returns Cloudflare HTML/JSON 502 when UIDAI origin is down.
    if (res.httpStatus >= 500 || isUpstreamUnreachable(raw) || /bad gateway|cloudflare/i.test(raw)) {
      throw new HttpError(
        502,
        "Aadhaar verification service is temporarily unavailable (provider gateway error). Tap Resend OTP and try again in a few minutes. If it keeps failing, contact BestAPI support.",
        "AADHAAR_OTP_UPSTREAM",
      );
    }
    const mapped = mapVerifyFailureMessage(raw);
    throw new HttpError(mapped.status, mapped.message, mapped.code);
  }

  const fullName =
    pickString(asRecord(res.json) ?? {}, ["full_name", "fullName", "name", "Name"]) ??
    deepFindString(res.json, ["full_name", "fullName", "name"]);
  const address =
    pickString(asRecord(res.json) ?? {}, ["address", "Address"]) ??
    deepFindString(res.json, ["address", "Address"]);
  const dob =
    pickString(asRecord(res.json) ?? {}, ["dob", "date_of_birth", "dateOfBirth"]) ??
    deepFindString(res.json, ["dob", "date_of_birth", "dateOfBirth"]);
  const linkedMobileRaw =
    pickString(asRecord(res.json) ?? {}, ["mobile", "phone", "registered_mobile"]) ??
    deepFindString(res.json, ["mobile", "phone", "registered_mobile"]);
  const linkedMobile = linkedMobileRaw ? linkedMobileRaw.replace(/\D/g, "").slice(-10) : "";

  const [row] = await db
    .select({ mobile: users.mobile })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  }

  let mobileMatched: boolean | null = null;
  if (/^\d{10}$/.test(linkedMobile)) {
    mobileMatched = linkedMobile === row.mobile.replace(/\D/g, "").slice(-10);
    if (!mobileMatched) {
      logger.warn(
        { userId, aadhaarLast4: pending.last4, linkedLast4: linkedMobile.slice(-4) },
        "Aadhaar OTP verify: linked mobile differs from signup mobile",
      );
      throw new HttpError(
        422,
        "This Aadhaar is linked to a different mobile. Use the Aadhaar registered on your signup number.",
        "AADHAAR_MOBILE_MISMATCH",
      );
    }
  }

  await clearPending(userId);
  logger.info(
    { userId, aadhaarLast4: pending.last4, mobileMatched, hasName: Boolean(fullName) },
    "Aadhaar KYC OTP verified",
  );
  await insertAuditLog({
    userId,
    action: "kyc.aadhaar_otp_verified",
    entityType: "user",
    entityId: userId,
    // fullName + dob feed the KYC photo check (name / DOB match on the Aadhaar photo).
    metadata: { aadhaarLast4: pending.last4, mobileMatched, fullName: fullName || null, dob: dob || null },
  });

  return {
    verified: true,
    fullName: fullName || null,
    address: address || null,
    mobileMatched,
    providerRequestId: providerId,
  };
}
