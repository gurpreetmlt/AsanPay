import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { accounts, bankAccounts, bankEntries, fundRequests, providers, users } from "../../db/postgres/schema";
import { postJournal, reverseJournal, type Tx } from "../../core/ledger";
import { paiseToRupees, type Paise } from "../../core/money";
import { HttpError } from "../../utils/httpError";
import { insertAuditLog } from "../../db/postgres/repositories/auditLog";
import { ensureTreasuryAccount, floatAccountCode } from "../wallet/ledgerAccounts";

export const BANK_ENTRY_MODES = ["upi", "imps", "neft", "rtgs", "cheque", "cash", "other"] as const;
export type BankEntryMode = (typeof BANK_ENTRY_MODES)[number];

type Direction = "credit" | "debit" | "none";

/**
 * `counter` is the non-bank leg. For a credit the bank is debited and `counter` credited;
 * for a debit the reverse. `none` = no company bank involved (owner paid from outside).
 */
interface CategorySpec {
  label: string;
  direction: Direction;
  counter:
    | "OWNER_CAPITAL"
    | "LOAN_PAYABLE"
    | "BANK_INTEREST_INCOME"
    | "BANK_CHARGES"
    | "SUSPENSE_IN"
    | "SUSPENSE_OUT"
    | "FLOAT";
}

export const BANK_ENTRY_CATEGORIES = {
  owner_capital: { label: "Owner capital", direction: "credit", counter: "OWNER_CAPITAL" },
  loan_received: { label: "Loan received", direction: "credit", counter: "LOAN_PAYABLE" },
  bank_interest: { label: "Bank interest", direction: "credit", counter: "BANK_INTEREST_INCOME" },
  provider_refund: { label: "Provider wallet withdrawal", direction: "credit", counter: "FLOAT" },
  other_credit: { label: "Other credit (to identify)", direction: "credit", counter: "SUSPENSE_IN" },
  provider_topup: { label: "Provider wallet top-up", direction: "debit", counter: "FLOAT" },
  bank_charges: { label: "Bank charges", direction: "debit", counter: "BANK_CHARGES" },
  owner_withdrawal: { label: "Owner withdrawal", direction: "debit", counter: "OWNER_CAPITAL" },
  loan_repayment: { label: "Loan repayment", direction: "debit", counter: "LOAN_PAYABLE" },
  other_debit: { label: "Other debit (to identify)", direction: "debit", counter: "SUSPENSE_OUT" },
  provider_topup_by_owner: {
    label: "Provider top-up paid by owner (personal account)",
    direction: "none",
    counter: "FLOAT",
  },
} as const satisfies Record<string, CategorySpec>;

export type BankEntryCategory = keyof typeof BANK_ENTRY_CATEGORIES;

export function isBankEntryCategory(v: string): v is BankEntryCategory {
  return Object.prototype.hasOwnProperty.call(BANK_ENTRY_CATEGORIES, v);
}

const COUNTER_CODES: Record<Exclude<CategorySpec["counter"], "FLOAT">, string> = {
  OWNER_CAPITAL: "OWNER_CAPITAL",
  LOAN_PAYABLE: "LOAN_PAYABLE",
  BANK_INTEREST_INCOME: "BANK_INTEREST_INCOME",
  BANK_CHARGES: "BANK_CHARGES",
  SUSPENSE_IN: "TREASURY_SUSPENSE_UNIDENTIFIED",
  SUSPENSE_OUT: "TREASURY_SUSPENSE_MISMATCH",
};

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ATTACHMENT_RE = /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;

