import { eq } from "drizzle-orm";
import { isUsableNobleAgentId } from "../../config/env";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import {
  firstResponseRow,
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
