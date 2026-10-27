import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Bank-confirmed account holder names from paid name checks (pennyless / penny drop).
 * A recent row for the same account + IFSC is reused so the agent is not charged twice.
 * The account number is stored only as an HMAC (`account_hash`) plus the last 4 digits.
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
    method: varchar("method", { length: 12 }).notNull(),
    bankName: varchar("bank_name", { length: 160 }),
    txnRef: varchar("txn_ref", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bank_name_checks_account_idx").on(table.accountHash, table.ifsc, table.createdAt)],
);
