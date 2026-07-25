import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { randomInt, timingSafeEqual } from "node:crypto";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import {
  wallets,
  walletLedgerEntries,
  walletLedgerGroups,
  walletIdempotency,
  users,
  transactions,
} from "../../db/postgres/schema";
import { transferBetweenWallets, fundWallet } from "./wallet.ledger";
import { toPaise } from "./decimal";
import { HttpError } from "../../utils/httpError";
import { env, shouldExposeOtpInResponse, getTestOtpOverride } from "../../config/env";
import { logger } from "../../utils/logger";
import { hashToken } from "../../utils/uid";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import {
  MAX_OTP_ATTEMPTS,
  findLatestActiveOtp,
  incrementOtpAttempts,
  insertOtpRequest,
  markOtpConsumed,
} from "../../db/postgres/repositories/otpRequest";
import type { UserRole, WalletType } from "@asanpay/shared-types";

const PULL_OTP_TTL_MS = 5 * 60 * 1000;

function otpHashesEqual(storedHash: string, candidateOtp: string): boolean {
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(hashToken(candidateOtp), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function assertActorKycVerified(actorId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, actorId));
  if (!user || !user.isActive) throw new HttpError(403, "Account is not active", "ACCOUNT_INACTIVE");
  if (user.kycStatus !== "verified") {
    throw new HttpError(403, "Complete KYC verification to transact", "KYC_NOT_VERIFIED");
  }
}

/**
 * Rejects a manual top-up above the configured single-call ceiling. Pure + cap-injected so the
 * limit is unit-testable without a DB. Returns the amount in paise on success.
 */
export function assertWithinManualFundCap(amount: string, capRupees: number): number {
  const paise = toPaise(amount);
  if (paise <= 0) throw new HttpError(422, "Amount must be positive", "INVALID_AMOUNT");
  if (paise > capRupees * 100) {
    throw new HttpError(
      422,
      `Single manual top-up cannot exceed ₹${capRupees.toLocaleString("en-IN")}`,
      "MANUAL_FUND_LIMIT_EXCEEDED",
    );
  }
  return paise;
}

type Actor = { id: string; role: UserRole };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

// Zero-balance wallet provisioning at onboarding time. Money movement (credit/debit/transfer
// with row-locking) lives in wallet.ledger.ts — this only creates the accounts.
export async function provisionWalletsForUser(tx: Tx, userId: string, role: UserRole): Promise<void> {
  await tx.insert(wallets).values({ userId, walletType: "main" });

  if (role === "retailer") {
    await tx.insert(wallets).values({ userId, walletType: "aeps" });
  }
}

/**
 * Available balance from wallets table, plus pendingBalance = sum of open txn
 * amounts for that wallet (status pending|initiated). For debit flows money is
 * already moved to the system wallet while the provider is unsettled; pending
 * shows that reserved/in-flight total so retailers can see Locked vs Available.
 */
export async function getWalletBalances(userId: string) {
  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId));

  const pendingRows = await db
    .select({
      walletType: transactions.walletType,
      pending: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), inArray(transactions.status, ["pending", "initiated"])),
    )
    .groupBy(transactions.walletType);

  const pendingByType = new Map<string, string>();
  for (const row of pendingRows) {
    const key = row.walletType ?? "main";
    const n = Number(row.pending);
    pendingByType.set(key, Number.isFinite(n) ? n.toFixed(2) : "0.00");
  }

  return rows.map((w) => ({
    ...w,
    availableBalance: w.balance,
    holdBalance: w.holdBalance,
    // Legacy field, derived from open transactions — kept for existing callers. Should always
    // match holdBalance; if it doesn't, that's a reconciliation bug worth alerting on.
    pendingBalance: pendingByType.get(w.walletType) ?? "0.00",
  }));
}

async function getWalletOrThrow(userId: string, walletType: WalletType) {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.walletType, walletType)));
  if (!wallet) throw new HttpError(404, `${walletType} wallet not found for this user`, "WALLET_NOT_FOUND");
  return wallet;
}

/** Serialize same-user idempotency keys so check → money → record cannot race-double-spend. */
async function lockUserIdempotencyKey(tx: Tx, userId: string, idempotencyKey: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${idempotencyKey}`}))`);
}

