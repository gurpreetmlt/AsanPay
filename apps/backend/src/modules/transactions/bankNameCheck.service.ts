import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNotNull, or, ne } from "drizzle-orm";
import type { UserRole } from "@asanpay/shared-types";
import { db } from "../../db/postgres";
import { bankNameChecks, transactions, users, wallets } from "../../db/postgres/schema";
import { env, isNobleConfigured } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { fromPaise, toPaise } from "../wallet/decimal";
import { bestApiAccountCheck } from "../providers/bestapi/accountVerify";
import { nobleTxnId } from "../providers/noble/aepsOps";
import {
  nobleBankAccountCheck,
  nobleBankCheckStatus,
  type NobleBankCheckMethod,
} from "../providers/noble/bankVerify";
import type { ProviderResult } from "../providers/types";
import { resolveTenantId } from "../fund-requests/tenant";
import { getTenantSettings } from "../tenants/tenantSettings.service";
import { executeServiceTxn } from "./txn.service";
import { enabledProviders, verificationOffError } from "../verifications/verificationRouting.service";

type Actor = { id: string; role: UserRole };

export type BankCheckMethod = "bestapi" | NobleBankCheckMethod;
export type BankCheckPurpose = "dmt_payee" | "settlement_bank" | "company_bank" | "signup_bank";

/** A bank-confirmed name is reused for this long before anyone pays again. */
const CACHE_DAYS = 90;
const PENDING_RECHECK_MS = 3_000;
const CHARGE_SERVICE = { standard: "BANK_NAME_CHECK", pennyDrop: "BANK_PENNY_DROP" } as const;

export interface BankAccountVerification {
  status: "verified" | "not_confirmed" | "pending";
  /** Account holder name as the bank returned it. */
  bankName: string | null;
  method: BankCheckMethod | null;
  cached: boolean;
  message: string;
  /** Log row of the verifying hit (null when cached or not verified). */
  checkId: string | null;
  /** Log row that holds the confirmed name, cached or fresh — usable as a verification reference. */
  refId: string | null;
}

export interface BankNameCheckResult extends Omit<BankAccountVerification, "checkId"> {
  /** Rupees debited from the agent's main wallet for this request. */
  charged: string;
  txnRefs: string[];
}

const NOT_CONFIRMED = "The bank could not confirm this account. Check the account number and IFSC.";

/** Keyed hash: account numbers are short digit strings, so a plain hash could be brute-forced. */
function accountHash(accountNumber: string): string {
  return createHmac("sha256", env.AES_ENCRYPTION_KEY).update(`bank-account:${accountNumber}`).digest("hex");
}

function providerCost(method: BankCheckMethod): string {
  if (method === "pennyless") return env.BANK_NAME_CHECK_COST;
  if (method === "pennydrop") return env.BANK_PENNY_DROP_COST;
  return "0.00";
}

function normalize(accountNumberRaw: string, ifscRaw: string) {
  const accountNumber = accountNumberRaw.replace(/\D/g, "");
  if (!/^\d{6,18}$/.test(accountNumber)) {
    throw new HttpError(422, "Account number must be 6–18 digits", "INVALID_ACCOUNT_NUMBER");
  }
  const ifsc = ifscRaw.trim().toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new HttpError(422, "Enter a valid 11-character IFSC (e.g. SBIN0001234)", "INVALID_IFSC");
  }
  return { accountNumber, ifsc };
}

export async function bankCheckPrices(): Promise<{ standard: string; pennyDrop: string }> {
  const s = await getTenantSettings(await resolveTenantId());
  return { standard: s.bankCheckPriceRupees.toFixed(2), pennyDrop: s.bankCheckPennyDropPriceRupees.toFixed(2) };
}

async function noblePolled(method: NobleBankCheckMethod, account: { accountNumber: string; ifsc: string }) {
  const transactionId = nobleTxnId("BNC");
  try {
    let result = await nobleBankAccountCheck(method, { ...account, transactionId });
    if (result.status === "pending") {
      await new Promise((r) => setTimeout(r, PENDING_RECHECK_MS));
      result = await nobleBankCheckStatus(transactionId);
    }
    return result;
  } catch (err) {
    return { status: "failed" as const, message: err instanceof Error ? err.message : String(err), data: { beneficiaryName: null } };
  }
}

