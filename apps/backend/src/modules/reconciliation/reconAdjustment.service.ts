import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { accounts, reconAdjustments, users } from "../../db/postgres/schema";
import { postJournal, resolveAccount, type Tx } from "../../core/ledger";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { paiseToRupees, type Paise } from "../../core/money";
import { mirrorBalances } from "../wallet/wallet.ledger";

const COMPANY = "COMPANY_001";

/**
 * Spec §9.2 — RECON_ADJUSTMENT is a ledger wildcard.
 * Money posts only after a second admin approves a prior request (DB CHECK enforces maker ≠ checker).
 */
export async function requestReconAdjustment(params: {
  tenantId: string;
  amount: Paise;
  debitCode: string;
  creditCode: string;
  reason: string;
  requestedBy: string;
}): Promise<{ adjustmentId: string }> {
  if (params.amount <= 0n) {
    throw new HttpError(422, "Adjustment amount must be positive", "INVALID_AMOUNT");
  }
  const debitCode = params.debitCode.trim().toUpperCase();
  const creditCode = params.creditCode.trim().toUpperCase();
  if (!debitCode || !creditCode) {
    throw new HttpError(400, "Debit account code and credit account code are required", "CODES_REQUIRED");
  }
  if (debitCode === creditCode) {
    throw new HttpError(400, "Debit and credit account codes must be different", "CODES_SAME");
  }
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new HttpError(
      400,
      "Reason must be at least 8 characters explaining why this adjustment is needed",
      "REASON_REQUIRED",
    );
  }

  await resolveAccount(params.tenantId, debitCode);
  await resolveAccount(params.tenantId, creditCode);

  const [row] = await db
    .insert(reconAdjustments)
    .values({
      tenantId: params.tenantId,
      amount: params.amount,
      debitCode,
      creditCode,
      reason,
      requestedBy: params.requestedBy,
      status: "requested",
    })
    .returning({ id: reconAdjustments.id });

  if (!row) throw new HttpError(500, "Could not record recon adjustment request", "ADJUSTMENT_FAILED");

  await insertAuditLog({
    userId: params.requestedBy,
    action: "admin.recon_adjustment_request",
    entityType: "recon_adjustment",
    entityId: String(row.id),
    metadata: {
      amountPaise: params.amount.toString(),
      debitCode,
      creditCode,
      reason,
    },
  });

  return { adjustmentId: String(row.id) };
}

export async function approveReconAdjustment(params: {
  tenantId: string;
  adjustmentId: bigint;
  approvedBy: string;
  note?: string;
}): Promise<{ journalId: string; replayed: boolean }> {
  const { tenantId, adjustmentId, approvedBy } = params;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reconAdjustments)
      .where(and(eq(reconAdjustments.id, adjustmentId), eq(reconAdjustments.tenantId, tenantId)))
      .for("update");

    if (!row) throw new HttpError(404, "Recon adjustment not found", "ADJUSTMENT_NOT_FOUND");
    if (row.status !== "requested") {
      throw new HttpError(422, `Recon adjustment is already ${row.status}`, "ADJUSTMENT_DECIDED");
    }
    if (row.requestedBy === approvedBy) {
      throw new HttpError(
        403,
        "The operator who requested a recon adjustment cannot approve it",
        "MAKER_IS_CHECKER",
      );
    }

    const amount = row.amount as Paise;
    const journal = await postJournal(tx, {
      tenantId,
      txnType: "RECON_ADJUSTMENT",
      idemKey: `RECON_ADJ:${adjustmentId}`,
      performedBy: approvedBy,
      reason: row.reason,
      referenceId: String(adjustmentId),
      entries: [
        { code: row.debitCode, dir: "DR", amount },
        { code: row.creditCode, dir: "CR", amount },
      ],
    });

    await syncWalletMirrors(tx, tenantId, [row.debitCode, row.creditCode]);

    await tx
      .update(reconAdjustments)
      .set({
        status: "approved",
        approvedBy,
        decisionNote: params.note?.trim() || null,
        journalId: journal.id,
        decidedAt: new Date(),
      })
      .where(eq(reconAdjustments.id, adjustmentId));

    return { journalId: String(journal.id), replayed: journal.replayed };
  }).then(async (result) => {
    await insertAuditLog({
      userId: approvedBy,
      action: "admin.recon_adjustment_approve",
      entityType: "recon_adjustment",
      entityId: String(adjustmentId),
      metadata: {
        journalId: result.journalId,
        replayed: result.replayed,
        note: params.note ?? null,
      },
    });
    return result;
  });
}

