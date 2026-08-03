import { pgTable, pgEnum, bigserial, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

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
    // Everything an operator needs to judge the exception without re-running the query.
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    // Stable identity for one ongoing problem, so a check running every 15 minutes reopens
    // the same row instead of filing 96 duplicates a day.
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
