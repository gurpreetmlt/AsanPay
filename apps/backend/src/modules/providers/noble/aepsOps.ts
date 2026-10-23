import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isNobleConfigured, isUsableNobleAgentId } from "../../../config/env";
import { db } from "../../../db/postgres";
import { users } from "../../../db/postgres/schema";
import { HttpError } from "../../../utils/httpError";
import { noblePost, type NobleApiResponse } from "./client";

export interface NobleAgentContext {
  uniqueAgentId: string;
  endpointIp: string;
  latitude: string;
  longitude: string;
  channel: "APP" | "WEB";
  mobileDeviceId: string;
  userAgent: string;
  live: boolean;
}

export function nobleTxnId(prefix = "NWS"): string {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`.slice(0, 25);
}

export function firstResponseRow(json: NobleApiResponse): Record<string, unknown> {
  if (!Array.isArray(json.responseData) || json.responseData.length === 0) return {};
  const row = json.responseData[0];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

export function nobleOk(json: NobleApiResponse, httpStatus: number): boolean {
  return httpStatus < 400 && json.status === 1;
}

export async function resolveNobleAgentContext(params: {
  retailerUserId: string;
  outletId?: string;
  endpointIp?: string;
  latitude?: string;
  longitude?: string;
  channel?: "APP" | "WEB";
}): Promise<NobleAgentContext> {
  const [user] = await db
    .select({
      nobleUniqueAgentId: users.nobleUniqueAgentId,
      outletLatitude: users.outletLatitude,
      outletLongitude: users.outletLongitude,
    })
    .from(users)
    .where(eq(users.id, params.retailerUserId));

  const uniqueAgentId = (params.outletId || user?.nobleUniqueAgentId || "").trim();
  if (!isUsableNobleAgentId(uniqueAgentId)) {
    throw new HttpError(
      422,
      "Complete AEPS agent onboarding before using this service",
      "NOBLE_AGENT_REQUIRED",
    );
  }

  const latRaw = (params.latitude || user?.outletLatitude || "").trim();
  const lngRaw = (params.longitude || user?.outletLongitude || "").trim();
  // load_agent only needs uniqueAgentId; txn/2FA/KYC require geo (4 decimals).
  const latitude = latRaw ? Number(latRaw).toFixed(4) : "";
  const longitude = lngRaw ? Number(lngRaw).toFixed(4) : "";

  return {
    uniqueAgentId,
    endpointIp: params.endpointIp || "127.0.0.1",
    latitude,
    longitude,
    channel: params.channel ?? "APP",
    mobileDeviceId: params.retailerUserId.replace(/-/g, "").slice(0, 32),
    userAgent: "AsanPayAndroid",
    live: isNobleConfigured() && !uniqueAgentId.startsWith("MOCK"),
  };
}

export function requireNobleGeo(ctx: NobleAgentContext): void {
  if (!ctx.latitude || !ctx.longitude) {
    throw new HttpError(422, "Allow location access before continuing", "LOCATION_REQUIRED");
  }
}

/** Device + geo fields shared by most AEPS POSTs. */
export function nobleDeviceBody(ctx: NobleAgentContext): Record<string, string> {
  return {
    uniqueAgentId: ctx.uniqueAgentId,
    channel: ctx.channel,
    mobileDeviceId: ctx.mobileDeviceId,
    ipAddress: ctx.endpointIp,
    userAgent: ctx.userAgent.slice(0, 50),
    latitude: ctx.latitude,
    longitude: ctx.longitude,
  };
}