function validateAttachment(dataUrl: string): void {
  const m = ATTACHMENT_RE.exec(dataUrl);
  if (!m) {
    throw new HttpError(422, "Proof must be a PNG, JPG, WEBP image or a PDF", "INVALID_ATTACHMENT");
  }
  const bytes = Math.floor(((m[3] ?? "").length * 3) / 4);
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(422, "Proof file must be 3 MB or smaller", "ATTACHMENT_TOO_LARGE");
  }
}

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function requestBankEntry(params: {
  tenantId: string;
  requestedBy: string;
  category: BankEntryCategory;
  bankAccountId: string | null;
  providerId: string | null;
  amount: Paise;
  txnDate: string;
  mode: BankEntryMode;
  utr: string | null;
  partyName: string | null;
  partyIfsc: string | null;
  partyAccountLast4: string | null;
  narration: string | null;
  attachmentName: string | null;
  attachmentDataUrl: string | null;
  /** Bulk entries from statement lines: receipt can follow later, but approve stays locked until it does. */
  allowMissingProof?: boolean;
}): Promise<{ id: string }> {
  const spec = BANK_ENTRY_CATEGORIES[params.category];

  if (params.amount <= 0n) {
    throw new HttpError(422, "Amount must be greater than zero", "INVALID_AMOUNT");
  }
  if (params.txnDate > todayIst()) {
    throw new HttpError(422, "Transaction date cannot be in the future", "INVALID_DATE");
  }

  let bankAccountId: bigint | null = null;
  if (spec.direction === "none") {
    if (params.bankAccountId) {
      throw new HttpError(
        422,
        "Leave the company bank account empty — this category is for a payment made from the owner's personal account",
        "BANK_NOT_ALLOWED",
      );
    }
  } else {
    if (!params.bankAccountId) {
      throw new HttpError(422, "Select the company bank account this entry belongs to", "BANK_REQUIRED");
    }
    const [bank] = await db
      .select({ id: bankAccounts.id, deletedAt: bankAccounts.deletedAt })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, BigInt(params.bankAccountId)), eq(bankAccounts.tenantId, params.tenantId)))
      .limit(1);
    if (!bank || bank.deletedAt) {
      throw new HttpError(404, "Company bank account not found", "BANK_NOT_FOUND");
    }
    bankAccountId = bank.id;
  }

  if (spec.counter === "FLOAT") {
    if (!params.providerId) {
      throw new HttpError(422, "Select the API provider whose wallet this entry belongs to", "PROVIDER_REQUIRED");
    }
    const [provider] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.id, params.providerId))
      .limit(1);
    if (!provider) throw new HttpError(404, "API provider not found", "PROVIDER_NOT_FOUND");
  } else if (params.providerId) {
    throw new HttpError(
      422,
      "An API provider can only be selected for provider top-up or withdrawal",
      "PROVIDER_NOT_ALLOWED",
    );
  }

  if (!params.attachmentDataUrl && !params.allowMissingProof) {
    throw new HttpError(
      422,
      "Upload proof — a bank statement screenshot, receipt photo or PDF is required for every bank entry",
      "PROOF_REQUIRED",
    );
  }
  if (params.attachmentDataUrl) validateAttachment(params.attachmentDataUrl);

  const utr = params.utr?.trim().toUpperCase() || null;
  if (utr) {
    const [dup] = await db
      .select({ id: bankEntries.id, status: bankEntries.status })
      .from(bankEntries)
      .where(
        and(eq(bankEntries.tenantId, params.tenantId), eq(bankEntries.utr, utr), isNull(bankEntries.reversedAt)),
      )
      .orderBy(desc(bankEntries.id))
      .limit(1);
    if (dup && dup.status !== "rejected") {
      throw new HttpError(
        409,
        `UTR ${utr} is already recorded in bank entry #${dup.id}. Each UTR can be entered only once.`,
        "DUPLICATE_UTR",
      );
    }
  }

  const [row] = await db
    .insert(bankEntries)
    .values({
      tenantId: params.tenantId,
      bankAccountId,
      providerId: params.providerId,
      category: params.category,
      direction: spec.direction,
      amount: params.amount,
      txnDate: params.txnDate,
      mode: params.mode,
      utr,
      partyName: params.partyName?.trim() || null,
      partyIfsc: params.partyIfsc?.trim().toUpperCase() || null,
      partyAccountLast4: params.partyAccountLast4?.trim() || null,
      narration: params.narration?.trim() || null,
      attachmentName: params.attachmentDataUrl ? params.attachmentName?.trim().slice(0, 160) || "proof" : null,
      attachmentDataUrl: params.attachmentDataUrl,
      requestedBy: params.requestedBy,
    })
    .returning({ id: bankEntries.id });
  if (!row) throw new HttpError(500, "Could not save the bank entry", "BANK_ENTRY_FAILED");

  await insertAuditLog({
    userId: params.requestedBy,
    action: "admin.bank_entry_request",
    entityType: "bank_entry",
    entityId: String(row.id),
    metadata: { category: params.category, amountPaise: params.amount.toString(), utr },
  });

  return { id: String(row.id) };
}