/** One-level downline only: Super Dist → Distributor, Distributor → Retailer. */
const TRANSFER_CHILD_ROLE: Partial<Record<UserRole, UserRole>> = {
  master_distributor: "distributor",
  distributor: "retailer",
};

// A parent can only fund the wallet of a user they directly onboarded — mirrors how money
// actually flows down the distributor network (distributor -> their own retailer, not anyone else's).
export async function transferToChild(
  actor: Actor,
  targetUserId: string,
  walletType: WalletType,
  amount: string,
  description?: string,
  idempotencyKey?: string,
): Promise<{ groupId: string }> {
  await assertActorKycVerified(actor.id);

  const expectedChildRole = TRANSFER_CHILD_ROLE[actor.role];
  if (!expectedChildRole) {
    throw new HttpError(403, "This role cannot transfer wallet funds", "FORBIDDEN");
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target) throw new HttpError(404, "Target user not found", "USER_NOT_FOUND");
  if (target.parentId !== actor.id) {
    throw new HttpError(403, "You can only fund users you directly onboarded", "NOT_YOUR_DOWNLINE");
  }
  if (target.role !== expectedChildRole) {
    throw new HttpError(
      422,
      `A ${actor.role.replace(/_/g, " ")} can only fund a ${expectedChildRole.replace(/_/g, " ")}`,
      "INVALID_HIERARCHY",
    );
  }
  if (!target.isActive) {
    throw new HttpError(422, "Target account is inactive", "ACCOUNT_INACTIVE");
  }

  const fromWallet = await getWalletOrThrow(actor.id, "main");
  const toWallet = await getWalletOrThrow(targetUserId, walletType);

  if (!idempotencyKey) {
    return transferBetweenWallets({
      fromWalletId: fromWallet.id,
      toWalletId: toWallet.id,
      amount,
      referenceType: "downline_transfer",
      referenceId: targetUserId,
      description,
    });
  }

  return db.transaction(async (tx) => {
    await lockUserIdempotencyKey(tx, actor.id, idempotencyKey);
    const [prior] = await tx
      .select()
      .from(walletIdempotency)
      .where(
        and(eq(walletIdempotency.userId, actor.id), eq(walletIdempotency.idempotencyKey, idempotencyKey)),
      );
    if (prior) return { groupId: prior.ledgerGroupId };

    const result = await transferBetweenWallets(
      {
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount,
        referenceType: "downline_transfer",
        referenceId: targetUserId,
        description,
      },
      tx,
    );
    await tx.insert(walletIdempotency).values({
      userId: actor.id,
      idempotencyKey,
      ledgerGroupId: result.groupId,
    });
    return result;
  });
}

async function assertPullableChild(
  actor: Actor,
  targetUserId: string,
): Promise<{ id: string; mobile: string; name: string; role: UserRole }> {
  await assertActorKycVerified(actor.id);

  const expectedChildRole = TRANSFER_CHILD_ROLE[actor.role];
  if (!expectedChildRole) {
    throw new HttpError(403, "This role cannot pull wallet funds", "FORBIDDEN");
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!target) throw new HttpError(404, "Target user not found", "USER_NOT_FOUND");
  if (target.parentId !== actor.id) {
    throw new HttpError(403, "You can only collect from users you directly onboarded", "NOT_YOUR_DOWNLINE");
  }
  if (target.role !== expectedChildRole) {
    throw new HttpError(
      422,
      `A ${actor.role.replace(/_/g, " ")} can only collect from a ${expectedChildRole.replace(/_/g, " ")}`,
      "INVALID_HIERARCHY",
    );
  }
  if (!target.isActive) {
    throw new HttpError(422, "Target account is inactive", "ACCOUNT_INACTIVE");
  }

  return { id: target.id, mobile: target.mobile, name: target.name, role: target.role };
}

/**
 * Step 1 of upline collect: OTP to the child's mobile. Parent later confirms with OTP + txn PIN.
 */
