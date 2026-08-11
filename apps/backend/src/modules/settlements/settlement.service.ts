import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  accounts,
  accountBalances,
  agentSettlementAccounts,
  bankAccounts,
  settlementRequests,
  users,
  wallets,
  walletIdempotency,
} from "../../db/postgres/schema";
import {
  postJournal,
  reverseJournal,
  invalidateAccount,
  type Tx,
} from "../../core/ledger";
import { ensureHierarchyAccount } from "../wallet/ledgerAccounts";
import { decryptPII, encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { paiseToRupees, rupeesToPaise, type Paise } from "../../core/money";
import { randomInt, timingSafeEqual } from "node:crypto";
import { hashToken } from "../../utils/uid";
import { shouldExposeOtpInResponse, getTestOtpOverride } from "../../config/env";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
} from "../../db/postgres/repositories/otpRequest";
import { getTenantSettings } from "../tenants/tenantSettings.service";

const SETTLE_PAYABLE = "TREASURY_SETTLE_PAYABLE";
const FEE_INCOME = "COMMISSION_INCOME";
const SETTLEMENT_BANK_OTP_TTL_MS = 5 * 60 * 1000;

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type SettlementStatus = (typeof settlementRequests.$inferSelect)["status"];

/** Pack a bigint id into the uuid-shaped wallet_idempotency.ledger_group_id column. */
function encodeIdemUuid(id: bigint): string {
  const hex = id.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function decodeIdemUuid(uuid: string): bigint {
  return BigInt(`0x${uuid.replace(/-/g, "")}`);
}

function settleIdemKey(clientKey: string): string {
  return `SETTLE:${clientKey}`;
}

/**
 * Mirror ledger balance/settleable onto the legacy wallet rows so dashboards and mobile keep
 * showing the right AePS (settleable) vs main (usable) split after a settlement debit/reversal.
 */
async function mirrorAgentWallets(tx: Tx, tenantId: string, userId: string): Promise<void> {
  const [ledger] = await tx
    .select({
      balance: accountBalances.balance,
      settleable: accountBalances.settleable,
    })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.userId, userId)))
    .limit(1);

  if (!ledger) return;

  const walletRows = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .orderBy(asc(wallets.id))
    .for("update");

  for (const wallet of walletRows) {
    const target =
      wallet.walletType === "aeps" ? ledger.settleable : ledger.balance - ledger.settleable;
    const current = rupeesToPaise(wallet.balance);
    if (target === current) continue;
    await tx
      .update(wallets)
      .set({
        balance: paiseToRupees(target),
        version: wallet.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, wallet.id));
  }
}

// ---------------------------------------------------------------------------------------
// Settlement bank accounts
// ---------------------------------------------------------------------------------------

export async function registerSettlementBank(params: {
  tenantId: string;
  userId: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
  otp?: string;
}): Promise<{ settlementAccountId: bigint; accountNumberLast4: string; isActive: boolean }> {
  const digits = params.accountNumber.replace(/\s/g, "");
  if (!/^\d{6,18}$/.test(digits)) {
    throw new HttpError(422, "Account number must be 6–18 digits", "INVALID_ACCOUNT_NUMBER");
  }

  const [active] = await db
    .select({ id: agentSettlementAccounts.id })
    .from(agentSettlementAccounts)
    .where(
      and(
        eq(agentSettlementAccounts.userId, params.userId),
        eq(agentSettlementAccounts.tenantId, params.tenantId),
        eq(agentSettlementAccounts.isActive, true),
      ),
    )
    .limit(1);

  if (active) {
    if (!params.otp) {
      throw new HttpError(
        422,
        "OTP is required to change your settlement bank. Request an OTP first.",
        "OTP_REQUIRED",
      );
    }
    await consumeSettlementBankOtp(params.userId, params.otp);
  }

  const [row] = await db
    .insert(agentSettlementAccounts)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      accountNumberEnc: encryptPII(digits),
      accountNumberLast4: digits.slice(-4),
      ifsc: params.ifsc.toUpperCase(),
      holderName: params.holderName.trim(),
      isActive: false,
      createdBy: params.userId,
    })
    .returning({
      id: agentSettlementAccounts.id,
      accountNumberLast4: agentSettlementAccounts.accountNumberLast4,
      isActive: agentSettlementAccounts.isActive,
    });

  if (!row) {
    throw new HttpError(500, "Could not register settlement bank account", "BANK_CREATE_FAILED");
  }

  return {
    settlementAccountId: row.id,
    accountNumberLast4: row.accountNumberLast4,
    isActive: row.isActive,
  };
}