async function resolveLegs(
  tx: Tx,
  tenantId: string,
  row: { category: string; bankAccountId: bigint | null; providerId: string | null },
): Promise<{ debit: string; credit: string }> {
  if (!isBankEntryCategory(row.category)) {
    throw new HttpError(500, `Unknown bank entry category ${row.category}`, "BAD_CATEGORY");
  }
  const spec = BANK_ENTRY_CATEGORIES[row.category];

  let counter: string;
  if (spec.counter === "FLOAT") {
    const [provider] = await tx
      .select({ code: providers.code, name: providers.name })
      .from(providers)
      .where(eq(providers.id, row.providerId ?? ""))
      .limit(1);
    if (!provider) throw new HttpError(404, "API provider not found", "PROVIDER_NOT_FOUND");
    counter = floatAccountCode(provider.code);
    await ensureTreasuryAccount(tx, { tenantId, code: counter, name: `Float — ${provider.name}`, type: "float" });
  } else {
    counter = COUNTER_CODES[spec.counter];
  }

  if (spec.direction === "none") return { debit: counter, credit: COUNTER_CODES.OWNER_CAPITAL };

  const [bank] = await tx
    .select({ code: accounts.code })
    .from(bankAccounts)
    .innerJoin(accounts, eq(accounts.id, bankAccounts.ledgerAccountId))
    .where(eq(bankAccounts.id, row.bankAccountId ?? -1n))
    .limit(1);
  if (!bank) throw new HttpError(404, "Company bank account not found", "BANK_NOT_FOUND");

  return spec.direction === "credit" ? { debit: bank.code, credit: counter } : { debit: counter, credit: bank.code };
}

/** With a single admin there is nobody else to check, so the maker may decide their own entry. */
export async function canSelfApproveBankEntries(): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  return (row?.n ?? 0) <= 1;
}

async function assertMayDecide(requestedBy: string, actorId: string, verb: "approve" | "reject"): Promise<boolean> {
  if (requestedBy !== actorId) return false;
  if (await canSelfApproveBankEntries()) return true;
  throw new HttpError(403, `You cannot ${verb} a bank entry you created. Ask another admin.`, "MAKER_IS_CHECKER");
}

export async function approveBankEntry(params: {
  tenantId: string;
  entryId: bigint;
  approvedBy: string;
}): Promise<{ journalId: string }> {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bankEntries)
      .where(and(eq(bankEntries.id, params.entryId), eq(bankEntries.tenantId, params.tenantId)))
      .for("update");
    if (!row) throw new HttpError(404, "Bank entry not found", "NOT_FOUND");
    if (row.status !== "requested") {
      throw new HttpError(422, `Bank entry is already ${row.status}`, "ALREADY_DECIDED");
    }
    if (!row.attachmentDataUrl) {
      throw new HttpError(
        422,
        `Receipt missing for bank entry #${row.id} — upload the receipt before approving`,
        "RECEIPT_MISSING",
      );
    }
    const selfApproved = await assertMayDecide(row.requestedBy, params.approvedBy, "approve");

    const legs = await resolveLegs(tx, params.tenantId, row);
    const label = isBankEntryCategory(row.category) ? BANK_ENTRY_CATEGORIES[row.category].label : row.category;
    const journal = await postJournal(tx, {
      tenantId: params.tenantId,
      txnType: "BANK_ENTRY",
      idemKey: `BANK_ENTRY:${row.id}`,
      performedBy: params.approvedBy,
      referenceId: String(row.id),
      reason: `${label}${row.utr ? ` · UTR ${row.utr}` : ""}${row.partyName ? ` · ${row.partyName}` : ""}`,
      entries: [
        { code: legs.debit, dir: "DR", amount: row.amount as Paise },
        { code: legs.credit, dir: "CR", amount: row.amount as Paise },
      ],
    });

    await tx
      .update(bankEntries)
      .set({ status: "approved", approvedBy: params.approvedBy, journalId: journal.id, decidedAt: new Date() })
      .where(eq(bankEntries.id, row.id));

    return { journalId: String(journal.id), selfApproved };
  });

  await insertAuditLog({
    userId: params.approvedBy,
    action: "admin.bank_entry_approve",
    entityType: "bank_entry",
    entityId: String(params.entryId),
    metadata: { journalId: result.journalId, selfApproved: result.selfApproved },
  });
  return { journalId: result.journalId };
}

export async function rejectBankEntry(params: {
  tenantId: string;
  entryId: bigint;
  rejectedBy: string;
  note: string;
}): Promise<void> {
  const note = params.note.trim();
  if (note.length < 3) {
    throw new HttpError(422, "Rejection note must be at least 3 characters", "NOTE_REQUIRED");
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: bankEntries.status, requestedBy: bankEntries.requestedBy })
      .from(bankEntries)
      .where(and(eq(bankEntries.id, params.entryId), eq(bankEntries.tenantId, params.tenantId)))
      .for("update");
    if (!row) throw new HttpError(404, "Bank entry not found", "NOT_FOUND");
    if (row.status !== "requested") {
      throw new HttpError(422, `Bank entry is already ${row.status}`, "ALREADY_DECIDED");
    }
    await assertMayDecide(row.requestedBy, params.rejectedBy, "reject");
    await tx
      .update(bankEntries)
      .set({ status: "rejected", approvedBy: params.rejectedBy, decisionNote: note, decidedAt: new Date() })
      .where(eq(bankEntries.id, params.entryId));
  });

  await insertAuditLog({
    userId: params.rejectedBy,
    action: "admin.bank_entry_reject",
    entityType: "bank_entry",
    entityId: String(params.entryId),
    metadata: { note },
  });
}

