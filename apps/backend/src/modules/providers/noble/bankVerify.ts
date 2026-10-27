import { firstResponseRow } from "./aepsOps";
import { noblePost, type NobleApiResponse } from "./client";
import type { ProviderResult, ProviderTxnStatus } from "../types";

export type BankCheckMethod = "pennyless" | "pennydrop";

export const BANK_CHECK_SERVICE: Record<BankCheckMethod, string> = {
  pennyless: "BANK_NAME_CHECK",
  pennydrop: "BANK_PENNY_DROP",
};

const PATH: Record<BankCheckMethod, string> = {
  pennyless: "/api/v1.0/verification/penniless",
  pennydrop: "/api/v1.0/verification/pennydrop",
};

export type BankCheckData = { beneficiaryName: string | null };

/** Only an explicit tranStatus settles the check; `status 1` + "Failed" means the bank returned no account. */
function toResult(httpStatus: number, json: NobleApiResponse): ProviderResult<BankCheckData> {
  const row = firstResponseRow(json);
  const tran = String(row.tranStatus ?? "").toLowerCase();
  const name = typeof row.beneficiaryName === "string" ? row.beneficiaryName.trim() : "";
  let status: ProviderTxnStatus;
  if (httpStatus < 400 && json.status === 1 && tran === "success") status = "success";
  else if (tran === "pending" || tran === "processing") status = "pending";
  else if (httpStatus >= 500) status = "pending";
  else status = "failed";

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
  method: BankCheckMethod,
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
