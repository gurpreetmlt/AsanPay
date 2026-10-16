import {
  pgTable,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { users } from "./users";
import { bankAccounts } from "./banking";

/** Admin rules: normalised UTR prefix → bank entry category (TB16). */
export const bankEntryCategoryRules = pgTable(
  "bank_entry_category_rules",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** Uppercase alphanumeric only (same normalisation as statement UTRs). */
    utrPrefix: varchar("utr_prefix", { length: 32 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    /** Null = all banks; set = only this company account. */
    bankAccountId: bigint("bank_account_id", { mode: "bigint" }).references(() => bankAccounts.id, {
      onDelete: "cascade",
    }),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bank_entry_category_rules_global_uidx")
      .on(table.tenantId, table.utrPrefix)
      .where(sql`${table.bankAccountId} IS NULL`),
    uniqueIndex("bank_entry_category_rules_bank_uidx")
      .on(table.tenantId, table.utrPrefix, table.bankAccountId)
      .where(sql`${table.bankAccountId} IS NOT NULL`),
    index("bank_entry_category_rules_tenant_active_idx").on(table.tenantId, table.isActive),
  ],
);
