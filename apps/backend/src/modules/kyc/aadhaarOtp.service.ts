import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { bestApiConfigured, bestApiPost, type BestApiJson } from "../providers/bestapi/client";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";

const SEND_PATH = "/api/gw/identity-verify/adhar/adhar-send-otp";
const VERIFY_PATH = "/api/gw/identity-verify/adhar/adhar-verify-otp";
const SESSION_TTL_MS = 10 * 60 * 1000;

export const aadhaarOtpRequestSchema = z.object({
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar"),
});

export const aadhaarOtpVerifySchema = z.object({
  otp: z.string().regex(/^\d{4,8}$/, "Enter the Aadhaar OTP"),
  requestId: z.string().trim().min(1, "Request a new Aadhaar OTP first").max(80),
});

type PendingAadhaarOtp = {
  providerId: string;
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
    pickString(rec, ["message", "msg", "error", "error_message", "statusmessage", "StatusMessage"]) ??
    deepFindString(json, ["message", "msg", "error"]) ??
    fallback
  );
}

function isFailurePayload(httpStatus: number, json: BestApiJson): boolean {
  if (httpStatus >= 400) return true;
  const sample = JSON.stringify(json);
  if (sample.includes("Bad gateway") || sample.includes("<!DOCTYPE") || sample.includes("origin_bad_gateway")) {
    return true;
  }
  const rec = asRecord(json) ?? {};
  const status = (pickString(rec, ["status", "Status", "result", "Result"]) ?? "").toLowerCase();
  if (["fail", "failed", "error", "0", "false"].includes(status)) return true;
  return false;
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
    throw new HttpError(
      502,
      providerMessage(res.json, "Could not send Aadhaar OTP. Check the Aadhaar number and try again."),
      "AADHAAR_OTP_SEND_FAILED",
    );
  }

  const requestId =
    pickString(asRecord(res.json) ?? {}, ["id", "Id", "requestId", "request_id", "txnid", "txnId"]) ??
    deepFindString(res.json, ["id", "Id", "requestId", "request_id"]);
  if (!requestId || requestId === "null") {
    throw new HttpError(
      502,
      "Could not start Aadhaar OTP. Check the Aadhaar number and try again.",
      "AADHAAR_OTP_NO_ID",
    );
  }

  pendingByUser.set(userId, {
    providerId: requestId,
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

export async function verifyAadhaarKycOtp(
  userId: string,
  input: { otp: string; requestId: string },
): Promise<{
  verified: true;
  fullName: string | null;
  address: string | null;
  mobileMatched: boolean | null;
}> {
  assertConfigured();
  const pending = pendingByUser.get(userId);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingByUser.delete(userId);
    throw new HttpError(
      401,
      "Aadhaar OTP has expired. Tap Send OTP to request a new code.",
      "AADHAAR_OTP_EXPIRED",
    );
  }
  if (pending.providerId !== input.requestId.trim()) {
    throw new HttpError(
      401,
      "This OTP does not match the latest Aadhaar request. Tap Send OTP again.",
      "AADHAAR_OTP_MISMATCH",
    );
  }

  const res = await bestApiPost(VERIFY_PATH, { otp: input.otp.trim(), Id: pending.providerId });
  if (isFailurePayload(res.httpStatus, res.json)) {
    throw new HttpError(
      401,
      providerMessage(res.json, "Incorrect Aadhaar OTP. Check the code and try again."),
      "AADHAAR_OTP_INCORRECT",
    );
  }

  const fullName =
    pickString(asRecord(res.json) ?? {}, ["full_name", "fullName", "name", "Name"]) ??
    deepFindString(res.json, ["full_name", "fullName", "name"]);
  const address =
    pickString(asRecord(res.json) ?? {}, ["address", "Address"]) ??
    deepFindString(res.json, ["address", "Address"]);
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
      throw new HttpError(
        422,
        "This Aadhaar is linked to a different mobile. Use the Aadhaar registered on your signup number.",
        "AADHAAR_MOBILE_MISMATCH",
      );
    }
  }

  pendingByUser.delete(userId);
  logger.info(
    { userId, aadhaarLast4: pending.last4, mobileMatched, hasName: Boolean(fullName) },
    "Aadhaar KYC OTP verified",
  );
  await insertAuditLog({
    userId,
    action: "kyc.aadhaar_otp_verified",
    entityType: "user",
    entityId: userId,
    metadata: { aadhaarLast4: pending.last4, mobileMatched },
  });

  return {
    verified: true,
    fullName: fullName || null,
    address: address || null,
    mobileMatched,
  };
}
