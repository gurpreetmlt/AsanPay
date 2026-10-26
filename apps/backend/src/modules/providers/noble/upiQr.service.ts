import {
  firstResponseRow,
  nobleDeviceBody,
  nobleOk,
  nobleTxnId,
  requireNobleGeo,
  resolveNobleAgentContext,
} from "./aepsOps";
import { noblePost } from "./client";
import { HttpError } from "../../../utils/httpError";
import type { ProviderResult } from "../types";

export async function nobleUpiQrLoad(userId: string, opts: { endpointIp?: string; channel?: "APP" | "WEB" }) {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: opts.endpointIp,
    channel: opts.channel,
  });
  if (!ctx.live) {
    return { kycRequired: false, kycWadhValue: "", live: false, raw: { mock: true } };
  }
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/upiqr_load_agent", {
    uniqueAgentId: ctx.uniqueAgentId,
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "UPI QR load agent failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_UPIQR_LOAD_FAILED",
    );
  }
  const row = firstResponseRow(json);
  return {
    kycRequired: String(row.kycRequired ?? "").toUpperCase() === "YES",
    kycWadhValue: String(row.kycWadhValue ?? ""),
    live: true,
    raw: row,
  };
}

export async function nobleUpiQrKyc(
  userId: string,
  input: {
    biometricPayload: string;
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
    throw new HttpError(503, "AEPS provider is not configured on the server. Contact support.", "NOBLE_NOT_CONFIGURED");
  }
  const transactionId = nobleTxnId("NUQK");
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/upiqr_kyc", {
    ...nobleDeviceBody(ctx),
    transactionId,
    bioType: "0",
    pidData: input.biometricPayload,
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "UPI QR KYC failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_UPIQR_KYC_FAILED",
    );
  }
  return { transactionId, live: true, raw: firstResponseRow(json) };
}

export interface UpiQrGenerateInput {
  amount: string;
  mobileNumber: string;
  latitude?: string;
  longitude?: string;
  channel?: "APP" | "WEB";
  endpointIp?: string;
  deviceOsType?: string;
  deviceOsVersion?: string;
  deviceModel?: string;
}

/** Agent id, geo and provider keys — checked before a txn row exists so setup errors never record one. */
export async function prepareNobleUpiQr(userId: string, input: UpiQrGenerateInput) {
  const ctx = await resolveNobleAgentContext({
    retailerUserId: userId,
    endpointIp: input.endpointIp,
    latitude: input.latitude,
    longitude: input.longitude,
    channel: input.channel,
  });
  requireNobleGeo(ctx);
  if (!ctx.live) {
    throw new HttpError(503, "AEPS provider is not configured on the server. Contact support.", "NOBLE_NOT_CONFIGURED");
  }
  return ctx;
}

/**
 * Generates the QR for a recorded UPI Cash Point txn (`transactionId` = our txnRef). A generated
 * QR is `pending` until the customer pays; a provider rejection is `failed` (no money has moved).
 */
export async function nobleUpiQrCollect(
  ctx: Awaited<ReturnType<typeof prepareNobleUpiQr>>,
  input: UpiQrGenerateInput & { transactionId: string },
): Promise<ProviderResult> {
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/upiqr_generate", {
    ...nobleDeviceBody(ctx),
    transactionId: input.transactionId,
    amount: input.amount,
    mobileNumber: input.mobileNumber,
    deviceOsType: input.deviceOsType || "ANDROID",
    deviceOsVersion: input.deviceOsVersion || "13",
    deviceModel: input.deviceModel || "AsanPay",
  });
  const row = firstResponseRow(json);
  const qr = String(row.qr ?? "");
  const raw = json as unknown as Record<string, unknown>;
  const rejected = !nobleOk(json, httpStatus);
  if (rejected || !qr) {
    const providerMessage = typeof json.description === "string" ? json.description.trim() : "";
    return {
      success: false,
      status: "failed",
      providerTxnId: null,
      amount: null,
      message:
        rejected && providerMessage
          ? `UPI QR not generated: ${providerMessage}`
          : "The bank did not return a UPI QR. Try again.",
      data: {},
      raw,
    };
  }
  const apiTransactionId = String(row.apiTransactionId ?? "");
  return {
    success: false,
    status: "pending",
    providerTxnId: apiTransactionId || null,
    amount: null,
    message: "QR generated. Waiting for the customer to pay.",
    data: {
      qr,
      transactionId: String(row.transactionId ?? input.transactionId),
      apiTransactionId,
      referenceNumber: String(row.referenceNumber ?? ""),
    },
    raw,
  };
}
