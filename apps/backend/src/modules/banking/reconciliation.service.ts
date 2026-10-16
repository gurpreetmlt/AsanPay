import { sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { paiseToRupees } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { BANK_ENTRY_CATEGORIES, isBankEntryCategory } from "../treasury/bankEntry.service";
import { normaliseUtr } from "./banking.service";

/**
 * Bank reconciliation: imported statement lines vs every ledger leg on that bank's
 * TREASURY_BANK_* account. A line is linked to a journal in exactly one of four ways —
 * fund request claim, VAN credit, suspense park, or an explicit `journal` link written here.
 * Everything else is computed per request so nothing drifts out of date.
 */

type Kind = "matched" | "suspense" | "mismatch" | "possible" | "only_bank" | "only_ours" | "ignored";

type LineRow = {
  id: string;
  txn_date: string;
  direction: "DR" | "CR";
  amount: string;
  utr: string | null;
  utr_norm: string | null;
  narration: string | null;
  sender_name: string | null;
  balance_after: string | null;
  match_status: string;
  matched_to_type: string | null;
  linked_journal_id: string | null;
};

type RecordRow = {
  entry_id: string;
  journal_id: string;
  direction: "DR" | "CR";
  amount: string;
  txn_type: string;
  reason: string | null;
  biz_date: string;
  bank_entry_id: string | null;
  category: string | null;
  be_utr: string | null;
  party_name: string | null;
  fr_id: string | null;
  fr_ref: string | null;
  fr_name: string | null;
};

export interface ReconLine {
  id: string;
  date: string;
  direction: "CR" | "DR";
  amount: string;
  utr: string | null;
  narration: string | null;
  senderName: string | null;
}

export interface ReconRecord {
  journalId: string;
  date: string;
  /** Statement-side direction: money into the bank is CR, out is DR. */
  direction: "CR" | "DR";
  amount: string;
  label: string;
  party: string | null;
  utr: string | null;
}

export interface ReconRow {
  kind: Kind;
  line: ReconLine | null;
  record: ReconRecord | null;
  /** True when the link was confirmed by hand and can be undone. */
  unlinkable: boolean;
  /** Why this row is a likely match (amount + UTR miss / same UTR). */
  hint?: string | null;
}

const TXN_LABELS: Record<string, string> = {
  DEPOSIT_RECEIVE: "Agent deposit",
  UNIDENTIFIED_CREDIT: "Parked in suspense",
  SETTLEMENT_PAYOUT: "Agent settlement payout",
  FLOAT_TRANSFER: "Provider float transfer",
  REVERSAL: "Reversal",
};

async function bankLedger(tenantId: string, bankAccountId: bigint) {
  const rows = await db.execute<{ ledger_account_id: string; bank_name: string; last4: string }>(sql`
    SELECT ledger_account_id::text, bank_name, account_number_last4 AS last4
    FROM bank_accounts
    WHERE id = ${String(bankAccountId)} AND tenant_id = ${tenantId}
  `);
  const bank = rows.rows[0];
  if (!bank) throw new HttpError(404, "Bank account not found. Pick a registered company bank.", "BANK_NOT_FOUND");
  return bank;
}

/** Lines of one bank with the journal each is already tied to (if any). */
function linkedLinesCte(bankAccountId: bigint) {
  return sql`
    linked AS (
      SELECT l.id, l.txn_date::text AS txn_date, l.direction, l.amount::text AS amount, l.utr, l.utr_norm,
             l.narration, l.sender_name, l.balance_after::text AS balance_after,
             l.match_status::text AS match_status, l.matched_to_type,
             COALESCE(
               CASE WHEN l.matched_to_type = 'journal' THEN l.matched_to_id END,
               l.suspense_journal_id,
               CASE WHEN l.matched_to_type = 'fund_request'
                    THEN (SELECT fr.receive_journal_id FROM fund_requests fr WHERE fr.id = l.matched_to_id) END,
               CASE WHEN l.matched_to_type = 'van'
                    THEN (SELECT j.id FROM journals j
                          WHERE j.tenant_id = l.tenant_id
                            AND j.idem_key = 'VAN:' || l.bank_account_id::text || ':' || l.bank_txn_id || ':RECEIVE') END
             )::text AS linked_journal_id
      FROM bank_statement_lines l
      WHERE l.bank_account_id = ${String(bankAccountId)}
    )`;
}

function recordsCte(ledgerAccountId: string) {
  return sql`
    rec AS (
      SELECT le.id::text AS entry_id, le.journal_id::text AS journal_id, le.direction, le.amount::text AS amount,
             j.txn_type, j.reason,
             COALESCE(be.txn_date, (fr.deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date,
                      (j.created_at AT TIME ZONE 'Asia/Kolkata')::date)::text AS biz_date,
             be.id::text AS bank_entry_id, be.category, be.utr AS be_utr, be.party_name,
             fr.id::text AS fr_id, fr.reference_norm AS fr_ref, u.name AS fr_name
      FROM ledger_entries le
      JOIN journals j ON j.id = le.journal_id
      LEFT JOIN bank_entries be ON be.journal_id = j.id
      LEFT JOIN fund_requests fr ON fr.receive_journal_id = j.id
      LEFT JOIN users u ON u.id = fr.requester_user_id
      WHERE le.account_id = ${ledgerAccountId}
        -- A voided fund request and its reversal cancel out; no bank money moved for either.
        AND (fr.id IS NULL OR fr.status::text <> 'voided')
        AND j.idem_key NOT LIKE 'FR:%:VOID:%'
        -- Same for a reversed bank entry and its reversal.
        AND (be.id IS NULL OR be.reversed_at IS NULL)
        AND j.idem_key NOT LIKE 'BE:%:REV'
    )`;
}

function toLine(r: LineRow): ReconLine {
  return {
    id: r.id,
    date: r.txn_date,
    direction: r.direction,
    amount: paiseToRupees(BigInt(r.amount)),
    utr: r.utr,
    narration: r.narration,
    senderName: r.sender_name,
  };
}

function toRecord(r: RecordRow): ReconRecord {
  let label = TXN_LABELS[r.txn_type] ?? r.txn_type.replace(/_/g, " ").toLowerCase();
  if (r.category && isBankEntryCategory(r.category)) label = BANK_ENTRY_CATEGORIES[r.category].label;
  if (r.fr_id) label = `Fund request #${r.fr_id}`;
  return {
    journalId: r.journal_id,
    date: r.biz_date,
    // Bank ledger DR = money arrived = statement CR.
    direction: r.direction === "DR" ? "CR" : "DR",
    amount: paiseToRupees(BigInt(r.amount)),
    label,
    party: r.party_name ?? r.fr_name ?? null,
    utr: r.be_utr ?? r.fr_ref ?? null,
  };
}

function dayDiff(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function recordUtrNorm(r: RecordRow): string | null {
  return normaliseUtr(r.be_utr ?? r.fr_ref);
}

/** Human reason for a likely (amount) match — UTR miss is the main case. */
function possibleHint(line: LineRow, rec: RecordRow): string {
  const lineUtr = line.utr_norm;
  const recUtr = recordUtrNorm(rec);
  const days = dayDiff(rec.biz_date, line.txn_date);
  const dayBit = days === 0 ? "same day" : `dates ${days} day(s) apart`;
  if (!lineUtr && !recUtr) return `Same amount · UTR missing on both sides · ${dayBit}`;
  if (!lineUtr) return `Same amount · UTR missing on statement · ${dayBit}`;
  if (!recUtr) return `Same amount · UTR missing on AsanPay record · ${dayBit}`;
  if (lineUtr === recUtr) return `Same amount and UTR · ${dayBit} — confirm to lock`;
  return `Same amount · ${dayBit}`;
}

/**
 * Persist the only matches safe to make without a human: same bank, same direction, same
 * amount AND same normalised UTR, each side unclaimed, and exactly one candidate either way.
 */
export async function autoMatchStatement(params: {
  tenantId: string;
  bankAccountId: bigint;
}): Promise<{ linked: number }> {
  const bank = await bankLedger(params.tenantId, params.bankAccountId);
  const res = await db.execute<{ line_id: string; journal_id: string }>(sql`
    WITH ${linkedLinesCte(params.bankAccountId)}, ${recordsCte(bank.ledger_account_id)},
    free_lines AS (
      SELECT * FROM linked
      WHERE linked_journal_id IS NULL AND match_status = 'unmatched' AND utr_norm IS NOT NULL
    ),
    free_recs AS (
      SELECT rec.*, UPPER(REGEXP_REPLACE(COALESCE(rec.be_utr, rec.fr_ref), '[^A-Za-z0-9]', '', 'g')) AS utr_norm
      FROM rec
      WHERE COALESCE(rec.be_utr, rec.fr_ref) IS NOT NULL
        AND rec.journal_id NOT IN (SELECT linked_journal_id FROM linked WHERE linked_journal_id IS NOT NULL)
    ),
    pairs AS (
      SELECT fl.id AS line_id, fr.journal_id,
             COUNT(*) OVER (PARTITION BY fl.id) AS per_line,
             COUNT(*) OVER (PARTITION BY fr.journal_id) AS per_rec
      FROM free_lines fl
      JOIN free_recs fr
        ON fr.utr_norm = fl.utr_norm
       AND fr.amount = fl.amount
       AND ((fl.direction = 'CR' AND fr.direction = 'DR') OR (fl.direction = 'DR' AND fr.direction = 'CR'))
    )
    SELECT line_id::text, journal_id FROM pairs WHERE per_line = 1 AND per_rec = 1
  `);

  let linked = 0;
  for (const pair of res.rows) {
    const updated = await db.execute(sql`
      UPDATE bank_statement_lines
      SET match_status = 'matched', matched_to_type = 'journal', matched_to_id = ${pair.journal_id}
      WHERE id = ${pair.line_id} AND match_status = 'unmatched' AND matched_to_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement_lines x
          WHERE x.matched_to_type = 'journal' AND x.matched_to_id = ${pair.journal_id}
        )
    `);
    linked += updated.rowCount ?? 0;
  }
  return { linked };
}

export async function getReconciliation(params: {
  tenantId: string;
  bankAccountId: bigint;
  from: string;
  to: string;
}) {
  const { tenantId, bankAccountId, from, to } = params;
  const bank = await bankLedger(tenantId, bankAccountId);

  const lineRes = await db.execute<LineRow>(sql`
    WITH ${linkedLinesCte(bankAccountId)}, ${recordsCte(bank.ledger_account_id)}
    SELECT * FROM linked
    WHERE txn_date BETWEEN ${from} AND ${to}
       OR linked_journal_id IN (SELECT journal_id FROM rec WHERE biz_date BETWEEN ${from} AND ${to})
    ORDER BY txn_date, id
  `);
  const lines = lineRes.rows;

  const linkedIds = lines.map((l) => l.linked_journal_id).filter((v): v is string => !!v);
  const recRes = await db.execute<RecordRow>(sql`
    WITH ${recordsCte(bank.ledger_account_id)}
    SELECT * FROM rec
    WHERE biz_date BETWEEN ${from} AND ${to}
       OR journal_id IN (${linkedIds.length ? sql.join(linkedIds.map((id) => sql`${id}`), sql`, `) : sql`NULL`})
    ORDER BY biz_date, entry_id
  `);
  const records = recRes.rows;

  const recByJournal = new Map(records.map((r) => [r.journal_id, r]));
  const usedRecords = new Set<string>();
  const rows: ReconRow[] = [];
  const freeLines: LineRow[] = [];

  for (const l of lines) {
    const rec = l.linked_journal_id ? recByJournal.get(l.linked_journal_id) : undefined;
    if (rec) {
      usedRecords.add(rec.entry_id);
      rows.push({
        kind: l.match_status === "suspense" ? "suspense" : "matched",
        line: toLine(l),
        record: toRecord(rec),
        unlinkable: l.matched_to_type === "journal",
      });
    } else if (l.match_status === "ignored") {
      rows.push({ kind: "ignored", line: toLine(l), record: null, unlinkable: false });
    } else {
      freeLines.push(l);
    }
  }

  const freeRecords = () => records.filter((r) => !usedRecords.has(r.entry_id));
  const sameSide = (l: LineRow, r: RecordRow) =>
    (l.direction === "CR" && r.direction === "DR") || (l.direction === "DR" && r.direction === "CR");

  const stillFree: LineRow[] = [];
  for (const l of freeLines) {
    // Same UTR, different amount — almost always a typo on our side or a partial bank credit.
    const byUtr = l.utr_norm
      ? freeRecords().find((r) => sameSide(l, r) && normaliseUtr(r.be_utr ?? r.fr_ref) === l.utr_norm)
      : undefined;
    if (byUtr) {
      usedRecords.add(byUtr.entry_id);
      rows.push({ kind: "mismatch", line: toLine(l), record: toRecord(byUtr), unlinkable: false });
      continue;
    }
    stillFree.push(l);
  }

  // Likely match (TB11): same amount + side + within 3 days, and UTR missing on at least
  // one side (or same UTR that auto-match did not lock). Exactly one candidate — no guessing
  // when several records share the amount. Different non-empty UTRs are not "likely".
  for (const l of stillFree) {
    const candidates = freeRecords()
      .filter((r) => sameSide(l, r) && r.amount === l.amount && dayDiff(r.biz_date, l.txn_date) <= 3)
      .filter((r) => {
        const ru = recordUtrNorm(r);
        if (!l.utr_norm || !ru) return true;
        return l.utr_norm === ru;
      })
      .sort((a, b) => dayDiff(a.biz_date, l.txn_date) - dayDiff(b.biz_date, l.txn_date));
    if (candidates.length === 1) {
      const best = candidates[0]!;
      usedRecords.add(best.entry_id);
      rows.push({
        kind: "possible",
        line: toLine(l),
        record: toRecord(best),
        unlinkable: false,
        hint: possibleHint(l, best),
      });
    } else {
      rows.push({ kind: "only_bank", line: toLine(l), record: null, unlinkable: false });
    }
  }

  for (const r of freeRecords()) {
    rows.push({ kind: "only_ours", line: null, record: toRecord(r), unlinkable: false });
  }

  rows.sort((a, b) => {
    const da = a.line?.date ?? a.record?.date ?? "";
    const dbb = b.line?.date ?? b.record?.date ?? "";
    return da.localeCompare(dbb);
  });

  const periodLines = lines.filter((l) => l.txn_date >= from && l.txn_date <= to);
  const withBalance = periodLines.filter((l) => l.balance_after !== null);
  const lastLine = withBalance[withBalance.length - 1];
  const firstLine = withBalance[0];
  const statementClosing = lastLine ? BigInt(lastLine.balance_after as string) : null;
  const statementOpening = firstLine
    ? BigInt(firstLine.balance_after as string) -
      (firstLine.direction === "CR" ? BigInt(firstLine.amount) : -BigInt(firstLine.amount))
    : null;

  const balRes = await db.execute<{ opening: string; closing: string }>(sql`
    WITH ${recordsCte(bank.ledger_account_id)}
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'DR' THEN amount::bigint ELSE -amount::bigint END)
               FILTER (WHERE biz_date < ${from}), 0)::text AS opening,
      COALESCE(SUM(CASE WHEN direction = 'DR' THEN amount::bigint ELSE -amount::bigint END)
               FILTER (WHERE biz_date <= ${to}), 0)::text AS closing
    FROM rec
  `);
  const ourOpening = BigInt(balRes.rows[0]?.opening ?? "0");
  const ourClosing = BigInt(balRes.rows[0]?.closing ?? "0");

  const sum = (dir: "CR" | "DR") =>
    periodLines.filter((l) => l.direction === dir).reduce((acc, l) => acc + BigInt(l.amount), 0n);

  const counts: Record<Kind, number> = {
    matched: 0,
    suspense: 0,
    mismatch: 0,
    possible: 0,
    only_bank: 0,
    only_ours: 0,
    ignored: 0,
  };
  for (const row of rows) counts[row.kind] += 1;

  return {
    bank: { id: String(bankAccountId), bankName: bank.bank_name, last4: bank.last4 },
    period: { from, to },
    counts,
    statement: {
      lineCount: periodLines.length,
      credits: paiseToRupees(sum("CR")),
      debits: paiseToRupees(sum("DR")),
      opening: statementOpening !== null ? paiseToRupees(statementOpening) : null,
      closing: statementClosing !== null ? paiseToRupees(statementClosing) : null,
    },
    ours: { opening: paiseToRupees(ourOpening), closing: paiseToRupees(ourClosing) },
    closingDifference: statementClosing !== null ? paiseToRupees(statementClosing - ourClosing) : null,
    rows,
  };
}

/** Admin confirms a "possible match" — persist the link so it never shows as open again. */
export async function linkStatementLine(params: {
  tenantId: string;
  lineId: bigint;
  journalId: bigint;
  adminId: string;
}): Promise<void> {
  const res = await db.execute<{ reason: string | null }>(sql`
    WITH line AS (
      SELECT l.id, l.direction, l.amount, l.match_status, l.matched_to_id, ba.ledger_account_id
      FROM bank_statement_lines l
      JOIN bank_accounts ba ON ba.id = l.bank_account_id
      WHERE l.id = ${String(params.lineId)} AND l.tenant_id = ${params.tenantId}
    ),
    leg AS (
      SELECT le.direction, le.amount FROM ledger_entries le, line
      WHERE le.journal_id = ${String(params.journalId)} AND le.account_id = line.ledger_account_id
      LIMIT 1
    )
    SELECT
      CASE
        WHEN (SELECT COUNT(*) FROM line) = 0 THEN 'line_missing'
        WHEN (SELECT match_status FROM line) <> 'unmatched' OR (SELECT matched_to_id FROM line) IS NOT NULL THEN 'line_taken'
        WHEN (SELECT COUNT(*) FROM leg) = 0 THEN 'other_bank'
        WHEN (SELECT amount FROM leg) <> (SELECT amount FROM line) THEN 'amount'
        WHEN (SELECT direction FROM leg) = (SELECT direction FROM line) THEN 'direction'
        WHEN EXISTS (SELECT 1 FROM bank_statement_lines x
                     WHERE x.suspense_journal_id = ${String(params.journalId)}
                        OR (x.matched_to_type = 'journal' AND x.matched_to_id = ${String(params.journalId)})) THEN 'journal_taken'
        WHEN EXISTS (SELECT 1 FROM fund_requests fr WHERE fr.receive_journal_id = ${String(params.journalId)}
                       AND fr.matched_line_id IS NOT NULL) THEN 'journal_taken'
        ELSE NULL
      END AS reason
  `);

  const reason = res.rows[0]?.reason ?? null;
  const messages: Record<string, string> = {
    line_missing: "Statement line not found. Reload the reconciliation and try again.",
    line_taken: "This statement line is already matched. Reload the reconciliation.",
    other_bank: "That record is not on this bank account. Pick a record from the same bank.",
    amount: "Amounts differ between the statement line and our record. Fix the record before matching.",
    direction: "One side is a credit and the other a debit. Only same-direction entries can be matched.",
    journal_taken: "That record is already matched to another statement line.",
  };
  if (reason) throw new HttpError(422, messages[reason] ?? "Cannot match these entries", "RECON_LINK_INVALID");

  await db.execute(sql`
    UPDATE bank_statement_lines
    SET match_status = 'matched', matched_to_type = 'journal', matched_to_id = ${String(params.journalId)}
    WHERE id = ${String(params.lineId)} AND match_status = 'unmatched' AND matched_to_id IS NULL
  `);

  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_recon_link",
    entityType: "bank_statement_line",
    entityId: String(params.lineId),
    metadata: { journalId: String(params.journalId) },
  });
}

/** Undo a hand-confirmed link. Fund request / VAN / suspense links are owned by those flows. */
export async function unlinkStatementLine(params: {
  tenantId: string;
  lineId: bigint;
  adminId: string;
}): Promise<void> {
  const res = await db.execute(sql`
    UPDATE bank_statement_lines
    SET match_status = 'unmatched', matched_to_type = NULL, matched_to_id = NULL
    WHERE id = ${String(params.lineId)} AND tenant_id = ${params.tenantId} AND matched_to_type = 'journal'
  `);
  if (!res.rowCount) {
    throw new HttpError(
      422,
      "Only matches confirmed on this page can be undone. Fund request, VAN and suspense links stay.",
      "RECON_UNLINK_INVALID",
    );
  }
  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_recon_unlink",
    entityType: "bank_statement_line",
    entityId: String(params.lineId),
    metadata: {},
  });
}