/** Send OTP before replacing an active settlement bank. */
export async function requestSettlementBankOtp(params: {
  userId: string;
}): Promise<{ expiresInSec: number; otp?: string }> {
  const [user] = await db
    .select({ mobile: users.mobile, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (!user?.isActive) {
    throw new HttpError(422, "Your account is inactive", "ACCOUNT_INACTIVE");
  }

  const override = getTestOtpOverride(user.mobile);
  const otp = override ?? String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + SETTLEMENT_BANK_OTP_TTL_MS);
  await insertOtpRequest({
    mobile: user.mobile,
    otpHash: hashToken(otp),
    purpose: "settlement_bank",
    expiresAt,
    meta: { userId: params.userId },
  });

  return {
    expiresInSec: Math.floor(SETTLEMENT_BANK_OTP_TTL_MS / 1000),
    ...(shouldExposeOtpInResponse() || override ? { otp } : {}),
  };
}

async function consumeSettlementBankOtp(userId: string, otp: string): Promise<void> {
  const [user] = await db
    .select({ mobile: users.mobile })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");

  const code = otp.trim();
  const override = getTestOtpOverride(user.mobile);
  // Pre-SMS: fixed TEST_OTP_OVERRIDES code is accepted for settlement bank change.
  if (override && override === code) {
    const activeOverride = await findLatestActiveOtp({
      mobile: user.mobile,
      purpose: "settlement_bank",
    });
    if (activeOverride) await markOtpConsumed(activeOverride.id);
    return;
  }

  const activeOtp = await findLatestActiveOtp({ mobile: user.mobile, purpose: "settlement_bank" });
  if (!activeOtp) {
    throw new HttpError(
      422,
      "OTP has expired or was not requested. Please request a new OTP.",
      "OTP_EXPIRED",
    );
  }
  if (activeOtp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(422, "Too many incorrect OTP attempts. Request a new OTP.", "OTP_LOCKED");
  }
  if (!otpHashesEqual(activeOtp.otpHash, code)) {
    await incrementOtpAttempts(activeOtp.id);
    throw new HttpError(422, "Incorrect OTP. Check the code and try again.", "OTP_INVALID");
  }
  await markOtpConsumed(activeOtp.id);
}

/**
 * Admin penny-drop / verification. Activating this row deactivates any other active bank for
 * the same user (one operator, one bank).
 */
export async function verifySettlementBank(params: {
  tenantId: string;
  settlementAccountId: bigint;
  adminId: string;
  verificationRef?: string;
  activate?: boolean;
}): Promise<{
  settlementAccountId: bigint;
  isActive: boolean;
  verifiedAt: Date;
  coolingUntil: Date | null;
}> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(agentSettlementAccounts)
      .where(
        and(
          eq(agentSettlementAccounts.id, params.settlementAccountId),
          eq(agentSettlementAccounts.tenantId, params.tenantId),
        ),
      )
      .for("update");

    if (!row) throw new HttpError(404, "Settlement bank account not found", "NOT_FOUND");
    if (row.createdBy === params.adminId) {
      throw new HttpError(
        422,
        "The operator who registered this bank account cannot also approve it",
        "MAKER_CHECKER",
      );
    }

    const activate = params.activate !== false;
    const verifiedAt = new Date();
    // Automated penny-drop placeholder: when admin omits a ref we mint a stable stub so the
    // row is auditable. Live bank penny-drop APIs plug in here later.
    const verificationRef =
      params.verificationRef?.trim() ||
      `PENNYDROP-STUB-${row.id}-${verifiedAt.getTime()}`;

    let hadPriorActive = false;
    if (activate) {
      const prior = await tx
        .select({ id: agentSettlementAccounts.id })
        .from(agentSettlementAccounts)
        .where(
          and(
            eq(agentSettlementAccounts.userId, row.userId),
            eq(agentSettlementAccounts.isActive, true),
          ),
        )
        .limit(1);
      hadPriorActive = prior.length > 0;

      await tx
        .update(agentSettlementAccounts)
        .set({ isActive: false })
        .where(
          and(
            eq(agentSettlementAccounts.userId, row.userId),
            eq(agentSettlementAccounts.isActive, true),
          ),
        );
    }

    // Spec: 24h cooling after a settlement bank change before withdrawals resume.
    const coolingUntil =
      activate && hadPriorActive ? new Date(verifiedAt.getTime() + 24 * 60 * 60 * 1000) : null;

    const [updated] = await tx
      .update(agentSettlementAccounts)
      .set({
        verifiedAt,
        verificationRef,
        approvedBy: params.adminId,
        isActive: activate,
        effectiveFrom: activate ? verifiedAt : row.effectiveFrom,
        coolingUntil: activate ? coolingUntil : row.coolingUntil,
      })
      .where(eq(agentSettlementAccounts.id, row.id))
      .returning({
        id: agentSettlementAccounts.id,
        isActive: agentSettlementAccounts.isActive,
        verifiedAt: agentSettlementAccounts.verifiedAt,
        coolingUntil: agentSettlementAccounts.coolingUntil,
      });

    if (!updated?.verifiedAt) {
      throw new HttpError(500, "Could not verify settlement bank account", "VERIFY_FAILED");
    }

    return {
      settlementAccountId: updated.id,
      isActive: updated.isActive,
      verifiedAt: updated.verifiedAt,
      coolingUntil: updated.coolingUntil,
    };
  });
}