export async function requestPullFromChild(
  actor: Actor,
  targetUserId: string,
  amount: string,
  walletType: WalletType = "main",
): Promise<{ message: string; expiresInSeconds: number; otp?: string; maskedMobile: string }> {
  const target = await assertPullableChild(actor, targetUserId);
  const paise = toPaise(amount);
  if (paise <= 0) throw new HttpError(422, "Amount must be positive", "INVALID_AMOUNT");

  const childWallet = await getWalletOrThrow(target.id, walletType);
  if (toPaise(String(childWallet.balance)) < paise) {
    throw new HttpError(422, "Child wallet has insufficient balance", "INSUFFICIENT_BALANCE");
  }

  const otp = getTestOtpOverride(target.mobile) ?? randomInt(100000, 1000000).toString();
  await insertOtpRequest({
    mobile: target.mobile,
    otpHash: hashToken(otp),
    purpose: "wallet_pull",
    expiresAt: new Date(Date.now() + PULL_OTP_TTL_MS),
    meta: {
      actorId: actor.id,
      targetUserId: target.id,
      amount,
      walletType,
    },
  });

  await insertAuditLog({
    userId: actor.id,
    action: "wallet.pull_otp_requested",
    entityType: "user",
    entityId: target.id,
    metadata: { amount, walletType },
  });

  const exposeOtp = shouldExposeOtpInResponse();
  if (exposeOtp) {
    logger.info({ mobile: target.mobile, purpose: "wallet_pull" }, "[OTP] generated (value not logged)");
  }

  const digits = target.mobile.replace(/\D/g, "");
  const maskedMobile =
    digits.length >= 4 ? `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : "****";

  return {
    message: `OTP sent to ${target.name}'s mobile`,
    expiresInSeconds: PULL_OTP_TTL_MS / 1000,
    maskedMobile,
    ...(exposeOtp ? { otp } : {}),
  };
}

/**
 * Step 2: verify child OTP + move main/aeps funds from child → parent.
 */
export async function confirmPullFromChild(
  actor: Actor,
  opts: {
    targetUserId: string;
    amount: string;
    otp: string;
    walletType?: WalletType;
    description?: string;
    idempotencyKey: string;
  },
): Promise<{ groupId: string }> {
  const walletType = opts.walletType ?? "main";
  const target = await assertPullableChild(actor, opts.targetUserId);

  const record = await findLatestActiveOtp({ mobile: target.mobile, purpose: "wallet_pull" });
  if (!record) throw new HttpError(401, "OTP has expired or was not requested", "OTP_EXPIRED");
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(401, "Too many incorrect attempts — request a new OTP", "OTP_LOCKED");
  }
  if (!otpHashesEqual(record.otpHash, opts.otp)) {
    await incrementOtpAttempts(record.id);
    throw new HttpError(401, "Incorrect OTP", "OTP_INCORRECT");
  }

  const meta = record.meta ?? {};
  if (meta.actorId !== actor.id || meta.targetUserId !== target.id) {
    throw new HttpError(422, "OTP does not match this collect request", "OTP_MISMATCH");
  }
  if (meta.amount !== opts.amount || (meta.walletType ?? "main") !== walletType) {
    throw new HttpError(422, "Amount or wallet does not match OTP request", "PULL_MISMATCH");
  }

  await markOtpConsumed(record.id);

  const fromWallet = await getWalletOrThrow(target.id, walletType);
  const toWallet = await getWalletOrThrow(actor.id, "main");

  const result = await db.transaction(async (tx) => {
    await lockUserIdempotencyKey(tx, actor.id, opts.idempotencyKey);
    const [prior] = await tx
      .select()
      .from(walletIdempotency)
      .where(
        and(eq(walletIdempotency.userId, actor.id), eq(walletIdempotency.idempotencyKey, opts.idempotencyKey)),
      );
    if (prior) return { groupId: prior.ledgerGroupId };

    const moved = await transferBetweenWallets(
      {
        fromWalletId: fromWallet.id,
        toWalletId: toWallet.id,
        amount: opts.amount,
        referenceType: "upline_pull",
        referenceId: opts.idempotencyKey,
        description: opts.description ?? `Collect from ${target.name}`,
      },
      tx,
    );
    await tx.insert(walletIdempotency).values({
      userId: actor.id,
      idempotencyKey: opts.idempotencyKey,
      ledgerGroupId: moved.groupId,
    });
    return moved;
  });

  await insertAuditLog({
    userId: actor.id,
    action: "wallet.pull_confirmed",
    entityType: "wallet",
    entityId: fromWallet.id,
    metadata: {
      targetUserId: target.id,
      amount: opts.amount,
      walletType,
      ledgerGroupId: result.groupId,
      idempotencyKey: opts.idempotencyKey,
    },
  });

  return result;
}

