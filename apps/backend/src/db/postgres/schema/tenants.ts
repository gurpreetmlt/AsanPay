import { pgTable, uuid, varchar, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

// Every ledger table carries tenant_id from day 1. AsanPay itself is a normal tenant
// (code = 'ASANPAY') with no special-cased code path anywhere — see the white-label plan.
// The legacy tables (users, wallets, transactions, ...) are NOT tenant-scoped yet; that
// retrofit is a separate piece of work and must not block the ledger engine.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stable handle used by seeders and ops tooling. Never reuse a code after retirement.
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  /** Ops-tunable knobs (dual-approve limit, settlement fee, …). See tenantSettings.service. */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
