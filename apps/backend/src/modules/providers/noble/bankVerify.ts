import { firstResponseRow } from "./aepsOps";
import { noblePost, type NobleApiResponse } from "./client";
import type { ProviderResult, ProviderTxnStatus } from "../types";

export type NobleBankCheckMethod = "pennyless" | "pennydrop";

const PATH: Record<NobleBankCheckMethod, string> = {
  pennyless: "/api/v1.0/verification/penniless",
  pennydrop: "/api/v1.0/verification/pennydrop",
};

export type BankCheckData = { beneficiaryName: string | null };

/**
 * Settled only by an explicit tranStatus (`status 1` + "Failed" = bank returned no account) or an
 * explicit `status 0` rejection. Provider errors (`status -1`, 5xx, unknown tranStatus) stay pending.
 */
function toResult(httpStatus: number, json: NobleApiResponse): ProviderResult<BankCheckData> {
  const row = firstResponseRow(json);
  const tran = String(row.tranStatus ?? "").trim().toLowerCase();
  const name = typeof row.beneficiaryName === "string" ? row.beneficiaryName.trim() : "";
  let status: ProviderTxnStatus;
  if (tran === "success") status = httpStatus < 400 && json.status === 1 ? "success" : "pending";
  else if (tran === "failed") status = "failed";
  else if (tran) status = "pending";
  else if (httpStatus < 500 && json.status === 0) status = "failed";
  else status = "pending";

  const detail =
    (typeof row.detail === "string" && row.detail) ||
    (typeof json.description === "string" && json.description) ||
    (typeof json.message === "string" && json.message) ||
    "";
  const message =
    status === "success"
      ? "Bank confirmed the account"
      : status === "pending"
        ? "Bank is still confirming this account"
        : detail && detail.toLowerCase() !== "failed"
          ? `Bank could not confirm this account: ${detail}`
          : "Bank could not confirm this account. Check the account number and IFSC.";

  return {
    success: status === "success",
    status,
    providerTxnId: (typeof row.apiTransactionId === "string" && row.apiTransactionId) || null,
    amount: null,
    message,
    data: { beneficiaryName: name || null },
    raw: json as unknown as Record<string, unknown>,
  };
}

export async function nobleBankAccountCheck(
  method: NobleBankCheckMethod,
  params: { accountNumber: string; ifsc: string; transactionId: string },
): Promise<ProviderResult<BankCheckData>> {
  const { httpStatus, json } = await noblePost("service", PATH[method], {
    accountNumber: params.accountNumber,
    ifsc: params.ifsc,
    transactionId: params.transactionId,
  });
  return toResult(httpStatus, json);
}

export async function nobleBankCheckStatus(transactionId: string): Promise<ProviderResult<BankCheckData>> {
  const { httpStatus, json } = await noblePost("service", "/api/v1.0/verification/penny_status_check", {
    transactionId,
  });
  return toResult(httpStatus, json);
}
