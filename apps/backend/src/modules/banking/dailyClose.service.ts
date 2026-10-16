import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { treasuryDailyCloses } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";

export type DailyCloseStepId = "upload" | "recon" | "resolve" | "close";

export interface DailyCloseStep {
  id: DailyCloseStepId;
  title: string;
  detail: string;
  done: boolean;
  blocking: boolean;
  count: number;
  href: string | null;
}

export interface DailyCloseBankStatus {
  id: string;
  bankName: string;
  last4: string;
  uploaded: boolean;
}

export interface DailyCloseStatus {
  date: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
  canClose: boolean;
  banks: DailyCloseBankStatus[];
  steps: DailyCloseStep[];
}

function assertDate(raw: string): string {
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(422, "date must be YYYY-MM-DD", "INVALID_DATE");
  }
  return date;
}

/**
 * Live checklist for one business day: Upload → Reconcile → Resolve → Close.
 * Close is a soft record (TB07). Hard balance lock is TB15.
 */
export async function getDailyCloseStatus(params: {
  tenantId: string;
  date: string;
}): Promise<DailyCloseStatus> {
  const date = assertDate(params.date);

  const banks = await db.execute<{ id: string; bank_name: string; last4: string; uploaded: boolean }>(sql`
    SELECT ba.id::text AS id, ba.bank_name, ba.account_number_last4 AS last4,
           EXISTS (
             SELECT 1 FROM bank_statement_imports i
             WHERE i.bank_account_id = ba.id
               AND i.period_from IS NOT NULL AND i.period_to IS NOT NULL
               AND ${date}::date BETWEEN i.period_from AND i.period_to
           ) OR EXISTS (
             SELECT 1 FROM bank_statement_lines l
             WHERE l.bank_account_id = ba.id AND l.txn_date = ${date}::date
           ) AS uploaded
    FROM bank_accounts ba
    WHERE ba.tenant_id = ${params.tenantId} AND ba.deleted_at IS NULL AND ba.is_active
    ORDER BY ba.bank_name, ba.account_number_last4
  `);

  const counts = await db.execute<{
    unmatched: string;
    pending_funds: string;
    pending_entries: string;
    suspense: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM bank_statement_lines
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date
          AND direction = 'CR' AND match_status = 'unmatched')::text AS unmatched,
      (SELECT COUNT(*) FROM fund_requests
        WHERE tenant_id = ${params.tenantId}
          AND (deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date = ${date}::date
          AND status IN ('submitted','pending_match','auto_matched','amount_mismatch','suspect','under_review'))::text AS pending_funds,
      (SELECT COUNT(*) FROM bank_entries
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date
          AND status = 'requested' AND reversed_at IS NULL)::text AS pending_entries,
      (SELECT COUNT(*) FROM bank_statement_lines
        WHERE tenant_id = ${params.tenantId} AND txn_date = ${date}::date
          AND match_status = 'suspense')::text AS suspense
  `);

  const c = counts.rows[0] ?? {
    unmatched: "0",
    pending_funds: "0",
    pending_entries: "0",
    suspense: "0",
  };
  const unmatched = Number(c.unmatched);
  const pendingFunds = Number(c.pending_funds);
  const pendingEntries = Number(c.pending_entries);
  const suspense = Number(c.suspense);
  const bankRows = banks.rows.map((b) => ({
    id: b.id,
    bankName: b.bank_name,
    last4: b.last4,
    uploaded: Boolean(b.uploaded),
  }));
  const missingUploads = bankRows.filter((b) => !b.uploaded).length;
  const uploadDone = bankRows.length === 0 ? false : missingUploads === 0;
  const reconDone = unmatched === 0;
  const resolveDone = pendingFunds === 0 && pendingEntries === 0 && suspense === 0;

  const closedRow = await db.execute<{
    closed_at: string;
    note: string | null;
    closed_by_name: string | null;
  }>(sql`
    SELECT c.closed_at::text, c.note, u.name AS closed_by_name
    FROM treasury_daily_closes c
    LEFT JOIN users u ON u.id = c.closed_by
    WHERE c.tenant_id = ${params.tenantId} AND c.business_date = ${date}::date
    LIMIT 1
  `);
  const closed = closedRow.rows[0] ?? null;

  const steps: DailyCloseStep[] = [
    {
      id: "upload",
      title: "Upload statements",
      detail:
        bankRows.length === 0
          ? "Add an active company bank account first."
          : missingUploads
            ? `${missingUploads} of ${bankRows.length} bank${bankRows.length === 1 ? "" : "s"} still need a statement for this date.`
            : `All ${bankRows.length} active bank${bankRows.length === 1 ? "" : "s"} have statement coverage.`,
      done: uploadDone,
      blocking: true,
      count: missingUploads,
      href: `/treasury/bank?tab=reconciliation`,
    },
    {
      id: "recon",
      title: "Run reconciliation",
      detail: unmatched
        ? `${unmatched} unmatched credit${unmatched === 1 ? "" : "s"} on this date — match or create entries.`
        : "No unmatched statement credits for this date.",
      done: reconDone,
      blocking: true,
      count: unmatched,
      href: `/treasury/bank?tab=reconciliation`,
    },
    {
      id: "resolve",
      title: "Resolve open items",
      detail: resolveDone
        ? "No open fund requests, pending bank entries, or needs-review lines for this date."
        : [
            pendingFunds ? `${pendingFunds} open fund request${pendingFunds === 1 ? "" : "s"}` : null,
            pendingEntries ? `${pendingEntries} bank entr${pendingEntries === 1 ? "y" : "ies"} awaiting approval` : null,
            suspense ? `${suspense} needs-review line${suspense === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
      done: resolveDone,
      blocking: true,
      count: pendingFunds + pendingEntries + suspense,
      href: pendingFunds
        ? `/treasury/bank?tab=fund-requests`
        : pendingEntries
          ? `/treasury/bank?tab=bank-entries`
          : `/treasury/bank?tab=reconciliation`,
    },
    {
      id: "close",
      title: "Close the day",
      detail: closed
        ? `Closed${closed.closed_by_name ? ` by ${closed.closed_by_name}` : ""}. Soft close — balance lock is a later step.`
        : uploadDone && reconDone && resolveDone
          ? "All checks passed. You can close this business day."
          : "Finish the steps above before closing.",
      done: !!closed,
      blocking: false,
      count: closed ? 1 : 0,
      href: null,
    },
  ];

  return {
    date,
    closed: !!closed,
    closedAt: closed?.closed_at ?? null,
    closedByName: closed?.closed_by_name ?? null,
    note: closed?.note ?? null,
    canClose: !closed && uploadDone && reconDone && resolveDone,
    banks: bankRows,
    steps,
  };
}

