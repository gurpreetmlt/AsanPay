import { pgTable, uuid, varchar, numeric, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per cash collection started from the Cash Management page.
 * status: initiated (bank page opened) → pending | success | failed (from provider status check).
 */
export const cmsTransactions = pgTable(
  "cms_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    transactionId: varchar("transaction_id", { length: 25 }).notNull().unique(),
    merchantId: varchar("merchant_id", { length: 10 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("initiated"),
    providerStatus: varchar("provider_status", { length: 40 }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    utr: varchar("utr", { length: 40 }),
    billerName: varchar("biller_name", { length: 120 }),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cms_transactions_user_created_idx").on(table.userId, table.createdAt)],
);
