import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  bigint,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { journals } from "./ledger";
import { makerCheckerStatusEnum } from "./treasury";

export const reconSeverityEnum = pgEnum("recon_severity", ["info", "warn", "critical"]);
export const reconStatusEnum = pgEnum("recon_status", ["open", "closed"]);

// Reconciliation detects and reports; it never owns balances and never auto-fixes. Every
// failure lands here and a human must close it with a reason. A correction is a
// RECON_ADJUSTMENT journal through postJournal(), like any other money movement.
export const reconciliationExceptions = pgTable(
  "reconciliation_exceptions",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    checkName: varchar("check_name", { length: 60 }).notNull(),
    severity: reconSeverityEnum("severity").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    fingerprint: varchar("fingerprint", { length: 200 }).notNull(),
    status: reconStatusEnum("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closeNote: text("close_note"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("recon_exceptions_open_idx").on(table.tenantId, table.status, table.severity),
    index("recon_exceptions_fingerprint_idx").on(table.tenantId, table.fingerprint, table.status),
  ],
);

/**
 * Spec §9.2 — RECON_ADJUSTMENT never posts from a single operator.
 * Maker records the intended 2-leg journal; only a different checker posts it.
 */
export const reconAdjustments = pgTable(
  "recon_adjustments",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Paise — single debit/credit amount (balanced two-leg journal). */
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    debitCode: varchar("debit_code", { length: 64 }).notNull(),
    creditCode: varchar("credit_code", { length: 64 }).notNull(),
    reason: text("reason").notNull(),
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
  },
  (table) => [
    index("recon_adjustments_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.requestedAt,
    ),
    check("recon_adjustments_amount_positive", sql`${table.amount} > 0`),
    check("recon_adjustments_codes_differ", sql`${table.debitCode} <> ${table.creditCode}`),
    check(
      "recon_adjustments_maker_is_not_checker",
      sql`${table.approvedBy} IS NULL OR ${table.approvedBy} <> ${table.requestedBy}`,
    ),
    check(
      "recon_adjustments_approved_has_journal",
      sql`${table.status} <> 'approved' OR ${table.journalId} IS NOT NULL`,
    ),
  ],
);