/**
 * Agent switches which verified bank is Active (one at a time).
 * Prior active → inactive; 24h cooling when replacing an already-active bank.
 */
export async function activateSettlementBank(params: {
  tenantId: string;
  userId: string;
  settlementAccountId: bigint;
}): Promise<{
  settlementAccountId: bigint;
  isActive: boolean;
  coolingUntil: Date | null;
}> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(agentSettlementAccounts)
      .where(
        and(
          eq(agentSettlementAccounts.id, params.settlementAccountId),
          eq(agentSettlementAccounts.tenantId, params.tenantId),
          eq(agentSettlementAccounts.userId, params.userId),
        ),
      )
      .for("update");

    if (!row) throw new HttpError(404, "Settlement bank account not found", "NOT_FOUND");
    if (!row.verifiedAt) {
      throw new HttpError(
        422,
        "This bank is pending verification. Wait for admin approval before activating.",
        "BANK_NOT_VERIFIED",
      );
    }
    if (row.isActive) {
      return {
        settlementAccountId: row.id,
        isActive: true,
        coolingUntil: row.coolingUntil,
      };
    }

    const prior = await tx
      .select({ id: agentSettlementAccounts.id })
      .from(agentSettlementAccounts)
      .where(
        and(
          eq(agentSettlementAccounts.userId, row.userId),
          eq(agentSettlementAccounts.isActive, true),
        ),
      )
      .limit(1);
    const hadPriorActive = prior.length > 0;
    const now = new Date();
    const coolingUntil = hadPriorActive
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : row.coolingUntil;

    await tx
      .update(agentSettlementAccounts)
      .set({ isActive: false })
      .where(
        and(
          eq(agentSettlementAccounts.userId, row.userId),
          eq(agentSettlementAccounts.isActive, true),
        ),
      );

    const [updated] = await tx
      .update(agentSettlementAccounts)
      .set({
        isActive: true,
        effectiveFrom: now,
        coolingUntil,
      })
      .where(eq(agentSettlementAccounts.id, row.id))
      .returning({
        id: agentSettlementAccounts.id,
        isActive: agentSettlementAccounts.isActive,
        coolingUntil: agentSettlementAccounts.coolingUntil,
      });

    if (!updated) {
      throw new HttpError(500, "Could not activate settlement bank", "ACTIVATE_FAILED");
    }

    return {
      settlementAccountId: updated.id,
      isActive: updated.isActive,
      coolingUntil: updated.coolingUntil,
    };
  });
}

export async function listSettlementBanks(params: {
  tenantId: string;
  userId: string;
}): Promise<
  {
    id: string;
    accountNumberLast4: string;
    ifsc: string;
    holderName: string;
    isActive: boolean;
    verified: boolean;
    effectiveFrom: string;
    coolingUntil: string | null;
  }[]
> {
  const rows = await db
    .select({
      id: agentSettlementAccounts.id,
      accountNumberLast4: agentSettlementAccounts.accountNumberLast4,
      ifsc: agentSettlementAccounts.ifsc,
      holderName: agentSettlementAccounts.holderName,
      isActive: agentSettlementAccounts.isActive,
      verifiedAt: agentSettlementAccounts.verifiedAt,
      effectiveFrom: agentSettlementAccounts.effectiveFrom,
      coolingUntil: agentSettlementAccounts.coolingUntil,
    })
    .from(agentSettlementAccounts)
    .where(
      and(
        eq(agentSettlementAccounts.tenantId, params.tenantId),
        eq(agentSettlementAccounts.userId, params.userId),
      ),
    )
    .orderBy(desc(agentSettlementAccounts.createdAt));

  return rows.map((r) => ({
    id: String(r.id),
    accountNumberLast4: r.accountNumberLast4,
    ifsc: r.ifsc,
    holderName: r.holderName,
    isActive: r.isActive,
    verified: r.verifiedAt != null,
    effectiveFrom: r.effectiveFrom.toISOString(),
    coolingUntil: r.coolingUntil ? r.coolingUntil.toISOString() : null,
  }));
}

