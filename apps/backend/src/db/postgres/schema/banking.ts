import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  char,
  date,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { accounts } from "./accounts";

export const bankPurposeEnum = pgEnum("bank_purpose", ["collection", "payout", "ops"]);

export const statementMatchStatusEnum = pgEnum("statement_match_status", [
  "unmatched",
  "matched",
  "suspense",
  "ignored",
]);

// The company's real bank accounts. Each one owns a TREASURY_BANK_* ledger account, so adding
// a bank is an INSERT plus the account it creates — never a code change.
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    ledgerAccountId: bigint("ledger_account_id", { mode: "bigint" })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    bankName: varchar("bank_name", { length: 120 }).notNull(),
    // Encrypted with the shared PII key (utils/aes.ts). Never store this in the clear, and
    // never put it in a log line or an error message.
    accountNumberEnc: text("account_number_enc").notNull(),
    // Last 4 digits, kept in the clear purely so operators can pick the right account in a
    // dropdown without decrypting every row.
    accountNumberLast4: char("account_number_last4", { length: 4 }).notNull(),
    ifsc: varchar("ifsc", { length: 15 }).notNull(),
    purpose: bankPurposeEnum("purpose").notNull(),
    supportsVan: boolean("supports_van").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    /** Soft-delete — hard DELETE fails when VANs / statements / fund requests reference the row. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_accounts_ledger_uidx").on(table.ledgerAccountId),
    index("bank_accounts_tenant_purpose_idx").on(table.tenantId, table.purpose, table.isActive),
  ],
);

// Per-agent virtual account. A bank webhook on one of these credits the owner's wallet in
// about thirty seconds with no human involved — this is the path that should carry most of
// the volume once it is live.
export const virtualAccounts = pgTable(
  "virtual_accounts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    bankAccountId: bigint("bank_account_id", { mode: "bigint" })
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    ownerAccountId: bigint("owner_account_id", { mode: "bigint" })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    vanNumber: varchar("van_number", { length: 40 }).unique(),
    vpa: varchar("vpa", { length: 100 }).unique(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("virtual_accounts_owner_idx").on(table.ownerAccountId),
    // A VAN with neither a number nor a VPA can never be credited — it is a data-entry error.
    check(
      "virtual_accounts_has_identifier",
      sql`${table.vanNumber} IS NOT NULL OR ${table.vpa} IS NOT NULL`,
    ),
  ],
);

// Imported bank statement lines. The matching engine is useless without these, and unmatched
// CREDIT lines are the single best fraud and leakage indicator the platform has.
export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    bankAccountId: bigint("bank_account_id", { mode: "bigint" })
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    // The bank's own id where the feed provides one. Where it does not, the importer
    // synthesises a stable hash of (date, amount, utr, narration) so re-importing the same
    // statement cannot duplicate a line.
    bankTxnId: varchar("bank_txn_id", { length: 120 }).notNull(),
    txnDate: date("txn_date").notNull(),
    valueDatetime: timestamp("value_datetime", { withTimezone: true }),
    direction: char("direction", { length: 2 }).notNull().$type<"DR" | "CR">(),
    // Paise.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    utr: varchar("utr", { length: 60 }),
    // Normalised UTR — uppercased, spaces and hyphens stripped. Matching only ever compares
    // this, never the raw value, because banks format the same reference three different ways.
    utrNorm: varchar("utr_norm", { length: 60 }),
    narration: text("narration"),
    senderName: varchar("sender_name", { length: 160 }),
    balanceAfter: bigint("balance_after", { mode: "bigint" }),
    matchStatus: statementMatchStatusEnum("match_status").notNull().default("unmatched"),
    matchedToType: varchar("matched_to_type", { length: 30 }),
    matchedToId: bigint("matched_to_id", { mode: "bigint" }),
    // Set when an unresolved credit line is parked in suspense so treasury reflects reality.
    suspenseJournalId: bigint("suspense_journal_id", { mode: "bigint" }),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_statement_lines_txn_uidx").on(table.bankAccountId, table.bankTxnId),
    // One line can be consumed by exactly one claim. This is the constraint that stops the
    // same deposit being credited to two different retailers.
    uniqueIndex("bank_statement_lines_claim_uidx")
      .on(table.matchedToType, table.matchedToId)
      .where(sql`${table.matchedToId} IS NOT NULL`),
    index("bank_statement_lines_utr_idx").on(table.bankAccountId, table.utrNorm),
    index("bank_statement_lines_unmatched_idx")
      .on(table.bankAccountId, table.txnDate, table.amount)
      .where(sql`${table.matchStatus} = 'unmatched'`),
    check("bank_statement_lines_direction_valid", sql`${table.direction} IN ('DR','CR')`),
    check("bank_statement_lines_amount_positive", sql`${table.amount} > 0`),
  ],
);
