import { and, eq, gt, lte, isNull, or, desc, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import {
  commissionLedger,
  commissionRules,
  userCommissionRates,
  transactions,
  userHierarchy,
  users,
  wallets,
} from "../../db/postgres/schema";
import { transferBetweenWallets } from "../wallet/wallet.ledger";
import { toPaise, fromPaise } from "../wallet/decimal";
import { logger } from "../../utils/logger";
import type { UserRole } from "@asanpay/shared-types";

// Runs after a service transaction succeeds: pays every ancestor in the chain
// (retailer -> distributor -> master_distributor) their configured cut, each
// payout backed by a system-wallet -> beneficiary-wallet ledger transfer.
// Idempotent per transaction: existing commission_ledger rows short-circuit.
export async function distributeCommissionForTxn(transactionId: string): Promise<void> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!txn || txn.status !== "success") return;

  const [alreadyPaid] = await db
    .select({ id: commissionLedger.id })
    .from(commissionLedger)
    .where(eq(commissionLedger.transactionId, transactionId))
    .limit(1);
  if (alreadyPaid) return;

  // Everyone above (and including) the transacting retailer, closest first.
  const chain = await db
    .select({ userId: userHierarchy.ancestorId, depth: userHierarchy.depth, role: users.role, active: users.isActive })
    .from(userHierarchy)
    .innerJoin(users, eq(userHierarchy.ancestorId, users.id))
    .where(eq(userHierarchy.descendantId, txn.userId))
    .orderBy(userHierarchy.depth);

  const [systemAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), isNull(users.parentId)))
    .limit(1);
  if (!systemAdmin) {
    logger.error({ transactionId }, "commission skipped: no root admin/system wallet");
    return;
  }
  const [systemWallet] = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, systemAdmin.id), eq(wallets.walletType, "main")));
  if (!systemWallet) return;

  const now = new Date();
  const amountPaise = toPaise(txn.amount);

  for (const member of chain) {
    // Admin is the residual earner (whatever margin remains) — no explicit payout row.
    if (member.role === "admin" || !member.active) continue;

    const rule = await findActiveRule(txn.serviceId, member.userId, member.role, txn.amount, now);
    if (!rule) continue;

    // percentage value is 0-100 with up to 4 decimals; compute in integer space
    // (paise x basis-points) so no float error ever reaches a wallet.
    const payoutPaise =
      rule.ruleType === "flat"
        ? toPaise(rule.value)
        : Math.floor((amountPaise * Math.round(parseFloat(rule.value) * 10000)) / 1_000_000);
    if (payoutPaise <= 0) continue;
    const payout = fromPaise(payoutPaise);

    const [beneWallet] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, member.userId), eq(wallets.walletType, "main")));
    if (!beneWallet) continue;

    try {
      // Transfer + ledger insert share one tx: if a concurrent distribution already paid this
      // (transaction, beneficiary), the unique constraint makes the insert throw and the whole
      // tx — including the money transfer — rolls back. No double payout.
      await db.transaction(async (tx) => {
        const { groupId } = await transferBetweenWallets(
          {
            fromWalletId: systemWallet.id,
            toWalletId: beneWallet.id,
            amount: payout,
            referenceType: "commission",
            referenceId: txn.id,
            description: `Commission ${txn.txnRef} (${member.role})`,
          },
          tx,
        );
        await tx.insert(commissionLedger).values({
          transactionId: txn.id,
          beneficiaryUserId: member.userId,
          role: member.role,
          amount: payout,
          ledgerGroupId: groupId,
        });
      });
    } catch (err) {
      // Either a genuine payout failure or a duplicate (already paid this beneficiary for this
      // txn) — both must never break the customer txn. Log and continue; reconciliation surfaces gaps.
      logger.error({ err, transactionId, beneficiary: member.userId }, "commission payout skipped/failed");
    }
  }
}

async function findActiveRule(
  serviceId: string,
  userId: string,
  role: UserRole,
  amount: string,
  at: Date,
) {
  const [override] = await db
    .select({
      ruleType: userCommissionRates.ruleType,
      value: userCommissionRates.value,
    })
    .from(userCommissionRates)
    .where(
      and(
        eq(userCommissionRates.userId, userId),
        eq(userCommissionRates.serviceId, serviceId),
        eq(userCommissionRates.isActive, true),
      ),
    )
    .limit(1);
  if (override) return override;

  const amountNum = amount;
  const [rule] = await db
    .select({
      ruleType: commissionRules.ruleType,
      value: commissionRules.value,
    })
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.serviceId, serviceId),
        eq(commissionRules.role, role),
        eq(commissionRules.isActive, true),
        lte(commissionRules.effectiveFrom, at),
        or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, at)),
        or(isNull(commissionRules.minAmount), lte(commissionRules.minAmount, amountNum)),
        or(isNull(commissionRules.maxAmount), sql`${commissionRules.maxAmount} >= ${amountNum}`),
      ),
    )
    .orderBy(desc(commissionRules.effectiveFrom))
    .limit(1);
  return rule ?? null;
}

// ── Earnings reads (retailer/distributor dashboards) ────────────────────────
export async function getEarningsSummary(userId: string, since: Date) {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${commissionLedger.amount}), '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(commissionLedger)
    .where(and(eq(commissionLedger.beneficiaryUserId, userId), sql`${commissionLedger.createdAt} >= ${since}`));
  return row ?? { total: "0", count: 0 };
}

export async function listEarnings(userId: string, limit = 50, offset = 0) {
  return db
    .select({
      id: commissionLedger.id,
      amount: commissionLedger.amount,
      transactionId: commissionLedger.transactionId,
      txnRef: transactions.txnRef,
      createdAt: commissionLedger.createdAt,
    })
    .from(commissionLedger)
    .innerJoin(transactions, eq(commissionLedger.transactionId, transactions.id))
    .where(eq(commissionLedger.beneficiaryUserId, userId))
    .orderBy(desc(commissionLedger.createdAt))
    .limit(Math.min(limit, 100))
    .offset(offset);
}
