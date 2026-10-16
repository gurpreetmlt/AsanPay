import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { bankDailyBalanceLocks } from "../../db/postgres/schema";
import { HttpError } from "../../utils/httpError";
import { paiseToRupees, type Paise } from "../../core/money";

export type DriftStatus = "ok" | "drift" | "missing_statement" | "locked";

export interface BankDayBalance {
  bankAccountId: string;
  bankName: string;
  last4: string;
  uploaded: boolean;
  locked: boolean;
  lockedAt: string | null;
  statementOpening: string | null;
  statementClosing: string | null;
  booksOpening: string;
  booksClosing: string;
  /** Live or locked: statement closing − books closing. */
  drift: string | null;
  status: DriftStatus;
}

function assertDate(raw: string): string {
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(422, "date must be YYYY-MM-DD", "INVALID_DATE");
  }
  return date;
}

function rupees(paise: bigint | null | undefined): string | null {
  if (paise === null || paise === undefined) return null;
  return paiseToRupees(paise as Paise);
}

/** Same ledger-side calc as reconciliation (books opening before date / closing through date). */
function booksCte(ledgerAccountId: string) {
  return sql`
    rec AS (
      SELECT le.direction, le.amount::bigint AS amount,
             COALESCE(be.txn_date, (fr.deposit_datetime AT TIME ZONE 'Asia/Kolkata')::date,
                      (j.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS biz_date
      FROM ledger_entries le
      JOIN journals j ON j.id = le.journal_id
      LEFT JOIN bank_entries be ON be.journal_id = j.id
      LEFT JOIN fund_requests fr ON fr.receive_journal_id = j.id
      WHERE le.account_id = ${ledgerAccountId}
        AND (fr.id IS NULL OR fr.status::text <> 'voided')
        AND j.idem_key NOT LIKE 'FR:%:VOID:%'
        AND (be.id IS NULL OR be.reversed_at IS NULL)
        AND j.idem_key NOT LIKE 'BE:%:REV'
    )`;
}

async function computeLiveBalances(params: {
  tenantId: string;
  bankAccountId: string;
  ledgerAccountId: string;
  date: string;
}): Promise<{
  statementOpening: bigint | null;
  statementClosing: bigint | null;
  booksOpening: bigint;
  booksClosing: bigint;
  uploaded: boolean;
}> {
  const stmt = await db.execute<{
    opening: string | null;
    closing: string | null;
    line_count: string;
  }>(sql`
    WITH day_lines AS (
      SELECT id, direction, amount::bigint AS amount, balance_after::bigint AS balance_after
      FROM bank_statement_lines
      WHERE bank_account_id = ${params.bankAccountId}::bigint
        AND tenant_id = ${params.tenantId}
        AND txn_date = ${params.date}::date
        AND balance_after IS NOT NULL
    ),
    first_line AS (SELECT * FROM day_lines ORDER BY id ASC LIMIT 1),
    last_line AS (SELECT * FROM day_lines ORDER BY id DESC LIMIT 1)
    SELECT
      (SELECT CASE
         WHEN balance_after IS NULL THEN NULL
         WHEN direction = 'CR' THEN balance_after - amount
         ELSE balance_after + amount
       END FROM first_line)::text AS opening,
      (SELECT balance_after::text FROM last_line) AS closing,
      (SELECT COUNT(*)::text FROM bank_statement_lines
        WHERE bank_account_id = ${params.bankAccountId}::bigint
          AND tenant_id = ${params.tenantId}
          AND txn_date = ${params.date}::date) AS line_count
  `);

  const books = await db.execute<{ opening: string; closing: string }>(sql`
    WITH ${booksCte(params.ledgerAccountId)}
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'DR' THEN amount ELSE -amount END)
               FILTER (WHERE biz_date < ${params.date}::date), 0)::text AS opening,
      COALESCE(SUM(CASE WHEN direction = 'DR' THEN amount ELSE -amount END)
               FILTER (WHERE biz_date <= ${params.date}::date), 0)::text AS closing
    FROM rec
  `);

  const openingRaw = stmt.rows[0]?.opening;
  const closingRaw = stmt.rows[0]?.closing;
  return {
    statementOpening: openingRaw != null ? BigInt(openingRaw) : null,
    statementClosing: closingRaw != null ? BigInt(closingRaw) : null,
    booksOpening: BigInt(books.rows[0]?.opening ?? "0"),
    booksClosing: BigInt(books.rows[0]?.closing ?? "0"),
    uploaded: Number(stmt.rows[0]?.line_count ?? "0") > 0,
  };
}