/** Owner-only reveal of full account number (encrypted at rest). */
export async function revealSettlementBank(params: {
  tenantId: string;
  userId: string;
  settlementAccountId: bigint;
}): Promise<{
  id: string;
  accountNumber: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
}> {
  const [row] = await db
    .select({
      id: agentSettlementAccounts.id,
      accountNumberEnc: agentSettlementAccounts.accountNumberEnc,
      accountNumberLast4: agentSettlementAccounts.accountNumberLast4,
      ifsc: agentSettlementAccounts.ifsc,
      holderName: agentSettlementAccounts.holderName,
    })
    .from(agentSettlementAccounts)
    .where(
      and(
        eq(agentSettlementAccounts.id, params.settlementAccountId),
        eq(agentSettlementAccounts.tenantId, params.tenantId),
        eq(agentSettlementAccounts.userId, params.userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HttpError(404, "Settlement bank account not found", "NOT_FOUND");
  }

  let accountNumber: string;
  try {
    accountNumber = decryptPII(row.accountNumberEnc);
  } catch {
    throw new HttpError(500, "Could not decrypt account number", "DECRYPT_FAILED");
  }

  return {
    id: String(row.id),
    accountNumber,
    accountNumberLast4: row.accountNumberLast4,
    ifsc: row.ifsc,
    holderName: row.holderName,
  };
}

// ---------------------------------------------------------------------------------------
// Settlement requests
// ---------------------------------------------------------------------------------------

export async function requestSettlement(params: {
  tenantId: string;
  userId: string;
  amount: Paise;
  mode?: "imps" | "neft" | "rtgs";
  idempotencyKey?: string;
}): Promise<{ requestId: bigint; status: SettlementStatus; replayed: boolean }> {
  if (params.amount <= 0n) {
    throw new HttpError(422, "Amount must be greater than zero", "INVALID_AMOUNT");
  }

  return db.transaction(async (tx) => {
    if (params.idempotencyKey) {
      const storedKey = settleIdemKey(params.idempotencyKey);
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${params.userId}:${storedKey}`}))`,
      );
      const [prior] = await tx
        .select()
        .from(walletIdempotency)
        .where(
          and(
            eq(walletIdempotency.userId, params.userId),
            eq(walletIdempotency.idempotencyKey, storedKey),
          ),
        );
      if (prior) {
        const requestId = decodeIdemUuid(prior.ledgerGroupId);
        const [existing] = await tx
          .select({ id: settlementRequests.id, status: settlementRequests.status })
          .from(settlementRequests)
          .where(eq(settlementRequests.id, requestId))
          .limit(1);
        if (existing) {
          return { requestId: existing.id, status: existing.status, replayed: true };
        }
        throw new HttpError(
          500,
          "Idempotency key is already claimed but the settlement request is missing",
          "IDEM_ORPHAN",
        );
      }
    }

    const [user] = await tx
      .select({ id: users.id, kycStatus: users.kycStatus, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!user) throw new HttpError(404, "User not found", "USER_NOT_FOUND");
    if (!user.isActive) {
      throw new HttpError(422, "Your account is inactive and cannot settle", "ACCOUNT_INACTIVE");
    }
    if (user.kycStatus !== "verified") {
      throw new HttpError(
        422,
        "Complete KYC verification before requesting a settlement",
        "KYC_REQUIRED",
      );
    }

    const agentCode = await ensureHierarchyAccount(tx, params.tenantId, params.userId);
    const [agentAcc] = await tx
      .select({
        id: accounts.id,
        code: accounts.code,
        blockSettlement: accounts.blockSettlement,
      })
      .from(accounts)
      .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.code, agentCode)))
      .limit(1);

    if (!agentAcc) {
      throw new HttpError(500, `Ledger account ${agentCode} was not found`, "ACCOUNT_NOT_FOUND");
    }
    if (agentAcc.blockSettlement) {
      throw new HttpError(
        422,
        "Settlement is blocked on your balance. Contact support if you need this lifted.",
        "SETTLEMENT_BLOCKED",
      );
    }

    // Fresh blockSettlement from DB (cache may be stale after an admin toggle).
    invalidateAccount(params.tenantId, agentCode);

    const [bank] = await tx
      .select()
      .from(agentSettlementAccounts)
      .where(
        and(
          eq(agentSettlementAccounts.userId, params.userId),
          eq(agentSettlementAccounts.tenantId, params.tenantId),
          eq(agentSettlementAccounts.isActive, true),
        ),
      )
      .limit(1);

    if (!bank) {
      throw new HttpError(
        422,
        "Add and verify an active settlement bank account before withdrawing",
        "NO_SETTLEMENT_BANK",
      );
    }
    if (!bank.verifiedAt) {
      throw new HttpError(
        422,
        "Your settlement bank account is not verified yet. Wait for verification before withdrawing.",
        "BANK_NOT_VERIFIED",
      );
    }
    if (bank.coolingUntil && bank.coolingUntil.getTime() > Date.now()) {
      throw new HttpError(
        422,
        `Settlement bank was recently changed. Withdrawals resume after ${bank.coolingUntil.toISOString()}`,
        "BANK_COOLING",
      );
    }

    const [bal] = await tx
      .select({
        balance: accountBalances.balance,
        settleable: accountBalances.settleable,
      })
      .from(accountBalances)
      .where(eq(accountBalances.accountId, agentAcc.id))
      .for("update");

    const settleable = bal?.settleable ?? 0n;
    const balance = bal?.balance ?? 0n;
    if (params.amount > settleable) {
      throw new HttpError(
        422,
        `Insufficient settleable balance: have ${paiseToRupees(settleable)}, requested ${paiseToRupees(params.amount)}. Prepaid advance cannot be withdrawn to bank.`,
        "INSUFFICIENT_SETTLEABLE",
      );
    }
    if (params.amount > balance) {
      throw new HttpError(
        422,
        `Insufficient balance: have ${paiseToRupees(balance)}, need ${paiseToRupees(params.amount)}`,
        "INSUFFICIENT_BALANCE",
      );
    }

    const chargesPaise = rupeesToPaise(String((await getTenantSettings(params.tenantId)).settlementChargeRupees));
    const charges = chargesPaise;
    if (charges >= params.amount) {
      throw new HttpError(
        422,
        `Settlement amount must be greater than the platform charge of ${paiseToRupees(charges)}`,
        "AMOUNT_TOO_LOW_FOR_CHARGE",
      );
    }
    const netAmount = params.amount - charges;

    const [created] = await tx
      .insert(settlementRequests)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        agentAccountId: agentAcc.id,
        settlementAccountId: bank.id,
        amount: params.amount,
        charges,
        netAmount,
        mode: params.mode ?? "imps",
        status: "processing",
      })
      .returning({ id: settlementRequests.id });

    if (!created) {
      throw new HttpError(500, "Could not create settlement request", "CREATE_FAILED");
    }

    const debit = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "SETTLEMENT_DEBIT",
      idemKey: `SETTLE:${created.id}:DEBIT`,
      performedBy: params.userId,
      referenceId: String(created.id),
      reason: "Settlement request — hold settleable for bank payout",
      entries: [
        { code: agentCode, dir: "DR", amount: params.amount },
        { code: SETTLE_PAYABLE, dir: "CR", amount: params.amount },
      ],
    });

    await tx
      .update(settlementRequests)
      .set({ debitJournalId: debit.id })
      .where(eq(settlementRequests.id, created.id));

    await mirrorAgentWallets(tx, params.tenantId, params.userId);

    if (params.idempotencyKey) {
      await tx.insert(walletIdempotency).values({
        userId: params.userId,
        idempotencyKey: settleIdemKey(params.idempotencyKey),
        ledgerGroupId: encodeIdemUuid(created.id),
      });
    }

    return { requestId: created.id, status: "processing" as const, replayed: false };
  });
}

