import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or, sql, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { accounts, bankAccounts, bankStatementLines, virtualAccounts } from "../../db/postgres/schema";
import { postJournal } from "../../core/ledger";
import { ensureTreasuryAccount, ensureHierarchyAccount } from "../wallet/ledgerAccounts";
import { encryptPII } from "../../utils/aes";
import { HttpError } from "../../utils/httpError";
import { env } from "../../config/env";
import type { Paise } from "../../core/money";

const SUSPENSE = "TREASURY_SUSPENSE_UNIDENTIFIED";
const COMPANY = "COMPANY_001";

const ownerAccounts = alias(accounts, "van_owner_accounts");
const bankLedgerAccounts = alias(accounts, "van_bank_ledger_accounts");

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

    // One ledger account ↔ one bank_accounts row (unique). Soft-delete keeps the row, so
    // re-registering the same bankName+purpose must restore instead of inserting again.
    const [existing] = await tx
      .select({
        id: bankAccounts.id,
        deletedAt: bankAccounts.deletedAt,
        isActive: bankAccounts.isActive,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.tenantId, tenantId), eq(bankAccounts.ledgerAccountId, ledger.id)))
      .limit(1);

    if (existing && !existing.deletedAt) {
      throw new HttpError(
        422,
        `A ${purpose} account for ${bankName} is already registered. Edit or disable the existing bank instead of adding a duplicate.`,
        "BANK_ALREADY_EXISTS",
      );
    }

    if (existing?.deletedAt) {
      await tx
        .update(bankAccounts)
        .set({
          bankName,
          accountNumberEnc: encryptPII(digits),
          accountNumberLast4: digits.slice(-4),
          ifsc: ifsc.toUpperCase(),
          purpose,
          supportsVan: params.supportsVan ?? false,
          isActive: true,
          deletedAt: null,
        })
        .where(eq(bankAccounts.id, existing.id));
      return { bankAccountId: existing.id, code };
    }

    try {
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
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/bank_accounts_ledger_uidx|duplicate key/i.test(msg)) {
        throw new HttpError(
          422,
          `A ${purpose} account for ${bankName} is already registered. Edit the existing bank instead.`,
          "BANK_ALREADY_EXISTS",
        );
      }
      throw err;
    }
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

/** Safe bank list for dropdowns — never returns the encrypted account number. */
export async function listBankAccounts(
  tenantId: string,
  opts?: { purpose?: "collection" | "payout" | "ops"; activeOnly?: boolean },
): Promise<
  Array<{
    id: string;
    bankName: string;
    accountNumberLast4: string;
    ifsc: string;
    purpose: "collection" | "payout" | "ops";
    supportsVan: boolean;
    isActive: boolean;
  }>
> {
  const conditions = [eq(bankAccounts.tenantId, tenantId), isNull(bankAccounts.deletedAt)];
  if (opts?.purpose) conditions.push(eq(bankAccounts.purpose, opts.purpose));
  if (opts?.activeOnly !== false) conditions.push(eq(bankAccounts.isActive, true));

  const rows = await db
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountNumberLast4: bankAccounts.accountNumberLast4,
      ifsc: bankAccounts.ifsc,
      purpose: bankAccounts.purpose,
      supportsVan: bankAccounts.supportsVan,
      isActive: bankAccounts.isActive,
    })
    .from(bankAccounts)
    .where(and(...conditions));

  return rows.map((r) => ({
    id: String(r.id),
    bankName: r.bankName,
    accountNumberLast4: r.accountNumberLast4,
    ifsc: r.ifsc,
    purpose: r.purpose,
    supportsVan: r.supportsVan,
    isActive: r.isActive,
  }));
}

export async function updateBankAccount(params: {
  tenantId: string;
  bankAccountId: bigint;
  bankName?: string;
  ifsc?: string;
  purpose?: "collection" | "payout" | "ops";
  supportsVan?: boolean;
  accountNumber?: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.tenantId, params.tenantId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Bank account not found", "NOT_FOUND");

  const patch: Partial<typeof bankAccounts.$inferInsert> = {};
  if (params.bankName !== undefined) patch.bankName = params.bankName.trim();
  if (params.ifsc !== undefined) patch.ifsc = params.ifsc.trim().toUpperCase();
  if (params.purpose !== undefined) patch.purpose = params.purpose;
  if (params.supportsVan !== undefined) patch.supportsVan = params.supportsVan;
  if (params.accountNumber !== undefined) {
    const digits = params.accountNumber.replace(/\s/g, "");
    if (digits.length < 6) {
      throw new HttpError(422, "Account number looks invalid", "INVALID_ACCOUNT_NUMBER");
    }
    patch.accountNumberEnc = encryptPII(digits);
    patch.accountNumberLast4 = digits.slice(-4);
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, "No fields to update", "EMPTY_PATCH");
  }

  await db
    .update(bankAccounts)
    .set(patch)
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.tenantId, params.tenantId),
        isNull(bankAccounts.deletedAt),
      ),
    );

  return { id: String(params.bankAccountId) };
}

