import { pgTable, pgEnum, uuid, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { transactions } from "./transactions";
import { tenants } from "./tenants";

export const disputeStatusEnum = pgEnum("dispute_status", [
  "raised",
  "under_review",
  "resolved",
  "rejected",
]);

export const disputeCategoryEnum = pgEnum("dispute_category", [
  "customer_debited_no_service",
  "chargeback",
  "duplicate_charge",
  "wrong_amount",
  "other",
]);

/**
 * Customer debited but no service rendered, a duplicate charge, or the aggregator charging us
 * back — task #11. Ships before real volume: retrofitting dispute history onto transactions
 * that already happened is much harder than recording it as it goes.
 *
 * Resolution that returns money reverses the original journal(s) via postJournal()'s REVERSAL
 * type (spec §4.8) — never a fresh credit, never a direct balance edit. See
 * modules/disputes/dispute.service.ts.
 */
export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "restrict" }),
    raisedBy: uuid("raised_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    category: disputeCategoryEnum("category").notNull(),
    description: text("description").notNull(),
    /** Client-hosted URLs — same stub-URL convention as fund_requests.receiptUrl. */
    evidenceUrls: jsonb("evidence_urls").$type<string[]>().notNull().default([]),
    status: disputeStatusEnum("status").notNull().default("raised"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
    resolutionNote: text("resolution_note"),
    /** Journal ids (bigint, stored as text) reversed on resolution — a service txn can be more than one leg. */
    reversalJournalIds: jsonb("reversal_journal_ids").$type<string[]>().notNull().default([]),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // One open dispute per transaction — a second complaint about the same txn is a duplicate.
    uniqueIndex("disputes_open_per_txn_uidx")
      .on(table.transactionId)
      .where(sql`${table.status} IN ('raised', 'under_review')`),
    index("disputes_tenant_status_idx").on(table.tenantId, table.status, table.submittedAt),
    index("disputes_raised_by_idx").on(table.raisedBy, table.submittedAt),
    index("disputes_sla_open_idx")
      .on(table.slaDueAt)
      .where(sql`${table.status} IN ('raised', 'under_review')`),
  ],
);
