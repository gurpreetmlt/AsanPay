import { eq } from "drizzle-orm";
import { isUsableNobleAgentId } from "../../config/env";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import {
  firstResponseRow,
  nobleBioType,
  nobleDeviceBody,
  nobleOk,
  nobleTxnId,
  requireNobleGeo,
  resolveNobleAgentContext,
} from "../providers/noble/aepsOps";
import { noblePost } from "../providers/noble/client";

export interface NobleLoadAgentResult {
  kycRequired: boolean;
  daily2faRequired: boolean;
  kycWadhValue: string;
  amountForOtp: number | null;
  tranTypeForOtp: string | null;
  live: boolean;
  raw: Record<string, unknown>;
}

export async function nobleLoadAgent(
  userId: string,
  opts: { endpointIp?: string; channel?: "APP" | "WEB" } = {},
): Promise<NobleLoadAgentResult> {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: opts.endpointIp,
    channel: opts.channel,
  });

  if (!ctx.live) {
    return {
      kycRequired: false,
      daily2faRequired: false,
      kycWadhValue: "",
      amountForOtp: null,
      tranTypeForOtp: null,
      live: false,
      raw: { mock: true },
    };
  }

  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/load_agent", {
    uniqueAgentId: ctx.uniqueAgentId,
  });
  if (!nobleOk(json, httpStatus)) {
    const detail =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      "AEPS load agent failed";
    throw new HttpError(
      httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_LOAD_AGENT_FAILED",
    );
  }

  const row = firstResponseRow(json);
  return {
    kycRequired: String(row.kycRequired ?? "").toUpperCase() === "YES",
    daily2faRequired: String(row.daily2faRequired ?? "").toUpperCase() === "YES",
    kycWadhValue: String(row.kycWadhValue ?? ""),
    amountForOtp: typeof row.amountForOtp === "number" ? row.amountForOtp : null,
    tranTypeForOtp: typeof row.tranTypeForOtp === "string" ? row.tranTypeForOtp : null,
    live: true,
    raw: row,
  };
}

export interface NobleKycInput {
  biometricPayload: string;
  latitude?: string;
  longitude?: string;
  businessNature?: string;
  annualIncome?: string;
  channel?: "APP" | "WEB";
  endpointIp?: string;
}

export async function nobleAgentKyc(userId: string, input: NobleKycInput) {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: input.endpointIp,
    latitude: input.latitude,
    longitude: input.longitude,
    channel: input.channel,
  });
  requireNobleGeo(ctx);
  if (!ctx.live) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }

  const transactionId = nobleTxnId("NKYC");
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/kyc", {
    ...nobleDeviceBody(ctx),
    transactionId,
    businessNature: input.businessNature || "Mobility",
    annualIncome: input.annualIncome || "100000",
    bioType: "0",
    pidData: input.biometricPayload,
  });

  if (!nobleOk(json, httpStatus)) {
    const detail =
      (typeof json.description === "string" && json.description) ||
      (typeof json.message === "string" && json.message) ||
      "AEPS KYC failed";
    throw new HttpError(
      httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_KYC_FAILED",
    );
  }

  return {
    transactionId,
    live: true,
    raw: firstResponseRow(json),
  };
}

// ── Aadhaar Pay (AP) — separate merchant session from AEPS: own load / KYC / daily 2FA ──

function nobleFailure(
  json: Record<string, unknown>,
  httpStatus: number,
  fallback: string,
  fallbackCode: string,
): HttpError {
  const detail =
    (typeof json.description === "string" && json.description) ||
    (typeof json.message === "string" && json.message) ||
    fallback;
  return new HttpError(
    httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    detail,
    typeof json.statusCode === "string" ? json.statusCode : fallbackCode,
  );
}

function notConfigured(): HttpError {
  return new HttpError(503, "AEPS provider is not configured on the server. Contact support.", "NOBLE_NOT_CONFIGURED");
}

export async function nobleApLoadAgent(
  userId: string,
  opts: { endpointIp?: string; channel?: "APP" | "WEB" } = {},
): Promise<NobleLoadAgentResult> {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: opts.endpointIp,
    channel: opts.channel,
  });
  if (!ctx.live) {
    return {
      kycRequired: false,
      daily2faRequired: false,
      kycWadhValue: "",
      amountForOtp: null,
      tranTypeForOtp: null,
      live: false,
      raw: { mock: true },
    };
  }
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/ap_load_agent", {
    uniqueAgentId: ctx.uniqueAgentId,
  });
  if (!nobleOk(json, httpStatus)) {
    throw nobleFailure(json, httpStatus, "Aadhaar Pay load agent failed", "NOBLE_AP_LOAD_AGENT_FAILED");
  }
  const row = firstResponseRow(json);
  const amountForOtp = Number(row.amountForOtp);
  return {
    kycRequired: String(row.kycRequired ?? "").toUpperCase() === "YES",
    daily2faRequired: String(row.daily2faRequired ?? "").toUpperCase() === "YES",
    kycWadhValue: String(row.kycWadhValue ?? ""),
    amountForOtp: Number.isFinite(amountForOtp) && amountForOtp > 0 ? amountForOtp : null,
    tranTypeForOtp: typeof row.tranTypeForOtp === "string" ? row.tranTypeForOtp : null,
    live: true,
    raw: row,
  };
}

