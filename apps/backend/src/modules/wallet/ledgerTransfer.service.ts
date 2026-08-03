import { and, eq } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accounts, accountBalances, allocations, users } from "../../db/postgres/schema";
import { postJournal, resolveAccount, type Tx } from "../../core/ledger";
import { HttpError } from "../../utils/httpError";
import type { Paise } from "../../core/money";
import { ensureHierarchyAccount } from "./ledgerAccounts";

const COMPANY = "COMPANY_001";
const FLOAT_CONTROL = "TREASURY_FLOAT_CONTROL";

/**
 * Company -> SD, SD -> Distributor, Distributor -> Retailer.
 *
 * The flow matrix is what rejects everything else, including a retailer -> retailer peer
 * transfer. That is a compliance boundary (spec §9.3), not a product decision: money moves
 * down the hierarchy and leaves only via a settlement payout to the agent's own bank.
 */
export async function transferDownline(params: {
  tenantId: string;
  fromUserId: string;
  toUserId: string;
  amount: Paise;
  idemKey: string;
  performedBy: string;
  reason?: string;
}): Promise<{ journalId: bigint; replayed: boolean }> {
  const { tenantId, fromUserId, toUserId, amount, idemKey, performedBy } = params;

  if (fromUserId === toUserId) {
    throw new HttpError(422, "Cannot transfer to the same account", "INVALID_TRANSFER");
  }

  return db.transaction(async (tx) => {
    await assertIsDirectDownline(tx, fromUserId, toUserId);

    const fromCode = await ensureHierarchyAccount(tx, tenantId, fromUserId);
    const toCode = await ensureHierarchyAccount(tx, tenantId, toUserId);

    await assertTopupAllowed(tx, tenantId, toCode);

    const journal = await postJournal(tx, {
      tenantId,
      txnType: "WALLET_TRANSFER",
      idemKey,
      performedBy,
      reason: params.reason ?? null,
      entries: [
        { code: fromCode, dir: "DR", amount },
        { code: toCode, dir: "CR", amount },
      ],
    });

    return { journalId: journal.id, replayed: journal.replayed };
  });
}

/**
 * Company wallet -> an agent. The only door money has into the hierarchy. Admin performs it
 * but holds no wallet of their own — they appear in `performed_by`, nowhere else.
 */
export async function fundFromCompany(params: {
  tenantId: string;
  toUserId: string;
  amount: Paise;
  idemKey: string;
  performedBy: string;
  txnType?: "WALLET_TRANSFER" | "DEPOSIT_CREDIT";
  referenceId?: string;
  reason?: string;
}): Promise<{ journalId: bigint; replayed: boolean }> {
  const { tenantId, toUserId, amount, idemKey, performedBy } = params;

  return db.transaction(async (tx) => {
    const toCode = await ensureHierarchyAccount(tx, tenantId, toUserId);
    await assertTopupAllowed(tx, tenantId, toCode);

    const journal = await postJournal(tx, {
      tenantId,
      txnType: params.txnType ?? "WALLET_TRANSFER",
      idemKey,
      performedBy,
      referenceId: params.referenceId ?? null,
      reason: params.reason ?? null,
      entries: [
        { code: COMPANY, dir: "DR", amount },
        { code: toCode, dir: "CR", amount },
      ],
    });

    return { journalId: journal.id, replayed: journal.replayed };
  });
}

/**
 * Step 1 of an allocation: a maker asks for spendable capacity on the company wallet.
 * Nothing is posted here — the request on its own moves no money.
 */
export async function requestAllocation(params: {
  tenantId: string;
  amount: Paise;
  reason: string;
  requestedBy: string;
}): Promise<{ allocationId: bigint }> {
  if (params.amount <= 0n) {
    throw new HttpError(422, "Allocation amount must be positive", "INVALID_AMOUNT");
  }
  if (!params.reason?.trim()) {
    throw new HttpError(422, "Allocation requires a written reason", "REASON_REQUIRED");
  }

  const [row] = await db
    .insert(allocations)
    .values({
      tenantId: params.tenantId,
      amount: params.amount,
      reason: params.reason.trim(),
      requestedBy: params.requestedBy,
      status: "requested",
    })
    .returning({ id: allocations.id });

  if (!row) throw new HttpError(500, "Could not record allocation request", "ALLOCATION_FAILED");
  return { allocationId: row.id };
}

/**
 * Step 2: a different operator approves, and only then is the journal posted.
 *
 *   Dr TREASURY_FLOAT_CONTROL / Cr COMPANY_001
 *
 * No asset moves — this creates spendable capacity, which is exactly why it needs two people.
 * The maker <> checker rule is also a database CHECK, so a service-layer bug cannot bypass it.
 */