// Admin-only entry point for money entering the system from outside (bank reconciliation).
// Capped per call and written to the immutable audit log with the acting admin's identity.
// Optional targetUserId: mint into a direct Super Dist child (admin has no /transfer role).
export async function adminFundOwnWallet(
  actor: Actor,
  amount: string,
  description?: string,
  idempotencyKey?: string,
  targetUserId?: string,
): Promise<{ groupId: string }> {
  assertWithinManualFundCap(amount, env.MAX_MANUAL_FUND_RUPEES);

  let walletUserId = actor.id;
  if (targetUserId) {
    const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!target) throw new HttpError(404, "Target user not found", "USER_NOT_FOUND");
    if (target.parentId !== actor.id) {
      throw new HttpError(403, "You can only fund Super Distributors you onboarded", "NOT_YOUR_DOWNLINE");
    }
    if (target.role !== "master_distributor") {
      throw new HttpError(422, "Admin float load only targets Super Distributors", "INVALID_TARGET");
    }
    if (!target.isActive) throw new HttpError(422, "Target account is inactive", "ACCOUNT_INACTIVE");
    walletUserId = target.id;
  }

  const wallet = await getWalletOrThrow(walletUserId, "main");

  const runFund = async (tx?: Tx): Promise<{ groupId: string }> => {
    if (tx) return fundWallet({ walletId: wallet.id, amount, description }, tx);
    return fundWallet({ walletId: wallet.id, amount, description });
  };

  let result: { groupId: string };
  if (!idempotencyKey) {
    result = await runFund();
  } else {
    result = await db.transaction(async (tx) => {
      await lockUserIdempotencyKey(tx, actor.id, idempotencyKey);
      const [prior] = await tx
        .select()
        .from(walletIdempotency)
        .where(
          and(eq(walletIdempotency.userId, actor.id), eq(walletIdempotency.idempotencyKey, idempotencyKey)),
        );
      if (prior) return { groupId: prior.ledgerGroupId };

      const funded = await runFund(tx);
      await tx.insert(walletIdempotency).values({
        userId: actor.id,
        idempotencyKey,
        ledgerGroupId: funded.groupId,
      });
      return funded;
    });
  }

  await insertAuditLog({
    userId: actor.id,
    action: "wallet.manual_fund",
    entityType: "wallet",
    entityId: wallet.id,
    metadata: {
      amount,
      description: description ?? null,
      ledgerGroupId: result.groupId,
      idempotencyKey: idempotencyKey ?? null,
      targetUserId: targetUserId ?? null,
    },
  });
  return result;
}

export interface LedgerEntryView {
  id: string;
  walletType: WalletType;
  entryType: "debit" | "credit";
  amount: string;
  balanceAfter: string;
  referenceType: string;
  referenceId: string | null;
  description: string | null;
  createdAt: Date;
}

// Powers the "Passbook" screen — every ledger line for a user, across all their wallets.
export async function getWalletLedger(
  userId: string,
  { limit, offset }: { limit: number; offset: number },
): Promise<LedgerEntryView[]> {
  const rows = await db
    .select({
      id: walletLedgerEntries.id,
      walletType: wallets.walletType,
      entryType: walletLedgerEntries.entryType,
      amount: walletLedgerEntries.amount,
      balanceAfter: walletLedgerEntries.balanceAfter,
      referenceType: walletLedgerGroups.referenceType,
      referenceId: walletLedgerGroups.referenceId,
      description: walletLedgerGroups.description,
      createdAt: walletLedgerEntries.createdAt,
    })
    .from(walletLedgerEntries)
    .innerJoin(wallets, eq(wallets.id, walletLedgerEntries.walletId))
    .innerJoin(walletLedgerGroups, eq(walletLedgerGroups.id, walletLedgerEntries.groupId))
    .where(eq(wallets.userId, userId))
    .orderBy(desc(walletLedgerEntries.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