export async function rejectReconAdjustment(params: {
  tenantId: string;
  adjustmentId: bigint;
  rejectedBy: string;
  note: string;
}): Promise<void> {
  const note = params.note.trim();
  if (note.length < 3) {
    throw new HttpError(400, "Rejection note must be at least 3 characters", "NOTE_REQUIRED");
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(reconAdjustments)
      .where(
        and(eq(reconAdjustments.id, params.adjustmentId), eq(reconAdjustments.tenantId, params.tenantId)),
      )
      .for("update");

    if (!row) throw new HttpError(404, "Recon adjustment not found", "ADJUSTMENT_NOT_FOUND");
    if (row.status !== "requested") {
      throw new HttpError(422, `Recon adjustment is already ${row.status}`, "ADJUSTMENT_DECIDED");
    }
    if (row.requestedBy === params.rejectedBy) {
      throw new HttpError(403, "Cannot decide your own recon adjustment", "MAKER_IS_CHECKER");
    }

    await tx
      .update(reconAdjustments)
      .set({
        status: "rejected",
        approvedBy: params.rejectedBy,
        decisionNote: note,
        decidedAt: new Date(),
      })
      .where(eq(reconAdjustments.id, params.adjustmentId));
  });

  await insertAuditLog({
    userId: params.rejectedBy,
    action: "admin.recon_adjustment_reject",
    entityType: "recon_adjustment",
    entityId: String(params.adjustmentId),
    metadata: { note },
  });
}

export async function listReconAdjustments(params: {
  tenantId: string;
  status?: "requested" | "approved" | "rejected";
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const maker = alias(users, "recon_adj_maker");
  const checker = alias(users, "recon_adj_checker");

  const conditions = [eq(reconAdjustments.tenantId, params.tenantId)];
  if (params.status) conditions.push(eq(reconAdjustments.status, params.status));

  const rows = await db
    .select({
      id: reconAdjustments.id,
      amount: reconAdjustments.amount,
      debitCode: reconAdjustments.debitCode,
      creditCode: reconAdjustments.creditCode,
      reason: reconAdjustments.reason,
      status: reconAdjustments.status,
      requestedBy: reconAdjustments.requestedBy,
      requestedByName: maker.name,
      approvedBy: reconAdjustments.approvedBy,
      approvedByName: checker.name,
      decisionNote: reconAdjustments.decisionNote,
      journalId: reconAdjustments.journalId,
      requestedAt: reconAdjustments.requestedAt,
      decidedAt: reconAdjustments.decidedAt,
    })
    .from(reconAdjustments)
    .innerJoin(maker, eq(maker.id, reconAdjustments.requestedBy))
    .leftJoin(checker, eq(checker.id, reconAdjustments.approvedBy))
    .where(and(...conditions))
    .orderBy(desc(reconAdjustments.requestedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: String(r.id),
    amount: paiseToRupees(r.amount as Paise),
    debitCode: r.debitCode,
    creditCode: r.creditCode,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requestedBy,
    requestedByName: r.requestedByName,
    approvedBy: r.approvedBy,
    approvedByName: r.approvedByName,
    decisionNote: r.decisionNote,
    journalId: r.journalId != null ? String(r.journalId) : null,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
  }));
}

/** Optional ops aid — active account codes for the recon form datalist. */
export async function listLedgerAccountCodes(tenantId: string, limit = 100) {
  const rows = await db
    .select({
      code: accounts.code,
      name: accounts.name,
      accountType: accounts.accountType,
      userId: accounts.userId,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.status, "active")))
    .orderBy(accounts.code)
    .limit(Math.min(Math.max(limit, 1), 300));

  return rows;
}

async function syncWalletMirrors(tx: Tx, tenantId: string, codes: string[]): Promise<void> {
  const uniqueCodes = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
  if (uniqueCodes.length === 0) return;

  const resolved = await tx
    .select({ code: accounts.code, userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), inArray(accounts.code, uniqueCodes)));

  const userIds = resolved.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const companyMoved = uniqueCodes.includes(COMPANY);
  await mirrorBalances(tx, tenantId, userIds, companyMoved);
}
