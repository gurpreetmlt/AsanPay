import { sql } from "drizzle-orm";
import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { journals } from "./ledger";
import { bankAccounts } from "./banking";
import { providers } from "./catalog";
import { makerCheckerStatusEnum } from "./treasury";

// A company bank movement recorded by hand from the statement (owner capital, loan, charges,
// provider top-up, ...). Maker records it; a checker posts the BANK_ENTRY journal. The checker
// must be a different admin unless only one active admin exists (see canSelfApproveBankEntries).
// `bank_account_id` is NULL only for a provider top-up the owner paid from a personal account.
export const bankEntries = pgTable(
  "bank_entries",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    bankAccountId: bigint("bank_account_id", { mode: "bigint" }).references(() => bankAccounts.id, {
      onDelete: "restrict",
    }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 40 }).notNull(),
    direction: varchar("direction", { length: 6 }).notNull(),
    /** Paise. */
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    txnDate: date("txn_date").notNull(),
    mode: varchar("mode", { length: 10 }).notNull(),
    utr: varchar("utr", { length: 40 }),
    partyName: varchar("party_name", { length: 120 }),
    partyIfsc: varchar("party_ifsc", { length: 11 }),
    partyAccountLast4: varchar("party_account_last4", { length: 4 }),
    narration: text("narration"),
    attachmentName: varchar("attachment_name", { length: 160 }),
    attachmentDataUrl: text("attachment_data_url"),
    status: makerCheckerStatusEnum("status").notNull().default("requested"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    decisionNote: text("decision_note"),
    journalId: bigint("journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Approved entries are never edited: a wrong one is reversed in the ledger and stays visible.
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by").references(() => users.id, { onDelete: "set null" }),
    reversalJournalId: bigint("reversal_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    reverseReason: text("reverse_reason"),
  },
  (table) => [
    index("bank_entries_tenant_status_idx").on(table.tenantId, table.status, table.txnDate),
    uniqueIndex("bank_entries_utr_uidx")
      .on(table.tenantId, table.utr)
      .where(sql`${table.utr} IS NOT NULL AND ${table.status} <> 'rejected' AND ${table.reversedAt} IS NULL`),
    check("bank_entries_amount_positive", sql`${table.amount} > 0`),
    check("bank_entries_direction_valid", sql`${table.direction} IN ('credit', 'debit', 'none')`),
    check(
      "bank_entries_approved_has_journal",
      sql`${table.status} <> 'approved' OR ${table.journalId} IS NOT NULL`,
    ),
  ],
);
