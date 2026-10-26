import { pgTable, uuid, varchar, text, timestamp, integer, index, numeric } from "drizzle-orm/pg-core";
import { users } from "./users";
import { transactions } from "./transactions";

/**
 * Per-(retailer, customer-Aadhaar) biometric mismatch streak.
 * Best practice: after 2 consecutive mismatches on one Aadhaar, block merchant + EDD.
 */
export const aepsBioMismatchCounters = pgTable(
  "aeps_bio_mismatch_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex of the 12-digit Aadhaar — never store raw Aadhaar here. */
    aadhaarHash: varchar("aadhaar_hash", { length: 64 }).notNull(),
    consecutiveMismatches: integer("consecutive_mismatches").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("aeps_bio_mismatch_user_aadhaar_idx").on(table.userId, table.aadhaarHash),
  ],
);

/**
 * Digital cash receipt / register row for withdrawals (chargeback defence).
 * Customer photo / CCTV object storage is a follow-up — this stores the register entry.
 */
export const aepsCashReceipts = pgTable(
  "aeps_cash_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    txnId: uuid("txn_id").references(() => transactions.id, { onDelete: "set null" }),
    txnRef: varchar("txn_ref", { length: 40 }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    customerMobileMasked: varchar("customer_mobile_masked", { length: 15 }),
    bankIin: varchar("bank_iin", { length: 11 }),
    notes: text("notes"),
    /** Transaction geo at cash handover (degrees). */
    latitude: varchar("latitude", { length: 32 }),
    longitude: varchar("longitude", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("aeps_cash_receipts_user_idx").on(table.userId),
    index("aeps_cash_receipts_txn_idx").on(table.txnId),
  ],
);