/**
 * Live mid-day drift + lock status for every active bank on a business date.
 * Drift = statement closing − books closing (null when no statement closing yet).
 */
export async function listBankDayBalances(params: {
  tenantId: string;
  date: string;
}): Promise<BankDayBalance[]> {
  const date = assertDate(params.date);

  const banks = await db.execute<{
    id: string;
    bank_name: string;
    last4: string;
    ledger_account_id: string;
  }>(sql`
    SELECT ba.id::text AS id, ba.bank_name, ba.account_number_last4 AS last4,
           ba.ledger_account_id::text AS ledger_account_id
    FROM bank_accounts ba
    WHERE ba.tenant_id = ${params.tenantId} AND ba.deleted_at IS NULL AND ba.is_active
    ORDER BY ba.bank_name, ba.account_number_last4
  `);

  const locks = await db.execute<{
    bank_account_id: string;
    locked_at: string;
    statement_opening: string | null;
    statement_closing: string | null;
    books_opening: string;
    books_closing: string;
    closing_diff: string | null;
  }>(sql`
    SELECT bank_account_id::text, locked_at::text,
           statement_opening::text, statement_closing::text,
           books_opening::text, books_closing::text, closing_diff::text
    FROM bank_daily_balance_locks
    WHERE tenant_id = ${params.tenantId} AND business_date = ${date}::date
  `);
  const lockBy = new Map(locks.rows.map((r) => [r.bank_account_id, r]));

  const out: BankDayBalance[] = [];
  for (const b of banks.rows) {
    const lock = lockBy.get(b.id);
    if (lock) {
      const drift = lock.closing_diff != null ? paiseToRupees(BigInt(lock.closing_diff) as Paise) : null;
      out.push({
        bankAccountId: b.id,
        bankName: b.bank_name,
        last4: b.last4,
        uploaded: lock.statement_closing != null || lock.statement_opening != null,
        locked: true,
        lockedAt: lock.locked_at,
        statementOpening: rupees(lock.statement_opening != null ? BigInt(lock.statement_opening) : null),
        statementClosing: rupees(lock.statement_closing != null ? BigInt(lock.statement_closing) : null),
        booksOpening: paiseToRupees(BigInt(lock.books_opening) as Paise),
        booksClosing: paiseToRupees(BigInt(lock.books_closing) as Paise),
        drift,
        status: "locked",
      });
      continue;
    }

    const live = await computeLiveBalances({
      tenantId: params.tenantId,
      bankAccountId: b.id,
      ledgerAccountId: b.ledger_account_id,
      date,
    });
    const driftPaise =
      live.statementClosing !== null ? live.statementClosing - live.booksClosing : null;
    let status: DriftStatus = "ok";
    if (!live.uploaded || live.statementClosing === null) status = "missing_statement";
    else if (driftPaise !== null && driftPaise !== 0n) status = "drift";

    out.push({
      bankAccountId: b.id,
      bankName: b.bank_name,
      last4: b.last4,
      uploaded: live.uploaded,
      locked: false,
      lockedAt: null,
      statementOpening: rupees(live.statementOpening),
      statementClosing: rupees(live.statementClosing),
      booksOpening: paiseToRupees(live.booksOpening as Paise),
      booksClosing: paiseToRupees(live.booksClosing as Paise),
      drift: driftPaise !== null ? paiseToRupees(driftPaise as Paise) : null,
      status,
    });
  }
  return out;
}

