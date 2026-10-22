import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isNobleConfigured } from "../../config/env";
import { db } from "../../db/postgres";
import { users } from "../../db/postgres/schema";
import { encryptPII, decryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import { noblePost } from "../providers/noble/client";
import type { NobleAgentOnboardInput, NobleAgentStatusInput } from "./nobleOnboarding.validators";

export interface NobleAgentProfile {
  uniqueAgentId: string;
  agentCode: string;
  /** true when Noble API was called; false when keys missing (local mock id). */
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
 * Registers the retailer on Noble AEPS (agent_onboarding) and stores uniqueAgentId.
 * Without NOBLE_API_* keys, stores a MOCK id so UI can be developed before credentials land.
 */
export async function nobleAgentOnboard(
  userId: string,
  input: NobleAgentOnboardInput,
  ipAddress: string,
): Promise<NobleAgentProfile> {
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
    logger.info({ userId, agentCode, live: false }, "Noble agent onboarded (mock — keys not set)");
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
      "Noble agent onboarding failed";
    throw new HttpError(
      httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
      detail,
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_ONBOARD_FAILED",
    );
  }

  await persistNobleAgent(userId, input, agentCode, uniqueAgentId);
  logger.info({ userId, agentCode, live: true }, "Noble agent onboarded");
  return { uniqueAgentId, agentCode, live: true };
}

/**
 * Recovers uniqueAgentId via Noble agent_onboarding_status (agentCode + PAN).
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

  if (user.nobleUniqueAgentId) {
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
      "PAN is required to recover Noble agent id. Enter PAN or complete onboarding first.",
      "NOBLE_PAN_REQUIRED",
    );
  }

  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "Noble is not configured. Set NOBLE_API_KEY and NOBLE_API_VALUE in Coolify (or local .env).",
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
      "Noble agent onboarding status failed";
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
    onboarded: Boolean(id),
    uniqueAgentId: id,
    agentCode: user.nobleAgentCode,
    live: Boolean(id && !id.startsWith("MOCK")),
  };
}