function modeFromNarration(narration: string | null): BankEntryMode {
  const n = (narration ?? "").toUpperCase();
  if (/\bUPI\b/.test(n)) return "upi";
  if (/\bIMPS\b/.test(n)) return "imps";
  if (/\bNEFT\b/.test(n)) return "neft";
  if (/\bRTGS\b/.test(n)) return "rtgs";
  if (/\b(CHQ|CHEQUE|CLG)\b/.test(n)) return "cheque";
  if (/\b(CASH|CSH)\b/.test(n)) return "cash";
  return "other";
}

/**
 * One request per statement line, all with the same category. Each line is checked on its own;
 * a bad line is reported and skipped, never blocks the rest. Receipts may follow later.
 */
export async function createBankEntriesFromLines(params: {
  tenantId: string;
  requestedBy: string;
  bankAccountId: string;
  category: BankEntryCategory;
  providerId: string | null;
  lineIds: string[];
}): Promise<Array<{ lineId: string; entryId: string | null; error: string | null }>> {
  const spec = BANK_ENTRY_CATEGORIES[params.category];
  if (spec.direction === "none") {
    throw new HttpError(422, "This category has no company bank — it cannot be created from statement lines", "BAD_CATEGORY");
  }
  if (!/^\d+$/.test(params.bankAccountId)) throw new HttpError(422, "Select the company bank account", "BANK_REQUIRED");

  const results: Array<{ lineId: string; entryId: string | null; error: string | null }> = [];
  for (const lineId of params.lineIds) {
    try {
      if (!/^\d+$/.test(lineId)) throw new HttpError(422, "Statement line id is invalid", "INVALID_ID");
      const found = await db.execute<{
        txn_date: string;
        direction: string;
        amount: string;
        utr: string | null;
        narration: string | null;
        sender_name: string | null;
        match_status: string;
      }>(sql`
        SELECT txn_date::text, direction, amount::text, utr, narration, sender_name, match_status::text
        FROM bank_statement_lines
        WHERE id = ${lineId} AND tenant_id = ${params.tenantId} AND bank_account_id = ${params.bankAccountId}
      `);
      const line = found.rows[0];
      if (!line) throw new HttpError(404, "Line not found on this bank's statement", "NOT_FOUND");
      if (line.match_status !== "unmatched") {
        throw new HttpError(422, `Line is already ${line.match_status.replace(/_/g, " ")}`, "LINE_IN_USE");
      }
      const lineDirection = line.direction === "CR" ? "credit" : "debit";
      if (lineDirection !== spec.direction) {
        throw new HttpError(
          422,
          `${spec.label} is money ${spec.direction === "credit" ? "in" : "out"}, but this line is money ${lineDirection === "credit" ? "in" : "out"}`,
          "DIRECTION_MISMATCH",
        );
      }
      const created = await requestBankEntry({
        tenantId: params.tenantId,
        requestedBy: params.requestedBy,
        category: params.category,
        bankAccountId: params.bankAccountId,
        providerId: params.providerId,
        amount: BigInt(line.amount) as Paise,
        txnDate: line.txn_date,
        mode: modeFromNarration(line.narration),
        utr: line.utr,
        partyName: line.sender_name?.slice(0, 120) ?? null,
        partyIfsc: null,
        partyAccountLast4: null,
        narration: line.narration?.slice(0, 500) ?? null,
        attachmentName: null,
        attachmentDataUrl: null,
        allowMissingProof: true,
      });
      results.push({ lineId, entryId: created.id, error: null });
    } catch (err) {
      results.push({
        lineId,
        entryId: null,
        error: err instanceof HttpError ? err.message : "Could not create the entry for this line",
      });
    }
  }
  return results;
}

