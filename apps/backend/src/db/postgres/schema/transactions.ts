import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { transactionStatusEnum, walletTypeEnum } from "./enums";
import { users } from "./users";
import { services, providers } from "./catalog";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // customer/partner-facing reference — new: ASP+YYMMDD+agentTail+6hex (legacy LKP…)
    txnRef: varchar("txn_ref", { length: 40 }).notNull().unique(),
    // caller-supplied key — uniqueness is per-user (see uniqueIndex below)
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    providerTxnId: varchar("provider_txn_id", { length: 100 }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    customerFee: numeric("customer_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    /** GST on customer fee (DMT etc.) — exclusive of customer_fee when gst_on_fee applies */
    customerFeeGst: numeric("customer_fee_gst", { precision: 14, scale: 2 }).notNull().default("0"),
    status: transactionStatusEnum("status").notNull().default("initiated"),
    failureReason: text("failure_reason"),
    // Wallet debited/credited for this txn (main = Wallet 1, aeps = Wallet 2). Null on legacy rows.
    walletType: walletTypeEnum("wallet_type"),
    // small structured fields only (mobile number, operator code, account no.) — raw provider
    // request/response payloads live in the provider_logs table, not here
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_user_idempotency_uidx").on(table.userId, table.idempotencyKey),
    index("transactions_user_id_idx").on(table.userId, table.createdAt),
    index("transactions_status_idx").on(table.status),
    index("transactions_service_id_idx").on(table.serviceId),
    check("transactions_amount_positive", sql`${table.amount} > 0`),
  ],
);