export async function markPayoutSuccess(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  bankUtr: string;
  payoutBankAccountId?: bigint;
}): Promise<{ payoutJournalId: bigint }> {
  const utr = params.bankUtr.trim();
  if (!utr) throw new HttpError(422, "Bank UTR is required", "UTR_REQUIRED");

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(settlementRequests)
      .where(
        and(eq(settlementRequests.id, params.requestId), eq(settlementRequests.tenantId, params.tenantId)),
      )
      .for("update");

    if (!request) throw new HttpError(404, "Settlement request not found", "NOT_FOUND");
    if (request.status === "success") {
      if (!request.payoutJournalId) {
        throw new HttpError(500, "Successful settlement is missing its payout journal", "MISSING_PAYOUT");
      }
      return { payoutJournalId: request.payoutJournalId };
    }
    if (!["requested", "queued", "processing"].includes(request.status)) {
      throw new HttpError(
        422,
        `Settlement request is already ${request.status}`,
        "ALREADY_TERMINAL",
      );
    }
    if (!request.debitJournalId) {
      throw new HttpError(500, "Settlement request has no debit journal", "MISSING_DEBIT");
    }

    const payoutBank = await resolvePayoutBank(tx, params.tenantId, params.payoutBankAccountId);

    const payout = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "SETTLEMENT_PAYOUT",
      idemKey: `SETTLE:${request.id}:PAYOUT`,
      performedBy: params.adminId,
      referenceId: String(request.id),
      reason: `Settlement payout UTR ${utr}`,
      entries:
        request.charges > 0n
          ? [
              { code: SETTLE_PAYABLE, dir: "DR", amount: request.amount as Paise },
              { code: payoutBank.code, dir: "CR", amount: request.netAmount as Paise },
              { code: FEE_INCOME, dir: "CR", amount: request.charges as Paise },
            ]
          : [
              { code: SETTLE_PAYABLE, dir: "DR", amount: request.netAmount as Paise },
              { code: payoutBank.code, dir: "CR", amount: request.netAmount as Paise },
            ],
    });

    await tx
      .update(settlementRequests)
      .set({
        status: "success",
        bankUtr: utr,
        payoutJournalId: payout.id,
        payoutBankAccountId: payoutBank.id,
        completedAt: new Date(),
      })
      .where(eq(settlementRequests.id, request.id));

    return { payoutJournalId: payout.id };
  });
}