export async function setBankAccountActive(params: {
  tenantId: string;
  bankAccountId: bigint;
  isActive: boolean;
}): Promise<{ id: string; isActive: boolean }> {
  const [row] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.tenantId, params.tenantId),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Bank account not found", "NOT_FOUND");

  await db
    .update(bankAccounts)
    .set({ isActive: params.isActive })
    .where(
      and(
        eq(bankAccounts.id, params.bankAccountId),
        eq(bankAccounts.tenantId, params.tenantId),
        isNull(bankAccounts.deletedAt),
      ),
    );

  return { id: String(params.bankAccountId), isActive: params.isActive };
}

export async function deleteBankAccount(params: {
  tenantId: string;
  bankAccountId: bigint;
}): Promise<void> {
  // UI gate: Admin Developer → Safety → Enable row delete (browser-local).
  // Soft-delete only — hard DELETE fails when VANs / statements / fund requests reference the row.
  const [row] = await db
    .select({ id: bankAccounts.id, deletedAt: bankAccounts.deletedAt })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, params.bankAccountId), eq(bankAccounts.tenantId, params.tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Bank account not found", "NOT_FOUND");
  if (row.deletedAt) throw new HttpError(404, "Bank account not found", "NOT_FOUND");

  await db
    .update(bankAccounts)
    .set({ isActive: false, deletedAt: new Date() })
    .where(and(eq(bankAccounts.id, params.bankAccountId), eq(bankAccounts.tenantId, params.tenantId)));
}

/** Canonical string signed by the bank: bankTxnId|vanNumber|vpa|amount */
export function vanWebhookCanonical(input: {
  bankTxnId: string;
  vanNumber?: string | null;
  vpa?: string | null;
  amount: string;
}): string {
  return [input.bankTxnId, input.vanNumber ?? "", input.vpa ?? "", input.amount].join("|");
}

/**
 * Verify X-Van-Signature (hex HMAC-SHA256, optional `sha256=` prefix) against VAN_WEBHOOK_SECRET.
 * Fail-closed when the secret is unset — never accept unsigned credits in production by accident.
 */
export function assertVanWebhookSignature(canonical: string, headerValue: string | undefined): void {
  const secret = env.VAN_WEBHOOK_SECRET;
  if (!secret) {
    throw new HttpError(
      503,
      "VAN webhook is not configured. Set VAN_WEBHOOK_SECRET on the server.",
      "WEBHOOK_NOT_CONFIGURED",
    );
  }
  if (!headerValue?.trim()) {
    throw new HttpError(401, "Missing X-Van-Signature header", "SIGNATURE_MISSING");
  }
  const providedHex = headerValue.trim().toLowerCase().startsWith("sha256=")
    ? headerValue.trim().slice(7)
    : headerValue.trim();
  const expectedHex = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  try {
    const a = Buffer.from(providedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpError(401, "Invalid X-Van-Signature", "SIGNATURE_INVALID");
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "Invalid X-Van-Signature", "SIGNATURE_INVALID");
  }
}

export type VanWebhookResult = {
  outcome: "credited" | "suspense";
  replayed: boolean;
  bankTxnId: string;
  amount: string;
  receiveJournalId?: string;
  creditJournalId?: string;
  suspenseJournalId?: string;
  ownerUserId?: string | null;
  vanId?: string;
};

/**
 * Path A top-up: bank webhook on a virtual account.
 *   Matched VAN  → DEPOSIT_RECEIVE + DEPOSIT_CREDIT (idem keys from bank txn id)
 *   Unknown VAN  → UNIDENTIFIED_CREDIT to suspense (never guess a wallet)
 */
