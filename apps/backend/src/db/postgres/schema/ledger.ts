import { sql } from "drizzle-orm";
import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  char,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { accounts } from "./accounts";

// journals (1) --< ledger_entries (N). Append-only, enforced by trigger AND by revoked
// grants — see migrations/custom/0022_ledger_guards.sql. Corrections are reversal journals,
// never an UPDATE.
//
// Only core/ledger may import this file. The eslint import boundary is what keeps a feature
// module from writing money directly.

export const journals = pgTable(
  "journals",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    // Business event type: WALLET_TRANSFER, DEPOSIT_RECEIVE, DEPOSIT_CREDIT, AEPS_WITHDRAWAL,
    // SETTLEMENT_PAYOUT, REVERSAL, ... Deliberately varchar, not an enum: this set grows with
    // every new money flow and an ALTER TYPE on a hot table is not worth the type safety.
    // The flow matrix is what validates it.
    txnType: varchar("txn_type", { length: 40 }).notNull(),
    referenceId: text("reference_id"),
    idemKey: varchar("idem_key", { length: 120 }).notNull(),
    // The operator who caused this. NULL only for system-generated journals (cron, webhook).
    // Admin is an operator, never a wallet — this column is how that stays true.
    performedBy: uuid("performed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    reversesId: bigint("reverses_id", { mode: "bigint" }).references(
      (): AnyPgColumn => journals.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Replay of the same key returns the original journal — a retry can never double-post.
    uniqueIndex("journals_tenant_idem_uidx").on(table.tenantId, table.idemKey),
    index("journals_tenant_type_created_idx").on(table.tenantId, table.txnType, table.createdAt),
    index("journals_reference_idx").on(table.tenantId, table.referenceId),
    // A reversal must point at a different journal, never at itself.
    check("journals_reverses_not_self", sql`${table.reversesId} IS DISTINCT FROM ${table.id}`),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    journalId: bigint("journal_id", { mode: "bigint" })
      .notNull()
      .references(() => journals.id, { onDelete: "restrict" }),
    accountId: bigint("account_id", { mode: "bigint" })
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Direction carries the sign. Amount is always positive.
    direction: char("direction", { length: 2 }).notNull().$type<"DR" | "CR">(),
    // Paise.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    // The account's balance immediately after this leg — lets an auditor reconstruct any
    // point in time without replaying the whole ledger.
    balanceAfter: bigint("balance_after", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ledger_entries_account_idx").on(table.accountId, table.id),
    index("ledger_entries_journal_idx").on(table.journalId),
    check("ledger_entries_direction_valid", sql`${table.direction} IN ('DR','CR')`),
    check("ledger_entries_amount_positive", sql`${table.amount} > 0`),
  ],
);
