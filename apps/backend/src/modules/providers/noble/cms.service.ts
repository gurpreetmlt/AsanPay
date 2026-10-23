import { HttpError } from "../../../utils/httpError";
import { isNobleConfigured } from "../../../config/env";
import { firstResponseRow, nobleOk, nobleTxnId } from "./aepsOps";
import { noblePost } from "./client";

export async function nobleCmsStart(input: { merchantId: string; transactionId?: string }) {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const merchantId = input.merchantId.replace(/\D/g, "").slice(0, 10);
  if (!/^\d{1,10}$/.test(merchantId)) {
    throw new HttpError(400, "Enter a valid merchant id (up to 10 digits)", "NOBLE_CMS_MERCHANT_INVALID");
  }
  const transactionId = (input.transactionId || nobleTxnId("NCMS")).slice(0, 25);
  if (transactionId.length < 12) {
    throw new HttpError(400, "CMS transaction id must be 12–25 characters", "NOBLE_CMS_TXN_ID_INVALID");
  }

  const { httpStatus, json } = await noblePost("cms", "/api/v1.0/airtel_cms/start", {
    merchantId,
    transactionId,
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "CMS start failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_CMS_START_FAILED",
    );
  }
  const row = firstResponseRow(json);
  const redirectionUrl = String(row.redirectionUrl ?? "");
  if (!redirectionUrl) {
    throw new HttpError(502, "CMS start succeeded but redirection URL is missing", "NOBLE_CMS_NO_URL");
  }
  return { transactionId, merchantId, redirectionUrl, raw: row };
}

export async function nobleCmsStatus(transactionId: string) {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "AEPS provider is not configured on the server. Contact support.",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const id = transactionId.trim();
  if (id.length < 12 || id.length > 25) {
    throw new HttpError(400, "CMS transaction id must be 12–25 characters", "NOBLE_CMS_TXN_ID_INVALID");
  }
  const { httpStatus, json } = await noblePost("cms", "/api/v1.0/airtel_cms/status_check", {
    transactionId: id,
  });
  if (!nobleOk(json, httpStatus) && json.status !== 1) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "CMS status failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_CMS_STATUS_FAILED",
    );
  }
  const row = firstResponseRow(json);
  return {
    transactionId: id,
    tranStatus: String(row.tranStatus ?? ""),
    amount: String(row.amount ?? ""),
    utr: String(row.utr ?? ""),
    raw: row,
  };
}