export async function processVanWebhookCredit(params: {
  tenantId: string;
  bankTxnId: string;
  amount: Paise;
  amountRupees: string;
  vanNumber?: string | null;
  vpa?: string | null;
  utr?: string | null;
  txnDate?: string;
  narration?: string | null;
  senderName?: string | null;
  collectionAccountLast4?: string | null;
}): Promise<VanWebhookResult> {
  const { tenantId, bankTxnId, amount } = params;
  if (amount <= 0n) throw new HttpError(422, "Amount must be greater than zero", "INVALID_AMOUNT");

  const van = await findActiveVan(tenantId, params.vanNumber, params.vpa);

  if (van) {
    return creditMatchedVan({
      tenantId,
      bankTxnId,
      amount,
      amountRupees: params.amountRupees,
      van,
      utr: params.utr,
      txnDate: params.txnDate,
      narration: params.narration,
      senderName: params.senderName,
    });
  }

  return parkUnmatchedVanCredit({
    tenantId,
    bankTxnId,
    amount,
    amountRupees: params.amountRupees,
    collectionAccountLast4: params.collectionAccountLast4,
    utr: params.utr,
    txnDate: params.txnDate,
    narration: params.narration,
    senderName: params.senderName,
  });
}

async function findActiveVan(
  tenantId: string,
  vanNumber: string | null | undefined,
  vpa: string | null | undefined,
): Promise<{
  id: bigint;
  bankAccountId: bigint;
  ownerAccountId: bigint;
  ownerCode: string;
  ownerUserId: string | null;
  blockTopup: boolean;
  bankCode: string;
} | null> {
  const vanCond =
    vanNumber && vpa
      ? or(eq(virtualAccounts.vanNumber, vanNumber), eq(virtualAccounts.vpa, vpa))
      : vanNumber
        ? eq(virtualAccounts.vanNumber, vanNumber)
        : vpa
          ? eq(virtualAccounts.vpa, vpa)
          : null;
  if (!vanCond) return null;

  const [row] = await db
    .select({
      id: virtualAccounts.id,
      bankAccountId: virtualAccounts.bankAccountId,
      ownerAccountId: virtualAccounts.ownerAccountId,
      ownerCode: ownerAccounts.code,
      ownerUserId: ownerAccounts.userId,
      blockTopup: ownerAccounts.blockTopup,
      bankCode: bankLedgerAccounts.code,
    })
    .from(virtualAccounts)
    .innerJoin(ownerAccounts, eq(ownerAccounts.id, virtualAccounts.ownerAccountId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, virtualAccounts.bankAccountId))
    .innerJoin(bankLedgerAccounts, eq(bankLedgerAccounts.id, bankAccounts.ledgerAccountId))
    .where(
      and(
        eq(virtualAccounts.tenantId, tenantId),
        eq(virtualAccounts.status, "active"),
        vanCond,
      ),
    )
    .limit(1);

  return row ?? null;
}

async function creditMatchedVan(params: {
  tenantId: string;
  bankTxnId: string;
  amount: Paise;
  amountRupees: string;
  van: {
    id: bigint;
    bankAccountId: bigint;
    ownerAccountId: bigint;
    ownerCode: string;
    ownerUserId: string | null;
    blockTopup: boolean;
    bankCode: string;
  };
  utr?: string | null;
  txnDate?: string;
  narration?: string | null;
  senderName?: string | null;
}): Promise<VanWebhookResult> {
  const { tenantId, bankTxnId, amount, van } = params;

  if (van.blockTopup) {
    throw new HttpError(403, "Fund top-ups are blocked for this account", "TOPUP_BLOCKED");
  }
  if (!van.bankCode) {
    throw new HttpError(500, "Bank account has no ledger account", "BANK_NOT_LINKED");
  }

  const txnDate = params.txnDate ?? new Date().toISOString().slice(0, 10);
  const receiveKey = `VAN:${van.bankAccountId}:${bankTxnId}:RECEIVE`;
  const creditKey = `VAN:${van.bankAccountId}:${bankTxnId}:CREDIT`;

  return db.transaction(async (tx) => {
    const receive = await postJournal(tx, {
      tenantId,
      txnType: "DEPOSIT_RECEIVE",
      idemKey: receiveKey,
      performedBy: null,
      referenceId: bankTxnId,
      reason: "VAN deposit received",
      entries: [
        { code: van.bankCode, dir: "DR", amount },
        { code: COMPANY, dir: "CR", amount },
      ],
    });

    const credit = await postJournal(tx, {
      tenantId,
      txnType: "DEPOSIT_CREDIT",
      idemKey: creditKey,
      performedBy: null,
      referenceId: bankTxnId,
      reason: "VAN deposit credited to balance",
      entries: [
        { code: COMPANY, dir: "DR", amount },
        { code: van.ownerCode, dir: "CR", amount },
      ],
    });

    await tx
      .insert(bankStatementLines)
      .values({
        tenantId,
        bankAccountId: van.bankAccountId,
        bankTxnId,
        txnDate,
        direction: "CR",
        amount,
        utr: params.utr ?? null,
        utrNorm: normaliseUtr(params.utr),
        narration: params.narration ?? null,
        senderName: params.senderName ?? null,
        matchStatus: "matched",
        matchedToType: "van",
        matchedToId: van.id,
      })
      .onConflictDoNothing({
        target: [bankStatementLines.bankAccountId, bankStatementLines.bankTxnId],
      });

    return {
      outcome: "credited" as const,
      replayed: receive.replayed || credit.replayed,
      bankTxnId,
      amount: params.amountRupees,
      receiveJournalId: String(receive.id),
      creditJournalId: String(credit.id),
      ownerUserId: van.ownerUserId,
      vanId: String(van.id),
    };
  });
}

