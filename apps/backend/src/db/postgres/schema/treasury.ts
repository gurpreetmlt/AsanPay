import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  uuid,
  text,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { journals } from "./ledger";

export const makerCheckerStatusEnum = pgEnum("maker_checker_status", [
  "requested",
  "approved",
  "rejected",
]);

// Treasury -> Company Wallet allocation. Creates spendable capacity without moving an asset,
// so it is the single easiest way to invent money that does not exist — maker-checker is
// mandatory at ANY amount, and the maker can never be the checker.
export const allocations = pgTable(
  "allocations",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    // Paise.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    status: makerCheckerStatusEnum("status").notNull().default("requested"),
    reason: text("reason").notNull(),
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
  },
  (table) => [
    index("allocations_tenant_status_idx").on(table.tenantId, table.status, table.requestedAt),
    check("allocations_amount_positive", sql`${table.amount} > 0`),
    // Enforced in the database, not just the service — a maker approving their own allocation
    // is the whole failure mode this control exists to prevent.
    check(
      "allocations_maker_is_not_checker",
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} <> ${table.requestedBy}`,
    ),
    check(
      "allocations_approved_has_journal",
      sql`${table.status} <> 'approved' OR ${table.journalId} IS NOT NULL`,
    ),
  ],
);
