import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../../db/postgres";
import { accounts, bankAccounts, bankStatementLines } from "../../db/postgres/schema";
import { postJournal } from "../../core/ledger";
import { ensureTreasuryAccount } from "../wallet/ledgerAccounts";
import { encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import type { Paise } from "../../core/money";

const SUSPENSE = "TREASURY_SUSPENSE_UNIDENTIFIED";

/**
 * Banks write the same reference three different ways — "UTR 1234-5678", "utr1234 5678",
 * "12345678". Matching only ever compares the normalised form, never the raw value.
 */
export function normaliseUtr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** `TREASURY_BANK_ICICI_COLLECT` — stable, readable, and unique per tenant. */
export function bankAccountCode(bankName: string, purpose: string): string {
  const slug = bankName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `TREASURY_BANK_${slug}_${purpose.toUpperCase()}`;
}

/**
 * Register a company bank account. Creates its ledger account in the same transaction, so a
 * bank account can never exist without somewhere for its money to land.
 */
export async function registerBankAccount(params: {
  tenantId: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  purpose: "collection" | "payout" | "ops";
  supportsVan?: boolean;
}): Promise<{ bankAccountId: bigint; code: string }> {
  const { tenantId, bankName, accountNumber, ifsc, purpose } = params;

  const digits = accountNumber.replace(/\s/g, "");
  if (digits.length < 6) {
    throw new HttpError(422, "Account number looks invalid", "INVALID_ACCOUNT_NUMBER");
  }

  const code = bankAccountCode(bankName, purpose);

  return db.transaction(async (tx) => {
    await ensureTreasuryAccount(tx, {
      tenantId,
      code,
      name: `${bankName} (${purpose})`,
      type: "bank",
    });

    const [ledger] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)))
      .limit(1);

    if (!ledger) {
      throw new HttpError(500, `Ledger account ${code} was not created`, "ACCOUNT_CREATE_FAILED");
    }

    const [row] = await tx
      .insert(bankAccounts)
      .values({
        tenantId,
        ledgerAccountId: ledger.id,
        bankName,
        accountNumberEnc: encryptPII(digits),
        accountNumberLast4: digits.slice(-4),
        ifsc: ifsc.toUpperCase(),
        purpose,
        supportsVan: params.supportsVan ?? false,
      })
      .returning({ id: bankAccounts.id });

    if (!row) throw new HttpError(500, "Could not register bank account", "BANK_CREATE_FAILED");
    return { bankAccountId: row.id, code };
  });
}

export interface StatementLineInput {
  bankTxnId?: string | null;
  txnDate: string;
  valueDatetime?: Date | null;
  direction: "DR" | "CR";
  amount: Paise;
  utr?: string | null;
  narration?: string | null;
  senderName?: string | null;
  balanceAfter?: Paise | null;
}

/**
 * Import statement lines. Idempotent per (bank_account_id, bank_txn_id) and it never
 * overwrites an existing line — re-importing yesterday's statement is a no-op, which is what
 * makes a daily cron and a manual CSV upload safe to run over the same range.
 */
export async function importStatementLines(params: {
  tenantId: string;
  bankAccountId: bigint;
  lines: readonly StatementLineInput[];
}): Promise<{ imported: number; skipped: number }> {
  const { tenantId, bankAccountId, lines } = params;
  if (lines.length === 0) return { imported: 0, skipped: 0 };

  const values = lines.map((line) => ({
    tenantId,
    bankAccountId,
    // Where the feed gives no id, derive a stable one. Two genuinely identical transactions on
    // the same day would collapse into one row — rare, and far safer than double-crediting.
    bankTxnId: line.bankTxnId?.trim() || synthesiseTxnId(line),
    txnDate: line.txnDate,
    valueDatetime: line.valueDatetime ?? null,
    direction: line.direction,
    amount: line.amount,
    utr: line.utr ?? null,
    utrNorm: normaliseUtr(line.utr),
    narration: line.narration ?? null,
    senderName: line.senderName ?? null,
    balanceAfter: line.balanceAfter ?? null,
  }));

  const inserted = await db
    .insert(bankStatementLines)
    .values(values)
    .onConflictDoNothing({
      target: [bankStatementLines.bankAccountId, bankStatementLines.bankTxnId],
    })
    .returning({ id: bankStatementLines.id });

  return { imported: inserted.length, skipped: values.length - inserted.length };
}

function synthesiseTxnId(line: StatementLineInput): string {
  const basis = [
    line.txnDate,
    line.amount.toString(),
    normaliseUtr(line.utr) ?? "",
    (line.narration ?? "").trim().toLowerCase(),
  ].join("|");
  return `SYN_${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

/**
 * Park credit lines nobody has claimed into suspense, so Treasury reflects reality instead of
 * quietly under-reporting what the bank actually holds.
 *
 * Deliberately does NOT guess an owner. Money whose owner is unknown goes to suspense and
 * stays in the exceptions queue until a human resolves it — a wrong guess credits the wrong
 * retailer, and that is far more expensive than a delay.
 */
export async function parkUnmatchedCreditsInSuspense(params: {
  tenantId: string;
  olderThanHours?: number;
}): Promise<{ parked: number }> {
  const cutoff = new Date(Date.now() - (params.olderThanHours ?? 48) * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: bankStatementLines.id,
      amount: bankStatementLines.amount,
      bankAccountId: bankStatementLines.bankAccountId,
      bankCode: sql<string>`(SELECT a.code FROM accounts a
        JOIN bank_accounts ba ON ba.ledger_account_id = a.id
        WHERE ba.id = ${bankStatementLines.bankAccountId})`,
    })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, params.tenantId),
        eq(bankStatementLines.direction, "CR"),
        eq(bankStatementLines.matchStatus, "unmatched"),
        lt(bankStatementLines.importedAt, cutoff),
      ),
    )
    .limit(200);

  let parked = 0;
  for (const line of stale) {
    await db.transaction(async (tx) => {
      const journal = await postJournal(tx, {
        tenantId: params.tenantId,
        txnType: "UNIDENTIFIED_CREDIT",
        idemKey: `STMT:${line.id}:SUSPENSE`,
        // System-generated: no operator caused this, the clock did.
        performedBy: null,
        reason: "Credit line unmatched past the review window",
        referenceId: String(line.id),
        entries: [
          { code: line.bankCode, dir: "DR", amount: line.amount },
          { code: SUSPENSE, dir: "CR", amount: line.amount },
        ],
      });

      await tx
        .update(bankStatementLines)
        .set({ matchStatus: "suspense", suspenseJournalId: journal.id })
        .where(eq(bankStatementLines.id, line.id));
    });
    parked += 1;
  }

  return { parked };
}

/** Count of unclaimed credit lines — belongs on the admin home screen, not buried in a report. */
export async function unmatchedCreditCount(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, tenantId),
        eq(bankStatementLines.direction, "CR"),
        eq(bankStatementLines.matchStatus, "unmatched"),
      ),
    );

  return Number(row?.n ?? 0);
}