export async function approveAllocation(params: {
  tenantId: string;
  allocationId: bigint;
  approvedBy: string;
  note?: string;
}): Promise<{ journalId: bigint; replayed: boolean }> {
  const { tenantId, allocationId, approvedBy } = params;

  return db.transaction(async (tx) => {
    const [alloc] = await tx
      .select()
      .from(allocations)
      .where(and(eq(allocations.id, allocationId), eq(allocations.tenantId, tenantId)))
      .for("update");

    if (!alloc) throw new HttpError(404, "Allocation not found", "ALLOCATION_NOT_FOUND");
    if (alloc.status !== "requested") {
      throw new HttpError(422, `Allocation is already ${alloc.status}`, "ALLOCATION_DECIDED");
    }
    if (alloc.requestedBy === approvedBy) {
      throw new HttpError(
        403,
        "The operator who requested an allocation cannot approve it",
        "MAKER_IS_CHECKER",
      );
    }

    const journal = await postJournal(tx, {
      tenantId,
      txnType: "ALLOCATION",
      idemKey: `ALLOC:${allocationId}`,
      performedBy: approvedBy,
      reason: alloc.reason,
      referenceId: String(allocationId),
      entries: [
        { code: FLOAT_CONTROL, dir: "DR", amount: alloc.amount },
        { code: COMPANY, dir: "CR", amount: alloc.amount },
      ],
    });

    await tx
      .update(allocations)
      .set({
        status: "approved",
        approvedBy,
        decisionNote: params.note ?? null,
        journalId: journal.id,
        decidedAt: new Date(),
      })
      .where(eq(allocations.id, allocationId));

    return { journalId: journal.id, replayed: journal.replayed };
  });
}

export async function rejectAllocation(params: {
  tenantId: string;
  allocationId: bigint;
  rejectedBy: string;
  note: string;
}): Promise<void> {
  const { tenantId, allocationId, rejectedBy } = params;

  await db.transaction(async (tx) => {
    const [alloc] = await tx
      .select()
      .from(allocations)
      .where(and(eq(allocations.id, allocationId), eq(allocations.tenantId, tenantId)))
      .for("update");

    if (!alloc) throw new HttpError(404, "Allocation not found", "ALLOCATION_NOT_FOUND");
    if (alloc.status !== "requested") {
      throw new HttpError(422, `Allocation is already ${alloc.status}`, "ALLOCATION_DECIDED");
    }
    if (alloc.requestedBy === rejectedBy) {
      throw new HttpError(403, "Cannot decide your own allocation", "MAKER_IS_CHECKER");
    }

    await tx
      .update(allocations)
      .set({ status: "rejected", approvedBy: rejectedBy, decisionNote: params.note, decidedAt: new Date() })
      .where(eq(allocations.id, allocationId));
  });
}

/** Balances for one agent: what they can spend, and the earned slice they may withdraw. */
export async function getLedgerBalance(
  tenantId: string,
  userId: string,
): Promise<{ code: string; balance: bigint; settleable: bigint; usable: bigint }> {
  const [row] = await db
    .select({
      code: accounts.code,
      balance: accountBalances.balance,
      settleable: accountBalances.settleable,
    })
    .from(accounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, accounts.id))
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.userId, userId)))
    .limit(1);

  if (!row) {
    throw new HttpError(404, "No ledger account for this user", "ACCOUNT_NOT_FOUND");
  }

  return { ...row, usable: row.balance - row.settleable };
}

/** Only a direct parent may fund a child. Skipping a level would break the audit chain. */
async function assertIsDirectDownline(tx: Tx, parentId: string, childId: string): Promise<void> {
  const [child] = await tx
    .select({ parentId: users.parentId })
    .from(users)
    .where(eq(users.id, childId))
    .limit(1);

  if (!child) throw new HttpError(404, "Downline user not found", "USER_NOT_FOUND");
  if (child.parentId !== parentId) {
    throw new HttpError(403, "Not your direct downline", "NOT_DIRECT_DOWNLINE");
  }
}

/**
 * `block_topup` stops money going IN. It deliberately does not stop settlement — an agent
 * under review must still be able to withdraw what they already earned (spec §6.4).
 */
async function assertTopupAllowed(tx: Tx, tenantId: string, code: string): Promise<void> {
  const account = await resolveAccount(tenantId, code, tx);
  if (account.blockTopup) {
    throw new HttpError(403, `Top-up is blocked for ${code}`, "TOPUP_BLOCKED");
  }
}