/** Snapshot + persist opening/closing for every active bank (called on day close). */
export async function lockBalancesForDay(params: {
  tenantId: string;
  date: string;
  adminId: string;
}): Promise<number> {
  const date = assertDate(params.date);
  const banks = await db.execute<{
    id: string;
    ledger_account_id: string;
  }>(sql`
    SELECT ba.id::text AS id, ba.ledger_account_id::text AS ledger_account_id
    FROM bank_accounts ba
    WHERE ba.tenant_id = ${params.tenantId} AND ba.deleted_at IS NULL AND ba.is_active
  `);

  let locked = 0;
  for (const b of banks.rows) {
    const live = await computeLiveBalances({
      tenantId: params.tenantId,
      bankAccountId: b.id,
      ledgerAccountId: b.ledger_account_id,
      date,
    });
    const closingDiff =
      live.statementClosing !== null ? live.statementClosing - live.booksClosing : null;
    await db
      .insert(bankDailyBalanceLocks)
      .values({
        tenantId: params.tenantId,
        bankAccountId: BigInt(b.id),
        businessDate: date,
        statementOpening: live.statementOpening,
        statementClosing: live.statementClosing,
        booksOpening: live.booksOpening,
        booksClosing: live.booksClosing,
        closingDiff,
        lockedBy: params.adminId,
      })
      .onConflictDoNothing();
    locked += 1;
  }
  return locked;
}

export async function unlockBalancesForDay(params: {
  tenantId: string;
  date: string;
}): Promise<number> {
  const date = assertDate(params.date);
  const deleted = await db
    .delete(bankDailyBalanceLocks)
    .where(
      and(
        eq(bankDailyBalanceLocks.tenantId, params.tenantId),
        eq(bankDailyBalanceLocks.businessDate, date),
      ),
    )
    .returning({ id: bankDailyBalanceLocks.id });
  return deleted.length;
}

/** Block mutations that would change statement / match state on a locked bank-day. */
export async function assertBankDatesNotLocked(params: {
  tenantId: string;
  bankAccountId: bigint | string;
  dates: string[];
}): Promise<void> {
  const dates = [...new Set(params.dates.map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (!dates.length) return;
  const bankId = String(params.bankAccountId);
  const res = await db.execute<{ business_date: string }>(sql`
    SELECT business_date::text
    FROM bank_daily_balance_locks
    WHERE tenant_id = ${params.tenantId}
      AND bank_account_id = ${bankId}::bigint
      AND business_date IN (${sql.join(
        dates.map((d) => sql`${d}::date`),
        sql`, `,
      )})
    LIMIT 1
  `);
  const hit = res.rows[0]?.business_date;
  if (hit) {
    throw new HttpError(
      422,
      `Balances for this bank on ${hit} are locked. Reopen that business day on Daily close before changing statements or matches.`,
      "DAY_BALANCE_LOCKED",
    );
  }
}

export async function assertStatementLinesNotLocked(params: {
  tenantId: string;
  lineIds: Array<bigint | string>;
}): Promise<void> {
  if (!params.lineIds.length) return;
  const ids = sql.join(
    params.lineIds.map((id) => sql`${String(id)}::bigint`),
    sql`, `,
  );
  const res = await db.execute<{ business_date: string; bank_name: string; last4: string }>(sql`
    SELECT l.txn_date::text AS business_date, ba.bank_name, ba.account_number_last4 AS last4
    FROM bank_statement_lines l
    JOIN bank_accounts ba ON ba.id = l.bank_account_id
    JOIN bank_daily_balance_locks lk
      ON lk.bank_account_id = l.bank_account_id
     AND lk.business_date = l.txn_date
     AND lk.tenant_id = l.tenant_id
    WHERE l.tenant_id = ${params.tenantId} AND l.id IN (${ids})
    LIMIT 1
  `);
  const hit = res.rows[0];
  if (hit) {
    throw new HttpError(
      422,
      `Balances for ${hit.bank_name} ••${hit.last4} on ${hit.business_date} are locked. Reopen that business day on Daily close before changing statements or matches.`,
      "DAY_BALANCE_LOCKED",
    );
  }
}