/** Attach or replace the receipt of an entry that has not been decided yet. */
export async function attachBankEntryReceipt(params: {
  tenantId: string;
  entryId: bigint;
  adminId: string;
  attachmentName: string;
  attachmentDataUrl: string;
}): Promise<void> {
  validateAttachment(params.attachmentDataUrl);
  const [row] = await db
    .select({ id: bankEntries.id, status: bankEntries.status })
    .from(bankEntries)
    .where(and(eq(bankEntries.id, params.entryId), eq(bankEntries.tenantId, params.tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Bank entry not found", "NOT_FOUND");
  if (row.status !== "requested") {
    throw new HttpError(422, `Receipt can only be added before approval — this entry is ${row.status}`, "ALREADY_DECIDED");
  }
  await db
    .update(bankEntries)
    .set({
      attachmentName: params.attachmentName.trim().slice(0, 160) || "proof",
      attachmentDataUrl: params.attachmentDataUrl,
    })
    .where(eq(bankEntries.id, row.id));
  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_entry_receipt",
    entityType: "bank_entry",
    entityId: String(row.id),
    metadata: { attachmentName: params.attachmentName },
  });
}

/**
 * Undo an approved entry with a REVERSAL journal (the ledger is append-only). The statement line
 * it was matched to goes back to unmatched. With `moveToBankAccountId`, a copy of the entry is
 * created on that bank as a new request — for an entry booked against the wrong bank account.
 */
export async function reverseBankEntry(params: {
  tenantId: string;
  entryId: bigint;
  adminId: string;
  reason: string;
  moveToBankAccountId?: string | null;
}): Promise<{ reversalJournalId: string; newEntryId: string | null }> {
  const reason = params.reason.trim();
  if (reason.length < 5) {
    throw new HttpError(422, "Reason must be at least 5 characters (e.g. Wrong bank account)", "REASON_REQUIRED");
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bankEntries)
      .where(and(eq(bankEntries.id, params.entryId), eq(bankEntries.tenantId, params.tenantId)))
      .for("update");
    if (!row) throw new HttpError(404, "Bank entry not found", "NOT_FOUND");
    if (row.reversedAt) throw new HttpError(422, "This bank entry is already reversed", "ALREADY_REVERSED");
    if (row.status !== "approved" || !row.journalId) {
      throw new HttpError(
        422,
        `Only approved entries can be reversed — this one is ${row.status}. Reject it instead.`,
        "NOT_REVERSIBLE",
      );
    }

    let moveTo: bigint | null = null;
    if (params.moveToBankAccountId) {
      if (row.direction === "none") {
        throw new HttpError(422, "This entry has no company bank, so it cannot be moved to one", "MOVE_NOT_ALLOWED");
      }
      if (!/^\d+$/.test(params.moveToBankAccountId)) {
        throw new HttpError(422, "Select the bank account to move this entry to", "INVALID_BANK");
      }
      moveTo = BigInt(params.moveToBankAccountId);
      if (moveTo === row.bankAccountId) {
        throw new HttpError(422, "Pick a different bank account — the entry is already on this one", "SAME_BANK");
      }
      const [bank] = await tx
        .select({ id: bankAccounts.id, deletedAt: bankAccounts.deletedAt })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, moveTo), eq(bankAccounts.tenantId, params.tenantId)))
        .limit(1);
      if (!bank || bank.deletedAt) throw new HttpError(404, "Target bank account not found", "BANK_NOT_FOUND");
    }

    let reversal;
    try {
      reversal = await reverseJournal(tx, {
        tenantId: params.tenantId,
        journalId: row.journalId,
        idemKey: `BE:${row.id}:REV`,
        performedBy: params.adminId,
        reason: `Bank entry ${row.id} reversed: ${reason}`,
      });
    } catch (err) {
      if (err instanceof Error && /Overdraft blocked/i.test(err.message)) {
        throw new HttpError(
          422,
          "Reversing this entry would take an account below zero — the money it recorded was already used.",
          "INSUFFICIENT_BALANCE",
        );
      }
      throw err;
    }

    await tx.execute(sql`
      UPDATE bank_statement_lines
      SET match_status = 'unmatched', matched_to_type = NULL, matched_to_id = NULL
      WHERE tenant_id = ${params.tenantId}
        AND matched_to_type = 'journal' AND matched_to_id = ${String(row.journalId)}
    `);

    await tx
      .update(bankEntries)
      .set({
        reversedAt: new Date(),
        reversedBy: params.adminId,
        reversalJournalId: reversal.id,
        reverseReason: reason,
      })
      .where(eq(bankEntries.id, row.id));

    let newEntryId: string | null = null;
    if (moveTo) {
      const [copy] = await tx
        .insert(bankEntries)
        .values({
          tenantId: row.tenantId,
          bankAccountId: moveTo,
          providerId: row.providerId,
          category: row.category,
          direction: row.direction,
          amount: row.amount,
          txnDate: row.txnDate,
          mode: row.mode,
          utr: row.utr,
          partyName: row.partyName,
          partyIfsc: row.partyIfsc,
          partyAccountLast4: row.partyAccountLast4,
          narration: [row.narration, `Moved from bank entry #${row.id}`].filter(Boolean).join(" · "),
          attachmentName: row.attachmentName,
          attachmentDataUrl: row.attachmentDataUrl,
          requestedBy: params.adminId,
        })
        .returning({ id: bankEntries.id });
      newEntryId = copy ? String(copy.id) : null;
    }

    return { reversalJournalId: String(reversal.id), newEntryId };
  });

  await insertAuditLog({
    userId: params.adminId,
    action: "admin.bank_entry_reverse",
    entityType: "bank_entry",
    entityId: String(params.entryId),
    metadata: { reason, ...result, moveToBankAccountId: params.moveToBankAccountId ?? null },
  });
  return result;
}

