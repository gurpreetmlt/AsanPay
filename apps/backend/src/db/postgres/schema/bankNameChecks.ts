import { pgTable, uuid, varchar, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Every provider hit of a bank account check (BestAPI, pennyless, ₹1 penny drop) with its cost.
 * A recent `verified` row for the same account + IFSC is reused so nobody is charged twice.
 * The account number is stored only as an HMAC (`account_hash`) plus the last 4 digits.
 * status: verified | invalid | failed | pending. purpose: dmt_payee | settlement_bank | company_bank.
 */
export const bankNameChecks = pgTable(
  "bank_name_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountHash: varchar("account_hash", { length: 64 }).notNull(),
    accountLast4: varchar("account_last4", { length: 4 }).notNull(),
    ifsc: varchar("ifsc", { length: 11 }).notNull(),
    /** bestapi | pennyless | pennydrop */
    method: varchar("method", { length: 12 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("verified"),
    purpose: varchar("purpose", { length: 20 }).notNull().default("dmt_payee"),
    bankName: varchar("bank_name", { length: 160 }),
    detail: varchar("detail", { length: 200 }),
    /** What the provider charged us for this hit. */
    costRupees: numeric("cost_rupees", { precision: 8, scale: 2 }).notNull().default("0"),
    /** Agent charge txn, when the agent paid for this check. */
    txnRef: varchar("txn_ref", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bank_name_checks_account_idx").on(table.accountHash, table.ifsc, table.createdAt)],
);