export async function nobleApKyc(
  userId: string,
  input: {
    biometricPayload: string;
    captureType?: "FINGER" | "FACE";
    dob: string;
    latitude?: string;
    longitude?: string;
    channel?: "APP" | "WEB";
    endpointIp?: string;
  },
) {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: input.endpointIp,
    latitude: input.latitude,
    longitude: input.longitude,
    channel: input.channel,
  });
  requireNobleGeo(ctx);
  if (!ctx.live) throw notConfigured();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(input.dob)) {
    throw new HttpError(422, "Date of birth must be DD/MM/YYYY (e.g. 20/10/1985)", "NOBLE_AP_DOB_REQUIRED");
  }
  const transactionId = nobleTxnId("NAPK");
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/ap_kyc", {
    ...nobleDeviceBody(ctx),
    transactionId,
    dob: input.dob,
    bioType: nobleBioType(input.captureType),
    pidData: input.biometricPayload,
  });
  if (!nobleOk(json, httpStatus)) {
    throw nobleFailure(json, httpStatus, "Aadhaar Pay KYC failed", "NOBLE_AP_KYC_FAILED");
  }
  return { transactionId, live: true, raw: firstResponseRow(json) };
}

export async function nobleApDaily2fa(
  userId: string,
  input: {
    biometricPayload: string;
    captureType?: "FINGER" | "FACE";
    latitude?: string;
    longitude?: string;
    channel?: "APP" | "WEB";
    endpointIp?: string;
  },
) {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: input.endpointIp,
    latitude: input.latitude,
    longitude: input.longitude,
    channel: input.channel,
  });
  requireNobleGeo(ctx);
  if (!ctx.live) {
    return { transactionId: `MOCK-AP2FA-${Date.now()}`, live: false, raw: { mock: true } };
  }
  const isFace = input.captureType === "FACE";
  const transactionId = nobleTxnId("NAP2F");
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/ap_daily_2fa", {
    ...nobleDeviceBody(ctx),
    transactionId,
    serviceType: "AP",
    bioType: nobleBioType(input.captureType),
    pidData: input.biometricPayload,
  });
  const row = firstResponseRow(json);
  const tran = String(row.tranStatus ?? "").toLowerCase();
  if (!nobleOk(json, httpStatus) || (tran && tran !== "success")) {
    throw nobleFailure(
      json,
      httpStatus,
      isFace ? "Aadhaar Pay daily face verification failed" : "Aadhaar Pay daily fingerprint verification failed",
      "NOBLE_AP_2FA_FAILED",
    );
  }
  return { transactionId, live: true, raw: row };
}

export interface NobleApOtpResult {
  otpRequired: boolean;
  otpReference: string;
  otpTransactionId: string;
  otpTransactionToken: string;
}

/** Only needed when load agent says tranTypeForOtp = MT and amount ≥ amountForOtp. */
export async function nobleApGenerateOtp(
  userId: string,
  input: {
    amount: string;
    bankIin: string;
    mobile: string;
    aadhaarNumber: string;
    latitude?: string;
    longitude?: string;
    channel?: "APP" | "WEB";
    endpointIp?: string;
  },
): Promise<NobleApOtpResult> {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: input.endpointIp,
    latitude: input.latitude,
    longitude: input.longitude,
    channel: input.channel,
  });
  requireNobleGeo(ctx);
  if (!ctx.live) throw notConfigured();
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/ap_generate_otp", {
    ...nobleDeviceBody(ctx),
    transactionId: nobleTxnId("NAPO"),
    tranType: "MT",
    amount: input.amount,
    bankIn: input.bankIin,
    mobileNumber: input.mobile,
    aadhaarNumber: input.aadhaarNumber,
  });
  if (!nobleOk(json, httpStatus)) {
    throw nobleFailure(json, httpStatus, "Could not send the Aadhaar Pay OTP. Try again.", "NOBLE_AP_OTP_FAILED");
  }
  const row = firstResponseRow(json);
  return {
    otpRequired: String(row.otpRequired ?? "").toUpperCase() === "YES",
    otpReference: String(row.otpReference ?? ""),
    otpTransactionId: String(row.otpTransactionId ?? ""),
    otpTransactionToken: String(row.otpTransactionToken ?? ""),
  };
}

/** Ensure retailer has a provider uniqueAgentId on the user row. */
export async function requireNobleAgentId(userId: string): Promise<string> {
  const [user] = await db
    .select({ nobleUniqueAgentId: users.nobleUniqueAgentId })
    .from(users)
    .where(eq(users.id, userId));
  const agentId = user?.nobleUniqueAgentId;
  if (!isUsableNobleAgentId(agentId)) {
    throw new HttpError(
      422,
      "Complete AEPS agent onboarding before using this service",
      "NOBLE_AGENT_REQUIRED",
    );
  }
  return agentId;
}