async function parkUnmatchedVanCredit(params: {
  tenantId: string;
  bankTxnId: string;
  amount: Paise;
  amountRupees: string;
  collectionAccountLast4?: string | null;
  utr?: string | null;
  txnDate?: string;
  narration?: string | null;
  senderName?: string | null;
}): Promise<VanWebhookResult> {
  const bank = await resolveBankForUnmatched(params.tenantId, params.collectionAccountLast4);
  const txnDate = params.txnDate ?? new Date().toISOString().slice(0, 10);
  const suspenseKey = `VAN:${bank.bankAccountId}:${params.bankTxnId}:SUSPENSE`;

  return db.transaction(async (tx) => {
    const journal = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "UNIDENTIFIED_CREDIT",
      idemKey: suspenseKey,
      performedBy: null,
      referenceId: params.bankTxnId,
      reason: "VAN webhook credit unmatched — parked in suspense",
      entries: [
        { code: bank.bankCode, dir: "DR", amount: params.amount },
        { code: SUSPENSE, dir: "CR", amount: params.amount },
      ],
    });

    await tx
      .insert(bankStatementLines)
      .values({
        tenantId: params.tenantId,
        bankAccountId: bank.bankAccountId,
        bankTxnId: params.bankTxnId,
        txnDate,
        direction: "CR",
        amount: params.amount,
        utr: params.utr ?? null,
        utrNorm: normaliseUtr(params.utr),
        narration: params.narration ?? null,
        senderName: params.senderName ?? null,
        matchStatus: "suspense",
        suspenseJournalId: journal.id,
      })
      .onConflictDoNothing({
        target: [bankStatementLines.bankAccountId, bankStatementLines.bankTxnId],
      });

    return {
      outcome: "suspense" as const,
      replayed: journal.replayed,
      bankTxnId: params.bankTxnId,
      amount: params.amountRupees,
      suspenseJournalId: String(journal.id),
    };
  });
}

