import { z } from "zod";
import { bestApiConfigured, bestApiPost, type BestApiJson } from "../providers/bestapi/client";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { encryptPII } from "../../utils/aes";
import { recordKycVerification, statusForKycError } from "./kycVerification.service";

const VERIFY_PATH = "/api/gw/identity-verify/pan/pan-verify";
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

export const panVerifySchema = z.object({
  panNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((v) => PAN_RE.test(v), "Enter a valid PAN (e.g. ABCDE1234F)"),
});

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

function maskPan(pan: string): string {
  if (pan.length < 6) return "••••••••••";
  return `${pan.slice(0, 5)}****${pan.slice(-1)}`;
}

function assertConfigured(): void {
  if (!bestApiConfigured()) {
    throw new HttpError(
      503,
      "PAN verification is not configured. Set BESTAPI_API_KEY and BESTAPI_API_SECRET.",
      "BESTAPI_NOT_CONFIGURED",
    );
  }
}

type PanVerifyResult = {
  verified: true;
  pan: string;
  fullName: string | null;
  address: string | null;
  category: string | null;
};

export async function verifyPanKyc(userId: string, panNumber: string): Promise<PanVerifyResult> {
  const ctx = { actorId: userId, source: "pan_verify" as const };
  try {
    const result = await runPanVerify(userId, panNumber);
    await recordKycVerification(userId, { panNumber: "verified" }, ctx);
    return result;
  } catch (err) {
    const failure = statusForKycError(err, { PAN_VERIFY_EMPTY: "failed", PAN_VERIFY_FAILED: "retry_required" });
    if (failure) {
      await recordKycVerification(
        userId,
        { panNumber: failure.status, reasons: { panNumber: failure.message } },
        { ...ctx, reason: failure.message },
      );
    }
    throw err;
  }
}

async function runPanVerify(userId: string, panNumber: string): Promise<PanVerifyResult> {
  assertConfigured();
  const pan = panNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!PAN_RE.test(pan)) {
    throw new HttpError(422, "Enter a valid PAN (e.g. ABCDE1234F)", "INVALID_PAN");
  }

  const res = await bestApiPost(VERIFY_PATH, { pan });
  if (isFailurePayload(res.httpStatus, res.json)) {
    throw new HttpError(
      502,
      providerMessage(res.json, "Could not verify PAN. Check the PAN number and try again."),
      "PAN_VERIFY_FAILED",
    );
  }

  const rec = asRecord(res.json) ?? {};
  const fullName =
    pickString(rec, ["full_name", "fullName", "name", "Name"]) ??
    deepFindString(res.json, ["full_name", "fullName", "name"]);
  const address =
    pickString(rec, ["address", "Address"]) ?? deepFindString(res.json, ["address", "Address"]);
  const category =
    pickString(rec, ["category", "Category", "pan_type", "type"]) ??
    deepFindString(res.json, ["category", "Category"]);

  // Provider returned empty identity — treat as failed verify (sample docs show nulls on error).
  if (!fullName && !pickString(rec, ["pan", "Pan"]) && address == null && category == null) {
    throw new HttpError(
      422,
      "PAN could not be verified. Check the PAN number and try again.",
      "PAN_VERIFY_EMPTY",
    );
  }

  logger.info({ userId, pan: maskPan(pan), hasName: Boolean(fullName) }, "PAN KYC verified");
  await insertAuditLog({
    userId,
    action: "kyc.pan_verified",
    entityType: "user",
    entityId: userId,
    metadata: {
      panMasked: maskPan(pan),
      // KYC photo check compares the PAN on the card against this.
      panEncrypted: encryptPII(pan),
      fullName: fullName || null,
      hasName: Boolean(fullName),
      category: category ?? null,
    },
  });

  return {
    verified: true,
    pan,
    fullName: fullName || null,
    address: address || null,
    category: category || null,
  };
}
