import { createHmac } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { UserRole } from "@asanpay/shared-types";
import { db } from "../../db/postgres";
import { bankNameChecks } from "../../db/postgres/schema";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { fromPaise, toPaise } from "../wallet/decimal";
import {
  BANK_CHECK_SERVICE,
  nobleBankAccountCheck,
  type BankCheckMethod,
} from "../providers/noble/bankVerify";
import { executeServiceTxn, recheckTxnStatus, type TxnOutcome } from "./txn.service";

type Actor = { id: string; role: UserRole };

/** A bank-confirmed name is reused for this long before the agent pays again. */
const CACHE_DAYS = 90;
const PENDING_RECHECK_MS = 3_000;
const ORDER: BankCheckMethod[] = ["pennyless", "pennydrop"];

export interface BankNameCheckResult {
  status: "verified" | "not_confirmed" | "pending";
  bankName: string | null;
  method: BankCheckMethod | null;
  /** Rupees debited from the agent's main wallet for this request. */
  charged: string;
  cached: boolean;
  txnRefs: string[];
  message: string;
}

export function bankCheckPrices() {
  return { nameCheck: env.BANK_NAME_CHECK_COST, pennyDrop: env.BANK_PENNY_DROP_COST };
}

/** Keyed hash: account numbers are short digit strings, so a plain hash could be brute-forced. */
function accountHash(accountNumber: string): string {
  return createHmac("sha256", env.AES_ENCRYPTION_KEY).update(`bank-account:${accountNumber}`).digest("hex");
}

function debitTotal(txn: TxnOutcome["txn"]): number {
  return toPaise(String(txn.amount)) + toPaise(String(txn.customerFee ?? "0")) + toPaise(String(txn.customerFeeGst ?? "0"));
}

function runCheck(
  actor: Actor,
  method: BankCheckMethod,
  account: { accountNumber: string; ifsc: string },
  idempotencyKey: string,
): Promise<TxnOutcome> {
  return executeServiceTxn({
    actor,
    serviceCode: BANK_CHECK_SERVICE[method],
    amount: method === "pennyless" ? env.BANK_NAME_CHECK_COST : env.BANK_PENNY_DROP_COST,
    idempotencyKey,
    operation: "bank_name_check",
    direction: "debit",
    walletType: "main",
    metadata: { method, accountLast4: account.accountNumber.slice(-4), ifsc: account.ifsc },
    quietFailure: true,
    invoke: async (routed, txnRef) =>
      routed.adapter.code === "noble"
        ? nobleBankAccountCheck(method, { ...account, transactionId: txnRef })
        : {
            success: false,
            status: "failed",
            providerTxnId: null,
            amount: null,
            message: "Bank name check is not available on the active provider. Contact support.",
            data: {},
            raw: { provider: routed.adapter.code },
          },
  });
}

export async function runBankNameCheck(
  actor: Actor,
  input: { accountNumber: string; ifsc: string; idempotencyKey: string },
): Promise<BankNameCheckResult> {
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  if (!/^\d{6,18}$/.test(accountNumber)) {
    throw new HttpError(422, "Account number must be 6–18 digits", "INVALID_ACCOUNT_NUMBER");
  }
  const ifsc = input.ifsc.trim().toUpperCase();
  const hash = accountHash(accountNumber);

  const since = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);
  const [hit] = await db
    .select()
    .from(bankNameChecks)
    .where(and(eq(bankNameChecks.accountHash, hash), eq(bankNameChecks.ifsc, ifsc), gt(bankNameChecks.createdAt, since)))
    .orderBy(desc(bankNameChecks.createdAt))
    .limit(1);
  if (hit) {
    return {
      status: "verified",
      bankName: hit.bankName,
      method: hit.method as BankCheckMethod,
      charged: "0.00",
      cached: true,
      txnRefs: [],
      message: "Name from an earlier bank check of this account — no charge",
    };
  }

  const txnRefs: string[] = [];
  for (const method of ORDER) {
    let outcome = await runCheck(actor, method, { accountNumber, ifsc }, `${input.idempotencyKey}:${method}`);
    txnRefs.push(outcome.txn.txnRef);

    if (outcome.txn.status === "pending" || outcome.txn.status === "initiated") {
      await new Promise((r) => setTimeout(r, PENDING_RECHECK_MS));
      outcome = await recheckTxnStatus(actor, outcome.txn.txnRef);
    }

    if (outcome.txn.status === "success") {
      const fromProvider = outcome.provider?.data?.beneficiaryName;
      let bankName = typeof fromProvider === "string" && fromProvider.trim() ? fromProvider.trim() : null;
      const [saved] = await db
        .select({ bankName: bankNameChecks.bankName })
        .from(bankNameChecks)
        .where(eq(bankNameChecks.txnRef, outcome.txn.txnRef))
        .limit(1);
      if (saved) {
        bankName = bankName ?? saved.bankName;
      } else {
        await db.insert(bankNameChecks).values({
          userId: actor.id,
          accountHash: hash,
          accountLast4: accountNumber.slice(-4),
          ifsc,
          method,
          bankName: bankName?.slice(0, 160) ?? null,
          txnRef: outcome.txn.txnRef,
        });
      }
      return {
        status: "verified",
        bankName,
        method,
        charged: fromPaise(debitTotal(outcome.txn)),
        cached: false,
        txnRefs,
        message: bankName
          ? "Bank confirmed the account holder name"
          : "Bank confirmed the account but did not return a name",
      };
    }

    if (outcome.txn.status === "pending" || outcome.txn.status === "initiated") {
      return {
        status: "pending",
        bankName: null,
        method,
        charged: "0.00",
        cached: false,
        txnRefs,
        message:
          "The bank is still confirming this account. Check this transaction in History in a few minutes — you pay only if the bank confirms.",
      };
    }
    // Failed: the engine already refunded the wallet; try the next method.
  }

  return {
    status: "not_confirmed",
    bankName: null,
    method: null,
    charged: "0.00",
    cached: false,
    txnRefs,
    message: "The bank could not confirm this account. Check the account number and IFSC. You were not charged.",
  };
}
