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

/** Provider bioType: 0 = fingerprint (FMR/FIR), 1 = iris, 2 = face (FID). */
export function nobleBioType(captureType?: "FINGER" | "FACE"): "0" | "2" {
  return captureType === "FACE" ? "2" : "0";
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
  /** Our txnRef — present only on money-moving calls, which must carry the live fix. */
  externalRef?: string;
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

  const savedLat = params.externalRef ? "" : user?.outletLatitude;
  const savedLng = params.externalRef ? "" : user?.outletLongitude;
  const latRaw = (params.latitude || savedLat || "").trim();
  const lngRaw = (params.longitude || savedLng || "").trim();
  // load_agent only needs uniqueAgentId; txn/2FA/KYC require geo (4 decimals).
  const latitude = geo4(latRaw);
  const longitude = geo4(lngRaw);

  return {
    uniqueAgentId,
    endpointIp: ipv4(params.endpointIp) || "127.0.0.1",
    latitude,
    longitude,
    channel: params.channel ?? "APP",
    mobileDeviceId: params.retailerUserId.replace(/-/g, "").slice(0, 32),
    userAgent: "AsanPayAndroid",
    live: isNobleConfigured() && !uniqueAgentId.startsWith("MOCK"),
  };
}

/** Provider wants exactly 4 decimals; a non-numeric value becomes "" so requireNobleGeo rejects it. */
function geo4(raw: string): string {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n.toFixed(4) : "";
}

/** Provider wants a plain IPv4; Express reports IPv4 clients as "::ffff:a.b.c.d". */
function ipv4(ip?: string): string {
  const v = (ip ?? "").trim().replace(/^::ffff:/i, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v : "";
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