export async function listBankEntries(params: {
  tenantId: string;
  status?: "requested" | "approved" | "rejected";
  from?: string;
  to?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 2000);
  const maker = alias(users, "bank_entry_maker");
  const checker = alias(users, "bank_entry_checker");

  const conditions = [eq(bankEntries.tenantId, params.tenantId)];
  if (params.status) conditions.push(eq(bankEntries.status, params.status));
  if (params.from) conditions.push(gte(bankEntries.txnDate, params.from));
  if (params.to) conditions.push(lte(bankEntries.txnDate, params.to));

  const rows = await db
    .select({
      id: bankEntries.id,
      category: bankEntries.category,
      direction: bankEntries.direction,
      amount: bankEntries.amount,
      txnDate: bankEntries.txnDate,
      mode: bankEntries.mode,
      utr: bankEntries.utr,
      partyName: bankEntries.partyName,
      partyIfsc: bankEntries.partyIfsc,
      partyAccountLast4: bankEntries.partyAccountLast4,
      narration: bankEntries.narration,
      attachmentName: bankEntries.attachmentName,
      status: bankEntries.status,
      requestedBy: bankEntries.requestedBy,
      requestedByName: maker.name,
      approvedByName: checker.name,
      decisionNote: bankEntries.decisionNote,
      journalId: bankEntries.journalId,
      requestedAt: bankEntries.requestedAt,
      decidedAt: bankEntries.decidedAt,
      reversedAt: bankEntries.reversedAt,
      reverseReason: bankEntries.reverseReason,
      bankAccountId: bankEntries.bankAccountId,
      bankName: bankAccounts.bankName,
      bankLast4: bankAccounts.accountNumberLast4,
      providerName: providers.name,
    })
    .from(bankEntries)
    .innerJoin(maker, eq(maker.id, bankEntries.requestedBy))
    .leftJoin(checker, eq(checker.id, bankEntries.approvedBy))
    .leftJoin(bankAccounts, eq(bankAccounts.id, bankEntries.bankAccountId))
    .leftJoin(providers, eq(providers.id, bankEntries.providerId))
    .where(and(...conditions))
    .orderBy(desc(bankEntries.txnDate), desc(bankEntries.id))
    .limit(limit);

  const entries = rows.map((r) => ({
    source: "bank_entry" as const,
    id: String(r.id),
    category: r.category,
    categoryLabel: isBankEntryCategory(r.category) ? BANK_ENTRY_CATEGORIES[r.category].label : r.category,
    direction: r.direction,
    amount: paiseToRupees(r.amount as Paise),
    txnDate: r.txnDate,
    mode: r.mode,
    utr: r.utr,
    partyName: r.partyName,
    partyIfsc: r.partyIfsc,
    partyAccountLast4: r.partyAccountLast4,
    narration: r.narration,
    hasAttachment: Boolean(r.attachmentName),
    attachmentName: r.attachmentName,
    receiptUrl: null as string | null,
    status: r.status,
    requestedBy: r.requestedBy,
    requestedByName: r.requestedByName,
    approvedByName: r.approvedByName,
    decisionNote: r.decisionNote,
    journalId: r.journalId != null ? String(r.journalId) : null,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    bankAccountId: r.bankAccountId != null ? String(r.bankAccountId) : null,
    bankName: r.bankName,
    bankLast4: r.bankLast4,
    providerName: r.providerName,
    agent: null as AgentRef | null,
    fundRequestId: null as string | null,
    isTest: false,
    reversedAt: r.reversedAt as Date | null,
    reverseReason: r.reverseReason as string | null,
  }));

  // Credited agent fund requests are bank credits too; list them read-only so the register
  // (and the CA export) shows every rupee that entered a company bank.
  if (params.status && params.status !== "approved") return attachStatementInfo(params.tenantId, entries);
  const deposits = await listCreditedFundRequests(params.tenantId, params.from, params.to, limit);
  const combined = [...entries, ...deposits]
    .sort((a, b) =>
      a.txnDate === b.txnDate ? b.requestedAt.getTime() - a.requestedAt.getTime() : a.txnDate < b.txnDate ? 1 : -1,
    )
    .slice(0, limit);
  return attachStatementInfo(params.tenantId, combined);
}