export async function markPayoutFailed(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  failureReason: string;
}): Promise<{ reversalJournalId: bigint }> {
  const reason = params.failureReason.trim();
  if (!reason) {
    throw new HttpError(422, "Failure reason is required", "REASON_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(settlementRequests)
      .where(
        and(eq(settlementRequests.id, params.requestId), eq(settlementRequests.tenantId, params.tenantId)),
      )
      .for("update");

    if (!request) throw new HttpError(404, "Settlement request not found", "NOT_FOUND");
    if (request.status === "failed") {
      if (!request.reversalJournalId) {
        throw new HttpError(500, "Failed settlement is missing its reversal journal", "MISSING_REVERSAL");
      }
      return { reversalJournalId: request.reversalJournalId };
    }
    if (!["requested", "queued", "processing"].includes(request.status)) {
      throw new HttpError(
        422,
        `Settlement request is already ${request.status}`,
        "ALREADY_TERMINAL",
      );
    }
    if (!request.debitJournalId) {
      throw new HttpError(500, "Settlement request has no debit journal to reverse", "MISSING_DEBIT");
    }

    const reversal = await reverseJournal(tx, {
      tenantId: params.tenantId,
      journalId: request.debitJournalId,
      idemKey: `SETTLE:${request.id}:REVERSAL`,
      performedBy: params.adminId,
      reason: `Settlement payout failed: ${reason}`,
    });

    await tx
      .update(settlementRequests)
      .set({
        status: "failed",
        failureReason: reason,
        reversalJournalId: reversal.id,
        completedAt: new Date(),
      })
      .where(eq(settlementRequests.id, request.id));

    await mirrorAgentWallets(tx, params.tenantId, request.userId);

    return { reversalJournalId: reversal.id };
  });
}

/**
 * Bank returned a successful payout. Reverse the payout journal, then reverse the original
 * debit so settleable returns to the agent. Status becomes `returned`.
 */
