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
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { accounts } from "./accounts";
import { journals } from "./ledger";
import { bankAccounts } from "./banking";

export const settlementModeEnum = pgEnum("settlement_mode", ["imps", "neft", "rtgs"]);

export const settlementRequestStatusEnum = pgEnum("settlement_request_status", [
  "requested",
  "queued",
  "processing",
  "success",
  "failed",
  "returned",
]);

/**
 * Agent's own bank account for withdrawing settleable earnings.
 * NPCI "One Operator, One Bank": at most one active row per user (partial unique index).
 */
export const agentSettlementAccounts = pgTable(
  "agent_settlement_accounts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Encrypted with the shared PII key (utils/aes.ts). Never log the clear number.
    accountNumberEnc: text("account_number_enc").notNull(),
    accountNumberLast4: char("account_number_last4", { length: 4 }).notNull(),
    ifsc: varchar("ifsc", { length: 15 }).notNull(),
    holderName: varchar("holder_name", { length: 160 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationRef: varchar("verification_ref", { length: 80 }),
    /** Bank account check: verified | not_confirmed | pending | error (null = never checked). */
    bankCheckStatus: varchar("bank_check_status", { length: 16 }),
    /** Account holder name as the bank returned it. */
    bankHolderName: varchar("bank_holder_name", { length: 160 }),
    bankCheckMethod: varchar("bank_check_method", { length: 12 }),
    /** bank_name_checks.id of the hit that confirmed the name — the verification ref admins approve with. */
    bankCheckRef: varchar("bank_check_ref", { length: 40 }),
    bankCheckMessage: varchar("bank_check_message", { length: 200 }),
    bankCheckedAt: timestamp("bank_checked_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(false),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    /** After a bank change is activated, settlements are blocked until this time (24h cooling). */
    coolingUntil: timestamp("cooling_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_settlement_accounts_one_active_uidx")
      .on(table.userId)
      .where(sql`${table.isActive} = true`),
    index("agent_settlement_accounts_user_idx").on(table.userId, table.createdAt),
    // Maker-checker: the agent who registered the account cannot also approve it.
    check(
      "agent_settlement_accounts_maker_checker",
      sql`${table.approvedBy} IS NULL OR ${table.createdBy} IS DISTINCT FROM ${table.approvedBy}`,
    ),
  ],
);

/**
 * Withdrawal of settleable earnings. Debit happens at REQUEST time so the agent cannot spend
 * the same money on a service while the bank payout is in flight.
 *
 *   request : Dr agent wallet  Cr TREASURY_SETTLE_PAYABLE   (SETTLEMENT_DEBIT)
 *   success : Dr TREASURY_SETTLE_PAYABLE  Cr TREASURY_BANK_* (SETTLEMENT_PAYOUT)
 *   failed  : REVERSAL of the debit journal
 */
export const settlementRequests = pgTable(
  "settlement_requests",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    agentAccountId: bigint("agent_account_id", { mode: "bigint" })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    settlementAccountId: bigint("settlement_account_id", { mode: "bigint" })
      .notNull()
      .references(() => agentSettlementAccounts.id, { onDelete: "restrict" }),

    // Paise.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    charges: bigint("charges", { mode: "bigint" }).notNull().default(sql`0`),
    netAmount: bigint("net_amount", { mode: "bigint" }).notNull(),

    mode: settlementModeEnum("mode").notNull().default("imps"),
    status: settlementRequestStatusEnum("status").notNull().default("requested"),
    batchId: varchar("batch_id", { length: 64 }),
    bankUtr: varchar("bank_utr", { length: 60 }),
    failureReason: text("failure_reason"),

    debitJournalId: bigint("debit_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    payoutJournalId: bigint("payout_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    reversalJournalId: bigint("reversal_journal_id", { mode: "bigint" }).references(
      () => journals.id,
      { onDelete: "restrict" },
    ),
    /** Company payout bank used on success — set when SETTLEMENT_PAYOUT posts. */
    payoutBankAccountId: bigint("payout_bank_account_id", { mode: "bigint" }).references(
      () => bankAccounts.id,
      { onDelete: "restrict" },
    ),

    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("settlement_requests_user_idx").on(table.userId, table.requestedAt),
    index("settlement_requests_tenant_status_idx").on(table.tenantId, table.status, table.requestedAt),
    check("settlement_requests_amount_positive", sql`${table.amount} > 0`),
    check("settlement_requests_net_positive", sql`${table.netAmount} > 0`),
    check(
      "settlement_requests_net_equals_amount_minus_charges",
      sql`${table.netAmount} = ${table.amount} - ${table.charges}`,
    ),
    check(
      "settlement_requests_success_has_payout",
      sql`${table.status} <> 'success' OR ${table.payoutJournalId} IS NOT NULL`,
    ),
    check(
      "settlement_requests_failed_has_reversal",
      sql`${table.status} <> 'failed' OR ${table.reversalJournalId} IS NOT NULL`,
    ),
  ],
);