/**
 * - matched: a statement line is tied to this entry (bank entry journal / fund request claim)
 * - not_found: a statement covering this date was uploaded for this bank, but no line is tied
 * - not_uploaded: no statement for this bank covers this date yet
 * - pending: entry not approved, so nothing can be matched yet
 * - no_bank: paid outside the company bank (owner's personal account)
 */
export type StatementStatus = "matched" | "not_found" | "not_uploaded" | "pending" | "no_bank";

interface StatementLinkable {
  source: "bank_entry" | "fund_request";
  status: string;
  journalId: string | null;
  fundRequestId: string | null;
  bankAccountId: string | null;
  txnDate: string;
}

type LinkedLineRow = {
  id: string;
  txn_date: string;
  utr: string | null;
  narration: string | null;
  matched_to_type: string;
  matched_to_id: string;
  file_name: string | null;
};

async function attachStatementInfo<T extends StatementLinkable>(tenantId: string, rows: T[]) {
  const journalIds = rows.filter((r) => r.source === "bank_entry" && r.journalId).map((r) => r.journalId!);
  const frIds = rows.filter((r) => r.fundRequestId).map((r) => r.fundRequestId!);
  const idList = (ids: string[]) =>
    sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );

  const linked = new Map<string, LinkedLineRow>();
  if (journalIds.length || frIds.length) {
    const result = await db.execute<LinkedLineRow>(sql`
      SELECT l.id::text, l.txn_date::text, l.utr, l.narration, l.matched_to_type,
             l.matched_to_id::text, i.file_name
      FROM bank_statement_lines l
      LEFT JOIN bank_statement_imports i ON i.id = l.import_id
      WHERE l.tenant_id = ${tenantId}
        AND (
          ${journalIds.length ? sql`(l.matched_to_type = 'journal' AND l.matched_to_id IN (${idList(journalIds)}))` : sql`FALSE`}
          OR
          ${frIds.length ? sql`(l.matched_to_type = 'fund_request' AND l.matched_to_id IN (${idList(frIds)}))` : sql`FALSE`}
        )
    `);
    for (const l of result.rows) linked.set(`${l.matched_to_type}:${l.matched_to_id}`, l);
  }

  // A date counts as covered only if an upload's statement period includes it. Lines imported
  // before upload history existed have no period, so each covers just its own date.
  const coverageRows = await db.execute<{ bank_account_id: string; first: string; last: string }>(sql`
    SELECT bank_account_id::text, period_from::text AS first, period_to::text AS last
    FROM bank_statement_imports
    WHERE tenant_id = ${tenantId} AND period_from IS NOT NULL AND period_to IS NOT NULL
    UNION
    SELECT bank_account_id::text, txn_date::text, txn_date::text
    FROM bank_statement_lines
    WHERE tenant_id = ${tenantId} AND import_id IS NULL
  `);
  const coverage = new Map<string, Array<{ first: string; last: string }>>();
  for (const c of coverageRows.rows) {
    const list = coverage.get(c.bank_account_id) ?? [];
    list.push({ first: c.first, last: c.last });
    coverage.set(c.bank_account_id, list);
  }
  const covered = (bankAccountId: string, date: string) =>
    (coverage.get(bankAccountId) ?? []).some((c) => date >= c.first && date <= c.last);

  return rows.map((r) => {
    const key =
      r.source === "fund_request" ? `fund_request:${r.fundRequestId}` : r.journalId ? `journal:${r.journalId}` : null;
    const line = key ? linked.get(key) : undefined;

    let statementStatus: StatementStatus;
    if (!r.bankAccountId) statementStatus = "no_bank";
    else if (line) statementStatus = "matched";
    else if (r.status !== "approved") statementStatus = "pending";
    else if (covered(r.bankAccountId, r.txnDate)) statementStatus = "not_found";
    else statementStatus = "not_uploaded";

    return {
      ...r,
      statement: {
        status: statementStatus,
        line: line
          ? {
              id: line.id,
              date: line.txn_date,
              utr: line.utr,
              narration: line.narration,
              fileName: line.file_name,
            }
          : null,
      },
    };
  });
}

interface AgentRef {
  name: string;
  uid: string;
  mobile: string;
  role: string;
}