export async function markPayoutReturned(params: {
  tenantId: string;
  requestId: bigint;
  adminId: string;
  reason: string;
  bankUtr?: string;
}): Promise<{ payoutReversalJournalId: bigint; debitReversalJournalId: bigint }> {
  const reason = params.reason.trim();
  if (!reason) {
    throw new HttpError(422, "Return reason is required", "REASON_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(settlementRequests)
      .where(
        and(eq(settlementRequests.id, params.requestId), eq(settlementRequests.tenantId, params.tenantId)),
      )
      .for("update");

    if (!request) throw new HttpError(404, "Settlement request not found", "NOT_FOUND");
    if (request.status === "returned") {
      if (!request.reversalJournalId || !request.payoutJournalId) {
        throw new HttpError(500, "Returned settlement is missing reversal journals", "MISSING_REVERSAL");
      }
      return {
        payoutReversalJournalId: request.reversalJournalId,
        debitReversalJournalId: request.reversalJournalId,
      };
    }
    if (request.status !== "success") {
      throw new HttpError(
        422,
        "Only a successful settlement can be marked returned by the bank",
        "NOT_SUCCESS",
      );
    }
    if (!request.payoutJournalId || !request.debitJournalId) {
      throw new HttpError(500, "Settlement is missing payout or debit journal", "MISSING_JOURNAL");
    }

    const payoutReversal = await reverseJournal(tx, {
      tenantId: params.tenantId,
      journalId: request.payoutJournalId,
      idemKey: `SETTLE:${request.id}:PAYOUT_RETURN`,
      performedBy: params.adminId,
      reason: `Settlement bank return: ${reason}`,
    });

    const debitReversal = await reverseJournal(tx, {
      tenantId: params.tenantId,
      journalId: request.debitJournalId,
      idemKey: `SETTLE:${request.id}:DEBIT_RETURN`,
      performedBy: params.adminId,
      reason: `Settlement bank return restore settleable: ${reason}`,
    });

    await tx
      .update(settlementRequests)
      .set({
        status: "returned",
        failureReason: reason,
        bankUtr: params.bankUtr?.trim() || request.bankUtr,
        reversalJournalId: debitReversal.id,
        completedAt: new Date(),
      })
      .where(eq(settlementRequests.id, request.id));

    await mirrorAgentWallets(tx, params.tenantId, request.userId);

    return {
      payoutReversalJournalId: payoutReversal.id,
      debitReversalJournalId: debitReversal.id,
    };
  });
}

