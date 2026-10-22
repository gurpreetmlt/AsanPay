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
    throw new HttpError(503, "Noble is not configured. Set NOBLE_API_KEY and NOBLE_API_VALUE.", "NOBLE_NOT_CONFIGURED");
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

export async function nobleUpiQrGenerate(
  userId: string,
  input: {
    amount: string;
    mobileNumber: string;
    latitude?: string;
    longitude?: string;
    channel?: "APP" | "WEB";
    endpointIp?: string;
    deviceOsType?: string;
    deviceOsVersion?: string;
    deviceModel?: string;
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
    throw new HttpError(503, "Noble is not configured. Set NOBLE_API_KEY and NOBLE_API_VALUE.", "NOBLE_NOT_CONFIGURED");
  }
  const transactionId = nobleTxnId("NUQR");
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/upiqr_generate", {
    ...nobleDeviceBody(ctx),
    transactionId,
    amount: input.amount,
    mobileNumber: input.mobileNumber,
    deviceOsType: input.deviceOsType || "ANDROID",
    deviceOsVersion: input.deviceOsVersion || "13",
    deviceModel: input.deviceModel || "AsanPay",
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "UPI QR generate failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_UPIQR_GENERATE_FAILED",
    );
  }
  const row = firstResponseRow(json);
  return {
    transactionId: String(row.transactionId ?? transactionId),
    apiTransactionId: String(row.apiTransactionId ?? ""),
    referenceNumber: String(row.referenceNumber ?? ""),
    qr: String(row.qr ?? ""),
    live: true,
    raw: row,
  };
}

export async function nobleUpiQrStatus(input: { transactionId: string; transactionDate: string }) {
  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/upiqr_status", {
    transactionId: input.transactionId,
    transactionDate: input.transactionDate,
  });
  if (!nobleOk(json, httpStatus) && json.status !== 1) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "UPI QR status failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_UPIQR_STATUS_FAILED",
    );
  }
  return { live: true, raw: firstResponseRow(json), httpStatus, json };
}
