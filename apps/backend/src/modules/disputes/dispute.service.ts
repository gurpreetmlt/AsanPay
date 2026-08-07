/**
 * Disputes / chargebacks — task #11.
 *
 * The one path in this module that touches money is resolveDispute() with `outcome: "refund"`.
 * It never posts a fresh credit and never edits a balance directly — it finds the journal(s)
 * that moved money for the disputed transaction and reverses them via reverseJournal(), which
 * mirrors the DR/CR legs (spec §4.8). The reversal link is what makes the case auditable after
 * the fact; a fresh credit with the same net effect would look identical to unrelated new money
 * entering the ledger.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/postgres";
import { disputes, transactions, journals } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { env } from "../../config/env";
import { reverseJournal, type Tx } from "../../core/ledger";
import { mirrorBalances } from "../wallet/wallet.ledger";

export type DisputeStatus = (typeof disputes.$inferSelect)["status"];
export type DisputeCategory = (typeof disputes.$inferSelect)["category"];

export async function raiseDispute(params: {
  tenantId: string;
  transactionId: string;
  raisedBy: string;
  category: DisputeCategory;
  description: string;
  evidenceUrls?: string[];
}) {
  const [txn] = await db
    .select({ id: transactions.id, userId: transactions.userId })
    .from(transactions)
    .where(eq(transactions.id, params.transactionId))
    .limit(1);
  if (!txn) throw new HttpError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");

  const slaDueAt = new Date(Date.now() + env.DISPUTE_SLA_HOURS * 60 * 60 * 1000);

  let row;
  try {
    [row] = await db
      .insert(disputes)
      .values({
        tenantId: params.tenantId,
        transactionId: params.transactionId,
        raisedBy: params.raisedBy,
        category: params.category,
        description: params.description,
        evidenceUrls: params.evidenceUrls ?? [],
        slaDueAt,
      })
      .returning();
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new HttpError(
        422,
        "This transaction already has an open dispute",
        "DISPUTE_ALREADY_OPEN",
      );
    }
    throw err;
  }

  if (!row) throw new HttpError(500, "Could not create dispute", "DISPUTE_CREATE_FAILED");

  await insertAuditLog({
    userId: params.raisedBy,
    action: "dispute.raised",
    entityType: "dispute",
    entityId: row.id,
    metadata: { transactionId: params.transactionId, category: params.category },
  });

  return row;
}

export async function listMyDisputes(userId: string, status?: DisputeStatus) {
  const conditions = [eq(disputes.raisedBy, userId)];
  if (status) conditions.push(eq(disputes.status, status));
  return db
    .select()
    .from(disputes)
    .where(and(...conditions))
    .orderBy(desc(disputes.submittedAt));
}

export async function listDisputeQueue(status?: DisputeStatus, limit = 100) {
  const conditions = status ? [eq(disputes.status, status)] : [];
  return db
    .select()
    .from(disputes)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(disputes.submittedAt))
    .limit(limit);
}

async function loadDispute(id: string) {
  const [row] = await db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
  if (!row) throw new HttpError(404, "Dispute not found", "DISPUTE_NOT_FOUND");
  return row;
}

export async function markUnderReview(adminId: string, id: string) {
  const d = await loadDispute(id);
  if (d.status !== "raised") {
    throw new HttpError(422, `Cannot review a ${d.status} dispute`, "INVALID_STATUS");
  }
  const [row] = await db
    .update(disputes)
    .set({ status: "under_review", reviewedBy: adminId })
    .where(eq(disputes.id, id))
    .returning();
  return row;
}

/**
 * Every journal posted for this transaction that hasn't already been reversed. A service
 * transaction can be more than one leg (e.g. principal debit + commission fee), all sharing the
 * transaction id as `journals.referenceId` — see modules/transactions/txn.service.ts's use of
 * `referenceId: row.id` when it calls transferBetweenWallets(). Resolving a refund has to
 * unwind every leg, not just the first one found.
 */
async function findReversibleJournals(tx: Tx, tenantId: string, transactionId: string) {
  const candidates = await tx
    .select({ id: journals.id })
    .from(journals)
    .where(and(eq(journals.tenantId, tenantId), eq(journals.referenceId, transactionId)));

  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);
  const already = await tx
    .select({ reversesId: journals.reversesId })
    .from(journals)
    .where(inArray(journals.reversesId, ids));
  const reversedIds = new Set(already.map((a) => a.reversesId));

  return candidates.filter((c) => !reversedIds.has(c.id)).map((c) => c.id);
}

export async function resolveDispute(params: {
  adminId: string;
  id: string;
  outcome: "resolved" | "rejected";
  resolutionNote: string;
  /** Only meaningful when outcome is "resolved" — reverses the transaction's journal(s). */
  refund?: boolean;
}): Promise<{ id: string; status: DisputeStatus; reversalJournalIds: string[] }> {
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(disputes).where(eq(disputes.id, params.id)).for("update");
    if (!d) throw new HttpError(404, "Dispute not found", "DISPUTE_NOT_FOUND");
    if (d.status === "resolved" || d.status === "rejected") {
      throw new HttpError(422, `Dispute is already ${d.status}`, "ALREADY_CLOSED");
    }

    let reversalJournalIds: string[] = [];

    if (params.outcome === "resolved" && params.refund) {
      const [txn] = await tx
        .select({ id: transactions.id, userId: transactions.userId })
        .from(transactions)
        .where(eq(transactions.id, d.transactionId))
        .limit(1);
      if (!txn) throw new HttpError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");

      const journalIds = await findReversibleJournals(tx, d.tenantId, d.transactionId);
      if (journalIds.length === 0) {
        throw new HttpError(
          422,
          "No reversible journal found for this transaction — it may already be fully reversed",
          "NOTHING_TO_REVERSE",
        );
      }

      for (const journalId of journalIds) {
        const reversal = await reverseJournal(tx, {
          tenantId: d.tenantId,
          journalId,
          idemKey: `DISPUTE:${d.id}:REVERSAL:${journalId}`,
          performedBy: params.adminId,
          reason: `Dispute ${d.id} resolved with refund: ${params.resolutionNote}`,
        });
        reversalJournalIds.push(reversal.id.toString());
      }

      await mirrorBalances(tx, d.tenantId, [txn.userId], false);
    }

    const [row] = await tx
      .update(disputes)
      .set({
        status: params.outcome,
        resolutionNote: params.resolutionNote,
        reversalJournalIds,
        reviewedBy: params.adminId,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, params.id))
      .returning();

    await insertAuditLog({
      userId: params.adminId,
      action: "dispute.resolved",
      entityType: "dispute",
      entityId: params.id,
      metadata: { outcome: params.outcome, refunded: Boolean(params.refund), reversalJournalIds },
    });

    if (!row) throw new HttpError(500, "Could not resolve dispute", "DISPUTE_RESOLVE_FAILED");
    return { id: row.id, status: row.status, reversalJournalIds };
  });
}

/** Open disputes past their SLA — surfaced by the jobs worker, same shape as fund-request staleness. */
export async function listOverdueDisputes(tenantId: string) {
  return db
    .select()
    .from(disputes)
    .where(
      and(
        eq(disputes.tenantId, tenantId),
        inArray(disputes.status, ["raised", "under_review"]),
        isNull(disputes.resolvedAt),
      ),
    )
    .orderBy(disputes.slaDueAt);
}