export async function closeBusinessDay(params: {
  tenantId: string;
  date: string;
  adminId: string;
  note?: string | null;
}): Promise<DailyCloseStatus> {
  const status = await getDailyCloseStatus({ tenantId: params.tenantId, date: params.date });
  if (status.closed) {
    throw new HttpError(422, "This business day is already closed", "DAY_ALREADY_CLOSED");
  }
  if (!status.canClose) {
    const open = status.steps.filter((s) => s.blocking && !s.done).map((s) => s.title);
    throw new HttpError(
      422,
      `Cannot close yet. Finish: ${open.join(", ")}`,
      "DAY_CLOSE_INCOMPLETE",
    );
  }

  const snapshot = {
    banks: status.banks,
    steps: status.steps.map((s) => ({ id: s.id, done: s.done, count: s.count, detail: s.detail })),
  };

  await db.insert(treasuryDailyCloses).values({
    tenantId: params.tenantId,
    businessDate: status.date,
    closedBy: params.adminId,
    note: params.note?.trim() || null,
    snapshot,
  });

  await insertAuditLog({
    userId: params.adminId,
    action: "admin.treasury_daily_close",
    entityType: "treasury_daily_close",
    entityId: status.date,
    metadata: {
      date: status.date,
      why: params.note?.trim() || `Soft-closed business day ${status.date}`,
    },
  });

  return getDailyCloseStatus({ tenantId: params.tenantId, date: status.date });
}

export async function reopenBusinessDay(params: {
  tenantId: string;
  date: string;
  adminId: string;
}): Promise<DailyCloseStatus> {
  const date = assertDate(params.date);
  const deleted = await db
    .delete(treasuryDailyCloses)
    .where(and(eq(treasuryDailyCloses.tenantId, params.tenantId), eq(treasuryDailyCloses.businessDate, date)))
    .returning({ id: treasuryDailyCloses.id });
  if (!deleted.length) {
    throw new HttpError(404, "This business day is not closed", "DAY_NOT_CLOSED");
  }
  await insertAuditLog({
    userId: params.adminId,
    action: "admin.treasury_daily_reopen",
    entityType: "treasury_daily_close",
    entityId: date,
    metadata: { date, why: `Reopened soft-closed business day ${date}` },
  });
  return getDailyCloseStatus({ tenantId: params.tenantId, date });
}