/**
 * Provider chain, no charge: BestAPI (free) → provider pennyless → ₹1 penny drop. Stops as soon as
 * a name comes back, or when the bank says the account itself is wrong. Every hit is logged with its cost.
 * `bestApiOnly` stops after BestAPI (signup: free check, nothing paid).
 */
export async function verifyBankAccount(input: {
  userId: string;
  accountNumber: string;
  ifsc: string;
  purpose: BankCheckPurpose;
  bestApiOnly?: boolean;
}): Promise<BankAccountVerification> {
  const { accountNumber, ifsc } = normalize(input.accountNumber, input.ifsc);
  const hash = accountHash(accountNumber);

  const since = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);
  const [hit] = await db
    .select({ id: bankNameChecks.id, bankName: bankNameChecks.bankName, method: bankNameChecks.method })
    .from(bankNameChecks)
    .where(
      and(
        eq(bankNameChecks.accountHash, hash),
        eq(bankNameChecks.ifsc, ifsc),
        eq(bankNameChecks.status, "verified"),
        gt(bankNameChecks.createdAt, since),
        // An agent check is cacheable only once paid; company / settlement checks are not charged.
        or(isNotNull(bankNameChecks.txnRef), ne(bankNameChecks.purpose, "dmt_payee")),
      ),
    )
    .orderBy(desc(bankNameChecks.createdAt))
    .limit(1);
  if (hit) {
    return {
      status: "verified",
      bankName: hit.bankName,
      method: hit.method as BankCheckMethod,
      cached: true,
      message: "Name from an earlier bank check of this account",
      checkId: null,
      refId: hit.id,
    };
  }

  const log = async (method: BankCheckMethod, status: string, bankName: string | null, detail: string | null) => {
    const [row] = await db
      .insert(bankNameChecks)
      .values({
        userId: input.userId,
        accountHash: hash,
        accountLast4: accountNumber.slice(-4),
        ifsc,
        method,
        status,
        purpose: input.purpose,
        bankName: bankName?.slice(0, 160) ?? null,
        detail: detail?.slice(0, 200) ?? null,
        costRupees: providerCost(method),
      })
      .returning({ id: bankNameChecks.id });
    return row!.id;
  };
  const verified = (method: BankCheckMethod, bankName: string, checkId: string): BankAccountVerification => ({
    status: "verified",
    bankName,
    method,
    cached: false,
    message: "Bank confirmed the account holder name",
    checkId,
    refId: checkId,
  });

  const steps = await enabledProviders("bank_account");
  const usable = input.bestApiOnly ? steps.filter((s) => s === "bestapi") : steps;
  if (usable.length === 0) throw verificationOffError("bank_account");

  for (const step of usable) {
    if (step === "bestapi") {
      const best = await bestApiAccountCheck({ accountNumber, ifsc });
      if (best.outcome === "verified") {
        const id = await log("bestapi", "verified", best.beneficiaryName, best.mode ? `mode ${best.mode}` : null);
        return verified("bestapi", best.beneficiaryName, id);
      }
      await log("bestapi", best.outcome === "invalid" ? "invalid" : "failed", null, best.message);
      if (best.outcome === "invalid") {
        return { status: "not_confirmed", bankName: null, method: "bestapi", cached: false, message: best.message, checkId: null, refId: null };
      }
      continue;
    }
    if (step !== "noble_pennyless" && step !== "noble_pennydrop") continue;
    if (!isNobleConfigured()) continue;
    const method = step === "noble_pennyless" ? "pennyless" : "pennydrop";
    const r = await noblePolled(method, { accountNumber, ifsc });
    const name = r.data.beneficiaryName;
    if (r.status === "success" && name) return verified(method, name, await log(method, "verified", name, null));
    await log(method, r.status === "pending" ? "pending" : "failed", null, r.message);
    if (method === "pennydrop" && r.status === "pending") {
      return {
        status: "pending",
        bankName: null,
        method,
        cached: false,
        message: "The bank is still confirming this account. Try again in a few minutes — you are not charged now.",
        checkId: null,
        refId: null,
      };
    }
  }
  return { status: "not_confirmed", bankName: null, method: null, cached: false, message: NOT_CONFIRMED, checkId: null, refId: null };
}

