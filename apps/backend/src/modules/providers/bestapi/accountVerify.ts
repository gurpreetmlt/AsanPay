import { bestApiConfigured, bestApiPost, type BestApiJson } from "./client";
import { logger } from "../../../utils/logger";

const PATH = "/api/gw/banking/verification/account";
const TIMEOUT_MS = 12_000;

/** Statuses where the bank answered but the account cannot take money. */
const DEAD_STATUSES = new Set(["INACTIVE", "CLOSED", "DORMANT", "FROZEN", "BLOCKED", "INOPERATIVE"]);
const INVALID_MSG = /invalid|not\s*found|does\s*not\s*exist|no\s*such|closed|dormant|incorrect|wrong\s*account/i;

export type BestApiAccountCheck =
  | { outcome: "verified"; beneficiaryName: string; bankName: string | null; branchName: string | null; mode: string | null }
  /** The bank answered: this account is wrong or not usable. Do not spend on another provider. */
  | { outcome: "invalid"; message: string }
  /** Provider problem (down, timeout, unknown shape, no name) — try the next provider. */
  | { outcome: "error"; message: string };

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function classifyBestApiAccount(httpStatus: number, json: BestApiJson): BestApiAccountCheck {
  const data = rec(json.data);
  const resp = rec(data.response);
  const status = str(data.status).toLowerCase();
  const msg = str(data.msg) || str(json.message) || str(rec(json.error).message) || str(json.error);
  const name = str(resp.beneficiary_name);
  const accountStatus = str(resp.account_status).toUpperCase();

  if (httpStatus < 400 && json.success === true && status === "success") {
    if (accountStatus && DEAD_STATUSES.has(accountStatus)) {
      return { outcome: "invalid", message: `The bank says this account is ${accountStatus.toLowerCase()}. Check with the customer.` };
    }
    if (name) {
      return {
        outcome: "verified",
        beneficiaryName: name,
        bankName: str(resp.bank_name) || null,
        branchName: str(resp.branch_name) || null,
        mode: str(data.mode) || null,
      };
    }
    return { outcome: "error", message: "Bank confirmed the account but returned no name" };
  }
  if (httpStatus < 500 && msg && INVALID_MSG.test(msg)) {
    return { outcome: "invalid", message: `The bank could not find this account: ${msg}` };
  }
  return { outcome: "error", message: msg || `Bank check service returned HTTP ${httpStatus}` };
}

export async function bestApiAccountCheck(params: { accountNumber: string; ifsc: string }): Promise<BestApiAccountCheck> {
  if (!bestApiConfigured()) return { outcome: "error", message: "BestAPI is not configured" };
  try {
    const { httpStatus, json } = await bestApiPost(
      PATH,
      { ifsc: params.ifsc, accountNo: params.accountNumber },
      undefined,
      TIMEOUT_MS,
    );
    const result = classifyBestApiAccount(httpStatus, json);
    logger.info({ path: PATH, httpStatus, outcome: result.outcome }, "BestAPI account check");
    return result;
  } catch (err) {
    return { outcome: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
