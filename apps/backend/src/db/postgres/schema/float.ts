import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { journals } from "./ledger";
import { bankAccounts } from "./banking";
import { providers } from "./catalog";

export const floatTransferStatusEnum = pgEnum("float_transfer_status", [
  "initiated",
  "in_transit",
  "confirmed",
  "returned",
  "failed",
]);

export const floatTransferModeEnum = pgEnum("float_transfer_mode", ["neft", "rtgs", "imps"]);

/** Bank → aggregator float route (beneficiary details). */
export const floatRoutes = pgTable(
  "float_routes",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    fromBankId: bigint("from_bank_id", { mode: "bigint" })
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    toProviderId: uuid("to_provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    beneficiaryName: varchar("beneficiary_name", { length: 160 }).notNull(),
    beneficiaryAccEnc: text("beneficiary_acc_enc").notNull(),
    beneficiaryAccLast4: varchar("beneficiary_acc_last4", { length: 4 }).notNull(),
    beneficiaryIfsc: varchar("beneficiary_ifsc", { length: 15 }).notNull(),
    transferMode: floatTransferModeEnum("transfer_mode").notNull().default("neft"),
    minAmount: bigint("min_amount", { mode: "bigint" }),
    maxAmount: bigint("max_amount", { mode: "bigint" }),
    priority: integer("priority").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("float_routes_tenant_idx").on(table.tenantId, table.isActive, table.priority),
  ],
);

export const floatTransfers = pgTable(
  "float_transfers",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    routeId: bigint("route_id", { mode: "bigint" })
      .notNull()
      .references(() => floatRoutes.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    bankUtr: varchar("bank_utr", { length: 60 }),
    status: floatTransferStatusEnum("status").notNull().default("initiated"),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    transitJournalId: bigint("transit_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    confirmJournalId: bigint("confirm_journal_id", { mode: "bigint" }).references(() => journals.id, {
      onDelete: "restrict",
    }),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("float_transfers_tenant_status_idx").on(table.tenantId, table.status, table.initiatedAt),
    check("float_transfers_amount_positive", sql`${table.amount} > 0`),
    check(
      "float_transfers_maker_checker",
      sql`${table.approvedBy} IS NULL OR ${table.initiatedBy} IS DISTINCT FROM ${table.approvedBy}`,
    ),
  ],
);
