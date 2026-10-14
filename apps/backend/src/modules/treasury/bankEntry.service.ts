import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/postgres";
import { accounts, bankAccounts, bankEntries, providers, users } from "../../db/postgres/schema";
import { postJournal, type Tx } from "../../core/ledger";
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
  counter: "OWNER_CAPITAL" | "LOAN_PAYABLE" | "BANK_INTEREST_INCOME" | "BANK_CHARGES" | "SUSPENSE_IN" | "SUSPENSE_OUT" | "FLOAT";
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
    throw new HttpError(422, "An API provider can only be selected for provider top-up or withdrawal", "PROVIDER_NOT_ALLOWED");
  }

  if (params.attachmentDataUrl) validateAttachment(params.attachmentDataUrl);

  const utr = params.utr?.trim().toUpperCase() || null;
  if (utr) {
    const [dup] = await db
      .select({ id: bankEntries.id, status: bankEntries.status })
      .from(bankEntries)
      .where(and(eq(bankEntries.tenantId, params.tenantId), eq(bankEntries.utr, utr)))
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

  return spec.direction === "credit"
    ? { debit: bank.code, credit: counter }
    : { debit: counter, credit: bank.code };
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
  throw new HttpError(
    403,
    `You cannot ${verb} a bank entry you created. Ask another admin.`,
    "MAKER_IS_CHECKER",
  );
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

  return rows.map((r) => ({
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
    status: r.status,
    requestedBy: r.requestedBy,
    requestedByName: r.requestedByName,
    approvedByName: r.approvedByName,
    decisionNote: r.decisionNote,
    journalId: r.journalId != null ? String(r.journalId) : null,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    bankName: r.bankName,
    bankLast4: r.bankLast4,
    providerName: r.providerName,
  }));
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
