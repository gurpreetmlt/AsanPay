import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isNobleConfigured, isUsableNobleAgentId } from "../../config/env";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { stateCodeFromName, type AepsOnboardingPrefill } from "@asanpay/shared-types";
import { findLatestAuditLog, insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { encryptPII, decryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { noblePost } from "../providers/noble/client";
import type { NobleAgentOnboardInput, NobleAgentStatusInput } from "./nobleOnboarding.validators";

export interface NobleAgentProfile {
  uniqueAgentId: string;
  agentCode: string;
  /** true when the provider API was called; false when keys missing (local mock id). */
  live: boolean;
}

function defaultAgentCode(mobile: string): string {
  return `AP${mobile.replace(/\D/g, "").slice(-8)}`.slice(0, 10);
}

function normalizeDob(dob: string): string {
  return dob.includes("/") ? dob.replace(/\//g, "-") : dob;
}

function toFourDecimals(n: number): string {
  return n.toFixed(4);
}

function decryptOrNull(value: string | null, pattern: RegExp, clean: (v: string) => string): string | null {
  if (!value) return null;
  try {
    const v = clean(decryptPII(value));
    return pattern.test(v) ? v : null;
  } catch {
    return null;
  }
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const AADHAAR_RE = /^\d{12}$/;
const cleanPan = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
const cleanDigits = (v: string) => v.replace(/\D/g, "");

async function kycSubmitMeta(userId: string): Promise<Record<string, unknown>> {
  const audit = await findLatestAuditLog({ userId, action: "kyc.submit" });
  return (audit?.metadata ?? {}) as Record<string, unknown>;
}

function metaText(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function geo4(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const n = Number(c);
    if (c && Number.isFinite(n) && n !== 0) return n.toFixed(4);
  }
  return "";
}

/** Signup DOB (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) → DD-MM-YYYY; empty when unrecognised. */
function toDdMmYyyy(dob: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(dob);
  return dmy ? `${dmy[1]}-${dmy[2]}-${dmy[3]}` : "";
}

/** Agent DOB from signup KYC as DD/MM/YYYY (Aadhaar Pay KYC format); empty when unknown. */
export async function kycDobSlashed(userId: string): Promise<string> {
  return toDdMmYyyy(metaText(await kycSubmitMeta(userId), "dob")).replace(/-/g, "/");
}

/**
 * PAN + Aadhaar always come from KYC when on file (the agent cannot swap identity here).
 * An empty bank account keeps the KYC account.
 */
async function withKycIdentity(userId: string, input: NobleAgentOnboardInput): Promise<NobleAgentOnboardInput> {
  const [row] = await db
    .select({ pan: users.panNumberEncrypted, aadhaar: users.aadhaarNumberEncrypted })
    .from(users)
    .where(eq(users.id, userId));
  const pan = decryptOrNull(row?.pan ?? null, PAN_RE, cleanPan) ?? input.panNumber;
  const aadhaar = decryptOrNull(row?.aadhaar ?? null, AADHAAR_RE, cleanDigits) ?? input.aadhaarNumber;
  if (!PAN_RE.test(pan)) {
    throw new HttpError(400, "Enter a valid PAN (e.g. ABCDE1234F)", "NOBLE_PAN_REQUIRED");
  }
  if (!AADHAAR_RE.test(aadhaar)) {
    throw new HttpError(400, "Aadhaar must be 12 digits", "NOBLE_AADHAAR_REQUIRED");
  }
  let account = input.agentBankAccountNumber;
  if (!account) account = cleanDigits(metaText(await kycSubmitMeta(userId), "bankAccountNumber"));
  if (account.length < 5 || account.length > 30) {
    throw new HttpError(400, "Bank account number must be 5–30 digits", "NOBLE_BANK_ACCOUNT_REQUIRED");
  }
  return { ...input, panNumber: pan, aadhaarNumber: aadhaar, agentBankAccountNumber: account };
}

/** Full PAN + Aadhaar for the signed-in agent's own eye toggle. Every reveal is audit-logged (no values). */
export async function revealMyKycIdentity(
  userId: string,
  ipAddress: string | null,
): Promise<{ pan: string | null; aadhaar: string | null }> {
  const [row] = await db
    .select({ pan: users.panNumberEncrypted, aadhaar: users.aadhaarNumberEncrypted })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  const pan = decryptOrNull(row.pan, PAN_RE, cleanPan);
  const aadhaar = decryptOrNull(row.aadhaar, AADHAAR_RE, cleanDigits);
  await insertAuditLog({
    userId,
    action: "kyc.identity_reveal",
    entityType: "user",
    entityId: userId,
    ipAddress,
    metadata: { pan: Boolean(pan), aadhaar: Boolean(aadhaar) },
  }).catch((err: unknown) => logger.error({ err }, "failed to audit KYC identity reveal"));
  return { pan, aadhaar };
}

/** Own signup / KYC values for the onboarding form — PAN, Aadhaar and bank account masked. */
export async function getNobleOnboardingPrefill(userId: string): Promise<AepsOnboardingPrefill> {
  const [user] = await db
    .select({
      name: users.name,
      mobile: users.mobile,
      email: users.email,
      pan: users.panNumberEncrypted,
      aadhaar: users.aadhaarNumberEncrypted,
      lat: users.outletLatitude,
      lng: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const meta = await kycSubmitMeta(userId);
  const pan = decryptOrNull(user.pan, PAN_RE, cleanPan);
  const aadhaar = decryptOrNull(user.aadhaar, AADHAAR_RE, cleanDigits);
  const account = cleanDigits(metaText(meta, "bankAccountNumber"));
  const parts = user.name.trim().split(/\s+/);

  return {
    panMasked: pan ? `${pan.slice(0, 5)}****${pan.slice(-1)}` : null,
    aadhaarMasked: aadhaar ? `XXXX XXXX ${aadhaar.slice(-4)}` : null,
    bankAccountMasked: account.length >= 5 ? `****${account.slice(-4)}` : null,
    form: {
      firstName: parts[0] ?? "",
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
      mobileNumber: user.mobile,
      email: user.email ?? "",
      dob: toDdMmYyyy(metaText(meta, "dob")),
      agentAddress: metaText(meta, "address"),
      agentStateCode: stateCodeFromName(metaText(meta, "state")) ?? "",
      agentCity: metaText(meta, "city") || metaText(meta, "district"),
      agentPinCode: metaText(meta, "pincode"),
      agentBankName: metaText(meta, "bankName"),
      agentBankIFSC: metaText(meta, "bankIfsc").toUpperCase(),
      shopName: metaText(meta, "businessName"),
      shopAddress: metaText(meta, "businessAddress") || metaText(meta, "address"),
      shopStateCode: stateCodeFromName(metaText(meta, "businessState") || metaText(meta, "state")) ?? "",
      shopCity: metaText(meta, "businessDistrict") || metaText(meta, "city") || metaText(meta, "district"),
      shopPinCode: metaText(meta, "businessPincode") || metaText(meta, "pincode"),
      shopLatitude: geo4(user.lat, metaText(meta, "shopPhotoLatitude"), metaText(meta, "latitude")),
      shopLongitude: geo4(user.lng, metaText(meta, "shopPhotoLongitude"), metaText(meta, "longitude")),
    },
  };
}

function extractUniqueAgentId(responseData: unknown): string | null {
  if (!Array.isArray(responseData) || responseData.length === 0) return null;
  const row = responseData[0];
  if (!row || typeof row !== "object") return null;
  const id = (row as { uniqueAgentId?: unknown }).uniqueAgentId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function persistNobleAgent(
  userId: string,
  input: NobleAgentOnboardInput,
  agentCode: string,
  uniqueAgentId: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      nobleUniqueAgentId: uniqueAgentId,
      nobleAgentCode: agentCode,
      panNumberEncrypted: encryptPII(input.panNumber.toUpperCase()),
      aadhaarNumberEncrypted: encryptPII(input.aadhaarNumber),
      email: input.email.trim(),
      outletLatitude: toFourDecimals(input.shopLatitude),
      outletLongitude: toFourDecimals(input.shopLongitude),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Registers the retailer with the AEPS provider (agent_onboarding) and stores uniqueAgentId.
 * Without provider API keys, stores a MOCK id so UI can be developed before credentials land.
 */
export async function nobleAgentOnboard(
  userId: string,
  rawInput: NobleAgentOnboardInput,
  ipAddress: string,
): Promise<NobleAgentProfile> {
  const input = await withKycIdentity(userId, rawInput);
  const [user] = await db
    .select({
      mobile: users.mobile,
      nobleUniqueAgentId: users.nobleUniqueAgentId,
      nobleAgentCode: users.nobleAgentCode,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  if (user.nobleUniqueAgentId && !user.nobleUniqueAgentId.startsWith("MOCK")) {
    return {
      uniqueAgentId: user.nobleUniqueAgentId,
      agentCode: user.nobleAgentCode || defaultAgentCode(input.mobileNumber),
      live: true,
    };
  }

  const agentCode = (input.agentCode?.trim() || defaultAgentCode(input.mobileNumber)).slice(0, 10);
  const lat = toFourDecimals(input.shopLatitude);
  const lng = toFourDecimals(input.shopLongitude);

  if (!isNobleConfigured()) {
    const uniqueAgentId =
      user.nobleUniqueAgentId?.startsWith("MOCK")
        ? user.nobleUniqueAgentId
        : `MOCK${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    await persistNobleAgent(userId, input, agentCode, uniqueAgentId);
    logger.info({ userId, agentCode, live: false }, "AEPS agent onboarded (mock — keys not set)");
    return { uniqueAgentId, agentCode, live: false };
  }

  const body: Record<string, unknown> = {
    channel: input.channel,
    ipAddress: ipAddress || "127.0.0.1",
    firstName: input.firstName.trim(),
    middleName: (input.middleName ?? "").trim(),
    lastName: (input.lastName ?? "").trim(),
    mobileNumber: input.mobileNumber,
    email: input.email.trim(),
    panNumber: input.panNumber.toUpperCase(),
    aadhaarNumber: input.aadhaarNumber,
    dob: normalizeDob(input.dob),
    agentCode,
    agentAddress: input.agentAddress.trim(),
    agentStateCode: input.agentStateCode.toUpperCase(),
    agentCity: input.agentCity.trim(),
    agentPinCode: input.agentPinCode,
    agentBankName: input.agentBankName.trim(),
    agentBankAccountNumber: input.agentBankAccountNumber,
    agentBankIFSC: input.agentBankIFSC.toUpperCase(),
    shopName: input.shopName.trim(),
    shopAddress: input.shopAddress.trim(),
    shopStateCode: input.shopStateCode.toUpperCase(),
    shopCity: input.shopCity.trim(),
    shopPinCode: input.shopPinCode,
    shopLatitude: lat,
    shopLongitude: lng,
    isPhysicalVerified: input.isPhysicalVerified,
  };

  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/agent_onboarding", body);
  const uniqueAgentId = extractUniqueAgentId(json.responseData);

  if (httpStatus >= 400 || json.status !== 1 || !uniqueAgentId) {
    const detail =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      "AEPS agent onboarding failed";
    throw new HttpError(
      httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_ONBOARD_FAILED",
    );
  }

  await persistNobleAgent(userId, input, agentCode, uniqueAgentId);
  logger.info({ userId, agentCode, live: true }, "AEPS agent onboarded");
  return { uniqueAgentId, agentCode, live: true };
}

/**
 * Recovers uniqueAgentId via provider agent_onboarding_status (agentCode + PAN).
 * Also returns local status when already stored.
 */
export async function nobleAgentOnboardStatus(
  userId: string,
  input: NobleAgentStatusInput,
): Promise<NobleAgentProfile & { onboarded: boolean }> {
  const [user] = await db
    .select({
      nobleUniqueAgentId: users.nobleUniqueAgentId,
      nobleAgentCode: users.nobleAgentCode,
      panNumberEncrypted: users.panNumberEncrypted,
      mobile: users.mobile,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  if (isUsableNobleAgentId(user.nobleUniqueAgentId)) {
    return {
      onboarded: true,
      uniqueAgentId: user.nobleUniqueAgentId,
      agentCode: user.nobleAgentCode || defaultAgentCode(user.mobile),
      live: !user.nobleUniqueAgentId.startsWith("MOCK"),
    };
  }

  const agentCode =
    input.agentCode?.trim() ||
    user.nobleAgentCode ||
    defaultAgentCode(user.mobile);
  let panNumber = input.panNumber?.toUpperCase();
  if (!panNumber && user.panNumberEncrypted) {
    panNumber = decryptPII(user.panNumberEncrypted).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  if (!panNumber) {
    throw new HttpError(
      400,
      "PAN is required to recover your AEPS agent id. Enter PAN or complete onboarding first.",
      "NOBLE_PAN_REQUIRED",
    );
  }

  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }

  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/agent_onboarding_status", {
    agentCode,
    panNumber,
  });
  const uniqueAgentId = extractUniqueAgentId(json.responseData);

  if (httpStatus >= 400 || json.status !== 1 || !uniqueAgentId) {
    const detail =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      "AEPS agent onboarding status check failed";
    throw new HttpError(
      httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_ONBOARD_STATUS_FAILED",
    );
  }

  await db
    .update(users)
    .set({
      nobleUniqueAgentId: uniqueAgentId,
      nobleAgentCode: agentCode.slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { onboarded: true, uniqueAgentId, agentCode, live: true };
}

export async function getNobleOnboardingStatus(userId: string): Promise<{
  onboarded: boolean;
  uniqueAgentId: string | null;
  agentCode: string | null;
  live: boolean;
}> {
  const [user] = await db
    .select({
      nobleUniqueAgentId: users.nobleUniqueAgentId,
      nobleAgentCode: users.nobleAgentCode,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
  const id = user.nobleUniqueAgentId;
  return {
    onboarded: isUsableNobleAgentId(id),
    uniqueAgentId: id,
    agentCode: user.nobleAgentCode,
    live: Boolean(id && !id.startsWith("MOCK")),
  };
}