const AGENT_ROLE_LABEL: Record<string, string> = {
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

const PAYMENT_MODE_TO_ENTRY_MODE: Record<string, string> = {
  cash_deposit: "cash",
  neft: "neft",
  rtgs: "rtgs",
  imps: "imps",
  upi: "upi",
  cheque: "cheque",
};

async function listCreditedFundRequests(
  tenantId: string,
  from: string | undefined,
  to: string | undefined,
  limit: number,
) {
  const agent = alias(users, "fr_agent");
  const reviewer = alias(users, "fr_reviewer");
  const depositDate = sql<string>`to_char(${fundRequests.depositDatetime} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

  const conditions = [eq(fundRequests.tenantId, tenantId), eq(fundRequests.status, "credited")];
  if (from) conditions.push(sql`${depositDate} >= ${from}`);
  if (to) conditions.push(sql`${depositDate} <= ${to}`);

  const rows = await db
    .select({
      id: fundRequests.id,
      amount: fundRequests.amount,
      creditedAmount: fundRequests.creditedAmount,
      paymentMode: fundRequests.paymentMode,
      referenceNumber: fundRequests.referenceNumber,
      senderName: fundRequests.senderName,
      remarks: fundRequests.remarks,
      receiptUrl: fundRequests.receiptUrl,
      depositDate,
      submittedAt: fundRequests.submittedAt,
      creditedAt: fundRequests.creditedAt,
      receiveJournalId: fundRequests.receiveJournalId,
      testMarkedAt: fundRequests.testMarkedAt,
      bankAccountId: fundRequests.bankAccountId,
      bankName: bankAccounts.bankName,
      bankLast4: bankAccounts.accountNumberLast4,
      agentId: agent.id,
      agentName: agent.name,
      agentUid: agent.uid,
      agentMobile: agent.mobile,
      agentRole: agent.role,
      reviewerName: reviewer.name,
    })
    .from(fundRequests)
    .innerJoin(agent, eq(agent.id, fundRequests.requesterUserId))
    .leftJoin(reviewer, eq(reviewer.id, fundRequests.reviewedBy))
    .innerJoin(bankAccounts, eq(bankAccounts.id, fundRequests.bankAccountId))
    .where(and(...conditions))
    .orderBy(desc(fundRequests.depositDatetime))
    .limit(limit);

  return rows.map((r) => {
    const roleLabel = AGENT_ROLE_LABEL[r.agentRole] ?? r.agentRole;
    return {
      source: "fund_request" as const,
      id: `FR-${r.id}`,
      category: "agent_deposit",
      categoryLabel: "Agent deposit (fund request)",
      direction: "credit" as Direction,
      amount: paiseToRupees((r.creditedAmount ?? r.amount) as Paise),
      txnDate: r.depositDate,
      mode: PAYMENT_MODE_TO_ENTRY_MODE[r.paymentMode] ?? "other",
      utr: r.referenceNumber,
      partyName: r.agentName,
      partyIfsc: null as string | null,
      partyAccountLast4: null as string | null,
      narration: [
        `${roleLabel} · ${r.agentUid} · ${r.agentMobile}`,
        r.senderName ? `Depositor: ${r.senderName}` : null,
        r.remarks,
      ]
        .filter(Boolean)
        .join(" · "),
      hasAttachment: false,
      attachmentName: null as string | null,
      receiptUrl: r.receiptUrl as string | null,
      status: "approved" as const,
      requestedBy: r.agentId,
      requestedByName: r.agentName,
      approvedByName: r.reviewerName ?? "Auto-matched",
      decisionNote: null as string | null,
      journalId: r.receiveJournalId != null ? String(r.receiveJournalId) : null,
      requestedAt: r.submittedAt,
      decidedAt: r.creditedAt,
      bankAccountId: String(r.bankAccountId) as string | null,
      bankName: r.bankName as string | null,
      bankLast4: r.bankLast4 as string | null,
      providerName: null as string | null,
      agent: { name: r.agentName, uid: r.agentUid, mobile: r.agentMobile, role: roleLabel } as AgentRef | null,
      fundRequestId: String(r.id) as string | null,
      isTest: r.testMarkedAt != null,
      reversedAt: null as Date | null,
      reverseReason: null as string | null,
    };
  });
}

export async function getBankEntryAttachment(tenantId: string, entryId: bigint) {
  const [row] = await db
    .select({ name: bankEntries.attachmentName, dataUrl: bankEntries.attachmentDataUrl })
    .from(bankEntries)
    .where(and(eq(bankEntries.id, entryId), eq(bankEntries.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new HttpError(404, "Bank entry not found", "NOT_FOUND");
  if (!row.dataUrl) throw new HttpError(404, "This bank entry has no proof attached", "NO_ATTACHMENT");
  return { name: row.name, dataUrl: row.dataUrl };
}

export function listBankEntryCategories() {
  return Object.entries(BANK_ENTRY_CATEGORIES).map(([value, spec]) => ({
    value,
    label: spec.label,
    direction: spec.direction,
    needsProvider: spec.counter === "FLOAT",
  }));
}
