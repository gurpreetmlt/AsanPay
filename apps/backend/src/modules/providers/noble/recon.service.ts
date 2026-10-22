import { isNobleConfigured } from "../../../config/env";
import { HttpError } from "../../../utils/httpError";
import { nobleOk } from "./aepsOps";
import { noblePost } from "./client";

export type NobleReconTxnType = "CW" | "MT" | "QR" | "CD";

/**
 * Submit daily recon to Noble (mandatory for month-end commission).
 * reconData entries: "status~clientTxnId~apiTxnId" (vendor format).
 */
export async function nobleSubmitRecon(input: {
  uniqueDateTransactionId: string;
  transactionType: NobleReconTxnType;
  /** DD/MM/YYYY */
  transactionDate: string;
  reconData: string[];
}) {
  if (!isNobleConfigured()) {
    throw new HttpError(
      503,
      "Noble is not configured. Set NOBLE_API_KEY and NOBLE_API_VALUE in Coolify (or local .env).",
      "NOBLE_NOT_CONFIGURED",
    );
  }
  const uniqueDateTransactionId = input.uniqueDateTransactionId.trim();
  if (uniqueDateTransactionId.length < 10 || uniqueDateTransactionId.length > 15) {
    throw new HttpError(
      400,
      "uniqueDateTransactionId must be 10–15 characters",
      "NOBLE_RECON_ID_INVALID",
    );
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(input.transactionDate)) {
    throw new HttpError(400, "transactionDate must be DD/MM/YYYY", "NOBLE_RECON_DATE_INVALID");
  }
  if (!input.reconData.length || input.reconData.length > 500) {
    throw new HttpError(400, "reconData must have 1–500 records", "NOBLE_RECON_DATA_INVALID");
  }

  const { httpStatus, json } = await noblePost("aeps", "/v2.0/aeps/recon", {
    uniqueDateTransactionId,
    transactionType: input.transactionType,
    transactionDate: input.transactionDate,
    reconData: input.reconData,
  });
  if (!nobleOk(json, httpStatus)) {
    throw new HttpError(
      502,
      (typeof json.description === "string" && json.description) || "Noble recon failed",
      typeof json.statusCode === "string" ? json.statusCode : "NOBLE_RECON_FAILED",
    );
  }
  return {
    ok: true,
    message: String(json.description || json.message || "Recon data processed successfully."),
  };
}