async function resolvePayoutBank(
  tx: Tx,
  tenantId: string,
  payoutBankAccountId?: bigint,
): Promise<{ id: bigint; code: string }> {
  if (payoutBankAccountId) {
    const [row] = await tx
      .select({
        id: bankAccounts.id,
        code: accounts.code,
        purpose: bankAccounts.purpose,
        isActive: bankAccounts.isActive,
      })
      .from(bankAccounts)
      .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
      .where(and(eq(bankAccounts.id, payoutBankAccountId), eq(bankAccounts.tenantId, tenantId)))
      .limit(1);

    if (!row) throw new HttpError(404, "Payout bank account not found", "PAYOUT_BANK_NOT_FOUND");
    if (!row.isActive) {
      throw new HttpError(422, "Payout bank account is inactive", "PAYOUT_BANK_INACTIVE");
    }
    if (row.purpose !== "payout") {
      throw new HttpError(
        422,
        "Settlement payouts must use a bank account with purpose payout",
        "PAYOUT_BANK_WRONG_PURPOSE",
      );
    }
    return { id: row.id, code: row.code };
  }

  const [row] = await tx
    .select({
      id: bankAccounts.id,
      code: accounts.code,
    })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .where(
      and(
        eq(bankAccounts.tenantId, tenantId),
        eq(bankAccounts.purpose, "payout"),
        eq(bankAccounts.isActive, true),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HttpError(
      422,
      "Register an active company payout bank account before marking settlements successful",
      "NO_PAYOUT_BANK",
    );
  }
  return row;
}

export async function getSettlementRequest(params: {
  tenantId: string;
  requestId: bigint;
  actorUserId: string;
  actorRole: string;
}): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({
      id: settlementRequests.id,
      userId: settlementRequests.userId,
      amount: settlementRequests.amount,
      charges: settlementRequests.charges,
      netAmount: settlementRequests.netAmount,
      mode: settlementRequests.mode,
      status: settlementRequests.status,
      bankUtr: settlementRequests.bankUtr,
      failureReason: settlementRequests.failureReason,
      requestedAt: settlementRequests.requestedAt,
      completedAt: settlementRequests.completedAt,
      last4: agentSettlementAccounts.accountNumberLast4,
      ifsc: agentSettlementAccounts.ifsc,
    })
    .from(settlementRequests)
    .innerJoin(
      agentSettlementAccounts,
      eq(agentSettlementAccounts.id, settlementRequests.settlementAccountId),
    )
    .where(
      and(
        eq(settlementRequests.id, params.requestId),
        eq(settlementRequests.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (!row) throw new HttpError(404, "Settlement request not found", "NOT_FOUND");
  if (params.actorRole !== "admin" && row.userId !== params.actorUserId) {
    throw new HttpError(403, "You can only view your own settlement requests", "FORBIDDEN");
  }

  return {
    requestId: String(row.id),
    amount: paiseToRupees(row.amount),
    charges: paiseToRupees(row.charges),
    netAmount: paiseToRupees(row.netAmount),
    mode: row.mode,
    status: row.status,
    bankUtr: row.bankUtr,
    failureReason: row.failureReason,
    settlementBankLast4: row.last4,
    settlementBankIfsc: row.ifsc,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function listSettlementRequests(params: {
  tenantId: string;
  userId: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const limit = Math.min(params.limit ?? 20, 50);
  const rows = await db
    .select({
      id: settlementRequests.id,
      amount: settlementRequests.amount,
      netAmount: settlementRequests.netAmount,
      mode: settlementRequests.mode,
      status: settlementRequests.status,
      bankUtr: settlementRequests.bankUtr,
      failureReason: settlementRequests.failureReason,
      requestedAt: settlementRequests.requestedAt,
      completedAt: settlementRequests.completedAt,
    })
    .from(settlementRequests)
    .where(
      and(
        eq(settlementRequests.tenantId, params.tenantId),
        eq(settlementRequests.userId, params.userId),
      ),
    )
    .orderBy(desc(settlementRequests.requestedAt))
    .limit(limit);

  return rows.map((r) => ({
    requestId: String(r.id),
    amount: paiseToRupees(r.amount),
    netAmount: paiseToRupees(r.netAmount),
    mode: r.mode,
    status: r.status,
    bankUtr: r.bankUtr,
    failureReason: r.failureReason,
    requestedAt: r.requestedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}

/** Admin: banks awaiting verification (for settle bank approve queue). */
export async function listPendingSettlementBanks(params: {
  tenantId: string;
  limit?: number;
}): Promise<
  {
    id: string;
    userId: string;
    userName: string;
    userUid: string;
    userMobile: string;
    accountNumberLast4: string;
    ifsc: string;
    holderName: string;
    createdAt: string;
  }[]
> {
  const limit = Math.min(params.limit ?? 50, 100);
  const rows = await db
    .select({
      id: agentSettlementAccounts.id,
      userId: agentSettlementAccounts.userId,
      userName: users.name,
      userUid: users.uid,
      userMobile: users.mobile,
      accountNumberLast4: agentSettlementAccounts.accountNumberLast4,
      ifsc: agentSettlementAccounts.ifsc,
      holderName: agentSettlementAccounts.holderName,
      createdAt: agentSettlementAccounts.createdAt,
    })
    .from(agentSettlementAccounts)
    .innerJoin(users, eq(users.id, agentSettlementAccounts.userId))
    .where(
      and(
        eq(agentSettlementAccounts.tenantId, params.tenantId),
        isNull(agentSettlementAccounts.verifiedAt),
      ),
    )
    .orderBy(asc(agentSettlementAccounts.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: String(r.id),
    userId: r.userId,
    userName: r.userName,
    userUid: r.userUid,
    userMobile: r.userMobile,
    accountNumberLast4: r.accountNumberLast4,
    ifsc: r.ifsc,
    holderName: r.holderName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Admin list of open settlements awaiting payout confirmation. */
export async function listOpenSettlements(params: {
  tenantId: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const limit = Math.min(params.limit ?? 50, 100);
  const open: SettlementStatus[] = ["requested", "queued", "processing"];
  const rows = await db
    .select({
      id: settlementRequests.id,
      userId: settlementRequests.userId,
      userName: users.name,
      userUid: users.uid,
      userMobile: users.mobile,
      amount: settlementRequests.amount,
      netAmount: settlementRequests.netAmount,
      mode: settlementRequests.mode,
      status: settlementRequests.status,
      requestedAt: settlementRequests.requestedAt,
      last4: agentSettlementAccounts.accountNumberLast4,
      ifsc: agentSettlementAccounts.ifsc,
      holderName: agentSettlementAccounts.holderName,
    })
    .from(settlementRequests)
    .innerJoin(
      agentSettlementAccounts,
      eq(agentSettlementAccounts.id, settlementRequests.settlementAccountId),
    )
    .innerJoin(users, eq(users.id, settlementRequests.userId))
    .where(
      and(
        eq(settlementRequests.tenantId, params.tenantId),
        inArray(settlementRequests.status, open),
      ),
    )
    .orderBy(asc(settlementRequests.requestedAt))
    .limit(limit);

  return rows.map((r) => ({
    requestId: String(r.id),
    userId: r.userId,
    userName: r.userName,
    userUid: r.userUid,
    userMobile: r.userMobile,
    amount: paiseToRupees(r.amount),
    netAmount: paiseToRupees(r.netAmount),
    mode: r.mode,
    status: r.status,
    settlementBankLast4: r.last4,
    settlementBankIfsc: r.ifsc,
    holderName: r.holderName,
    requestedAt: r.requestedAt.toISOString(),
  }));
}