/** Agent must be able to pay before any provider is called. */
export async function assertAgentCanPay(userId: string, priceRupees: string): Promise<void> {
  const [user] = await db
    .select({ isActive: users.isActive, kycStatus: users.kycStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isActive) throw new HttpError(403, "This account is inactive. Contact support.", "ACCOUNT_INACTIVE");
  if (user.kycStatus !== "verified") {
    throw new HttpError(403, "Complete KYC verification to verify bank accounts", "KYC_NOT_VERIFIED");
  }
  const [wallet] = await db
    .select({ balance: wallets.balance, hold: wallets.holdBalance })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.walletType, "main")))
    .limit(1);
  const available = wallet ? toPaise(String(wallet.balance)) - toPaise(String(wallet.hold ?? "0")) : 0;
  if (available < toPaise(priceRupees)) {
    throw new HttpError(
      422,
      `Add at least ₹${priceRupees} to your main wallet to verify a bank account`,
      "INSUFFICIENT_BALANCE",
    );
  }
}

/** Agent-paid check (DMT payee, settlement bank): run the chain, then charge once for the step that answered. */
export async function runBankNameCheck(
  actor: Actor,
  input: { accountNumber: string; ifsc: string; idempotencyKey: string },
  purpose: Extract<BankCheckPurpose, "dmt_payee" | "settlement_bank"> = "dmt_payee",
): Promise<BankNameCheckResult> {
  const chargeKey = `${input.idempotencyKey}:charge`;
  const [replay] = await db
    .select({ txnRef: transactions.txnRef, status: transactions.status })
    .from(transactions)
    .where(and(eq(transactions.userId, actor.id), eq(transactions.idempotencyKey, chargeKey)))
    .limit(1);
  if (replay) {
    const [row] = await db
      .select({ id: bankNameChecks.id, bankName: bankNameChecks.bankName, method: bankNameChecks.method })
      .from(bankNameChecks)
      .where(eq(bankNameChecks.txnRef, replay.txnRef))
      .limit(1);
    return {
      status: "verified",
      bankName: row?.bankName ?? null,
      method: (row?.method as BankCheckMethod | undefined) ?? null,
      cached: false,
      message: "Bank confirmed the account holder name",
      refId: row?.id ?? null,
      charged: "0.00",
      txnRefs: [replay.txnRef],
    };
  }

  const prices = await bankCheckPrices();
  await assertAgentCanPay(actor.id, prices.standard);

  const v = await verifyBankAccount({ userId: actor.id, ...input, purpose });
  const base = { status: v.status, bankName: v.bankName, method: v.method, cached: v.cached, message: v.message, refId: v.refId };
  if (v.status !== "verified" || v.cached || !v.checkId || !v.method) {
    return {
      ...base,
      message: v.cached ? "Checked earlier — no charge" : v.status === "verified" ? v.message : `${v.message} You were not charged.`,
      charged: "0.00",
      txnRefs: [],
    };
  }

  const pennyDrop = v.method === "pennydrop";
  const price = pennyDrop ? prices.pennyDrop : prices.standard;
  const cost = providerCost(v.method);
  const fee = fromPaise(Math.max(toPaise(price) - toPaise(cost), 0));
  const { accountNumber, ifsc } = normalize(input.accountNumber, input.ifsc);
  const answered: ProviderResult = {
    success: true,
    status: "success",
    providerTxnId: null,
    amount: null,
    message: "Bank confirmed the account holder name",
    data: { method: v.method },
    raw: { method: v.method, checkId: v.checkId },
  };

  let outcome;
  try {
    outcome = await executeServiceTxn({
      actor,
      serviceCode: pennyDrop ? CHARGE_SERVICE.pennyDrop : CHARGE_SERVICE.standard,
      amount: cost,
      serverFee: fee,
      idempotencyKey: chargeKey,
      operation: "bank_name_check",
      direction: "debit",
      walletType: "main",
      metadata: {
        purpose,
        method: v.method,
        provider: v.method === "bestapi" ? "bestapi" : "noble",
        accountLast4: accountNumber.slice(-4),
        ifsc,
        nameAsPerBank: v.bankName,
      },
      invoke: async () => answered,
    });
  } catch (err) {
    // Unpaid answers must not become a free cached result.
    await db.update(bankNameChecks).set({ status: "unpaid" }).where(eq(bankNameChecks.id, v.checkId));
    throw err;
  }
  await db.update(bankNameChecks).set({ txnRef: outcome.txn.txnRef }).where(eq(bankNameChecks.id, v.checkId));

  return { ...base, charged: price, txnRefs: [outcome.txn.txnRef] };
}