/** Prefer last4 match; otherwise the single active VAN-capable collection bank. Never guess a wallet. */
async function resolveBankForUnmatched(
  tenantId: string,
  last4: string | null | undefined,
): Promise<{ bankAccountId: bigint; bankCode: string }> {
  if (last4) {
    const [row] = await db
      .select({
        bankAccountId: bankAccounts.id,
        bankCode: accounts.code,
      })
      .from(bankAccounts)
      .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
      .where(
        and(
          eq(bankAccounts.tenantId, tenantId),
          eq(bankAccounts.accountNumberLast4, last4),
          eq(bankAccounts.purpose, "collection"),
          eq(bankAccounts.isActive, true),
          isNull(bankAccounts.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new HttpError(
        422,
        `No active collection bank found for account ending in ${last4}`,
        "BANK_NOT_FOUND",
      );
    }
    return row;
  }

  const rows = await db
    .select({
      bankAccountId: bankAccounts.id,
      bankCode: accounts.code,
    })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .where(
      and(
        eq(bankAccounts.tenantId, tenantId),
        eq(bankAccounts.purpose, "collection"),
        eq(bankAccounts.supportsVan, true),
        eq(bankAccounts.isActive, true),
        isNull(bankAccounts.deletedAt),
      ),
    )
    .limit(2);

  if (rows.length === 1 && rows[0]) return rows[0];

  throw new HttpError(
    422,
    "Unknown VAN — provide collectionAccountLast4 so the credit can be parked in suspense",
    "COLLECTION_ACCOUNT_REQUIRED",
  );
}

/**
 * Assign a VAN / VPA to an agent's hierarchy wallet so webhook credits land automatically.
 */
export async function assignVirtualAccount(params: {
  tenantId: string;
  userId: string;
  bankAccountId: bigint;
  vanNumber?: string | null;
  vpa?: string | null;
}): Promise<{ vanId: bigint; vanNumber: string | null; vpa: string | null }> {
  const vanNumber = params.vanNumber?.trim() || null;
  const vpa = params.vpa?.trim()?.toLowerCase() || null;
  if (!vanNumber && !vpa) {
    throw new HttpError(422, "Provide vanNumber or vpa", "VAN_IDENTIFIER_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const [bank] = await tx
      .select({
        id: bankAccounts.id,
        supportsVan: bankAccounts.supportsVan,
        isActive: bankAccounts.isActive,
        purpose: bankAccounts.purpose,
        deletedAt: bankAccounts.deletedAt,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, params.bankAccountId), eq(bankAccounts.tenantId, params.tenantId)))
      .for("update");

    if (!bank || bank.deletedAt) throw new HttpError(404, "Bank account not found", "BANK_NOT_FOUND");
    if (!bank.isActive) {
      throw new HttpError(422, "Bank account is inactive", "BANK_INACTIVE");
    }
    if (!bank.supportsVan) {
      throw new HttpError(
        422,
        "This bank account does not support virtual accounts — enable supportsVan first",
        "VAN_NOT_SUPPORTED",
      );
    }
    if (bank.purpose !== "collection") {
      throw new HttpError(422, "VANs can only be assigned on collection bank accounts", "WRONG_PURPOSE");
    }

    const ownerCode = await ensureHierarchyAccount(tx, params.tenantId, params.userId);
    const [owner] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.code, ownerCode)))
      .limit(1);
    if (!owner) throw new HttpError(500, "Owner ledger account missing", "ACCOUNT_NOT_FOUND");

    if (vanNumber) {
      const [dup] = await tx
        .select({ id: virtualAccounts.id })
        .from(virtualAccounts)
        .where(eq(virtualAccounts.vanNumber, vanNumber))
        .limit(1);
      if (dup) {
        throw new HttpError(422, "This VAN number is already assigned", "VAN_TAKEN");
      }
    }
    if (vpa) {
      const [dup] = await tx
        .select({ id: virtualAccounts.id })
        .from(virtualAccounts)
        .where(eq(virtualAccounts.vpa, vpa))
        .limit(1);
      if (dup) {
        throw new HttpError(422, "This VPA is already assigned", "VPA_TAKEN");
      }
    }

    const [row] = await tx
      .insert(virtualAccounts)
      .values({
        tenantId: params.tenantId,
        bankAccountId: bank.id,
        ownerAccountId: owner.id,
        vanNumber,
        vpa,
        status: "active",
      })
      .returning({
        id: virtualAccounts.id,
        vanNumber: virtualAccounts.vanNumber,
        vpa: virtualAccounts.vpa,
      });

    if (!row) throw new HttpError(500, "Could not assign virtual account", "VAN_ASSIGN_FAILED");
    return { vanId: row.id, vanNumber: row.vanNumber, vpa: row.vpa };
  });
}

export async function listVirtualAccounts(tenantId: string, userId?: string) {
  const ownerFilter = userId
    ? and(eq(virtualAccounts.tenantId, tenantId), eq(ownerAccounts.userId, userId))
    : eq(virtualAccounts.tenantId, tenantId);

  const rows = await db
    .select({
      id: virtualAccounts.id,
      vanNumber: virtualAccounts.vanNumber,
      vpa: virtualAccounts.vpa,
      status: virtualAccounts.status,
      bankAccountId: virtualAccounts.bankAccountId,
      bankName: bankAccounts.bankName,
      ifsc: bankAccounts.ifsc,
      ownerUserId: ownerAccounts.userId,
      ownerCode: ownerAccounts.code,
      createdAt: virtualAccounts.createdAt,
    })
    .from(virtualAccounts)
    .innerJoin(ownerAccounts, eq(ownerAccounts.id, virtualAccounts.ownerAccountId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, virtualAccounts.bankAccountId))
    .where(ownerFilter)
    .orderBy(desc(virtualAccounts.createdAt))
    .limit(200);

  return rows.map((r) => ({
    id: String(r.id),
    vanNumber: r.vanNumber,
    vpa: r.vpa,
    status: r.status,
    bankAccountId: String(r.bankAccountId),
    bankName: r.bankName,
    ifsc: r.ifsc,
    ownerUserId: r.ownerUserId,
    ownerCode: r.ownerCode,
    createdAt: r.createdAt.toISOString(),
  }));
}
