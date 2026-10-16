import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  varchar,
  jsonb,
  text,
} from "drizzle-orm/pg-core";
import { userRoleEnum, commissionRuleTypeEnum } from "./enums";
import { services, providers } from "./catalog";
import { users } from "./users";
import { transactions } from "./transactions";
import { walletLedgerGroups } from "./wallets";
import { tenants } from "./tenants";

// Config: "for service X (optionally, only via provider P), role Y earns flat/percentage Z".
// providerId is nullable: a null-provider rule is the default for that service+role; a
// provider-specific row (e.g. a PaySprint-only slab) is preferred when one matches — see
// findActiveRule's ordering in commission.service.ts. Evaluated top-down by effectiveFrom.
export const commissionRules = pgTable(
  "commission_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    ruleType: commissionRuleTypeEnum("rule_type").notNull(),
    // percentage stored as 0-100 (e.g. 1.5 = 1.5%), flat stored as rupees
    value: numeric("value", { precision: 10, scale: 4 }).notNull(),
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("commission_rules_service_role_idx").on(table.serviceId, table.role),
    index("commission_rules_service_provider_role_idx").on(table.serviceId, table.providerId, table.role),
  ],
);

/**
 * Customer service fee charged on debit services (DMT / BBPS / recharge / AePS deposit).
 * Same slab shape as commission_rules, plus tenant_id and nullable role (null = all roles).
 * Resolved only server-side via resolveCustomerFee — never from the client request body.
 */
export const serviceCharges = pgTable(
  "service_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    /** null = any provider for this service. */
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    /** null = any role (usually retailers pay; null keeps one default row). */
    role: userRoleEnum("role"),
    ruleType: commissionRuleTypeEnum("rule_type").notNull(),
    // percentage: 0–100 (e.g. 1.5 = 1.5%); flat: rupees
    value: numeric("value", { precision: 10, scale: 4 }).notNull(),
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("service_charges_tenant_service_idx").on(table.tenantId, table.serviceId),
    index("service_charges_service_provider_idx").on(table.serviceId, table.providerId),
    index("service_charges_active_idx").on(table.serviceId, table.isActive, table.effectiveFrom),
  ],
);

/** Per-agent override — wins over role-based `commission_rules` when active. */
export const userCommissionRates = pgTable(
  "user_commission_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    ruleType: commissionRuleTypeEnum("rule_type").notNull(),
    value: numeric("value", { precision: 10, scale: 4 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_commission_rates_user_service_key").on(table.userId, table.serviceId),
    index("user_commission_rates_user_idx").on(table.userId),
  ],
);

/**
 * Per-service tax flags (versioned). `serviceId` null = tenant-wide default.
 * DMT/Money Transfer typically has gst_on_fee; all commission products have tds_applies.
 */
export const taxServiceConfigs = pgTable(
  "tax_service_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** null = default for all services in the tenant */
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "cascade" }),
    tdsApplies: boolean("tds_applies").notNull().default(true),
    /** Percent 0–100, e.g. 2.0000 = 2% */
    tdsPercent: numeric("tds_percent", { precision: 10, scale: 4 }).notNull().default("2.0000"),
    gstOnFeeApplies: boolean("gst_on_fee_applies").notNull().default(false),
    gstOnFeePercent: numeric("gst_on_fee_percent", { precision: 10, scale: 4 }).notNull().default("18.0000"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tax_service_configs_tenant_active_idx").on(table.tenantId, table.isActive, table.effectiveFrom),
    index("tax_service_configs_tenant_service_idx").on(table.tenantId, table.serviceId),
  ],
);

// Actual payout per transaction, one row per beneficiary in the hierarchy chain
// (retailer -> distributor -> super_distributor -> admin). Written by the async
// commission-distribution job, each row backed by a matching credit in wallet_ledger_entries.
// `amount` = net credited to wallet; grossAmount / tdsAmount explain the cut (TC03).
export const commissionLedger = pgTable(
  "commission_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    beneficiaryUserId: uuid("beneficiary_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: userRoleEnum("role").notNull(),
    /** Net credited (after TDS). Historical rows: same as gross when tax cols null. */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }),
    tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }),
    /** Percent applied, e.g. 2.0000 */
    tdsPercent: numeric("tds_percent", { precision: 10, scale: 4 }),
    ledgerGroupId: uuid("ledger_group_id").references(() => walletLedgerGroups.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when commission is clawed back after refund / dispute (TC18). */
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => [
    index("commission_ledger_transaction_idx").on(table.transactionId),
    index("commission_ledger_beneficiary_idx").on(table.beneficiaryUserId),
    // One active payout per (transaction, beneficiary). Reversed rows keep history; a later
    // re-payout (rare) can insert again because the unique key is partial.
    uniqueIndex("commission_ledger_txn_beneficiary_key")
      .on(table.transactionId, table.beneficiaryUserId)
      .where(sql`${table.reversedAt} is null`),
  ],
);

/** Raw provider commission payloads (Vyapar etc.) until parse rules are confirmed (TC15). */
export const providerCommissionIngest = pgTable(
  "provider_commission_ingest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerCode: varchar("provider_code", { length: 40 }).notNull(),
    externalRef: varchar("external_ref", { length: 120 }),
    payload: jsonb("payload").notNull(),
    parseStatus: varchar("parse_status", { length: 20 }).notNull().default("stored"),
    parseNote: text("parse_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("provider_commission_ingest_provider_idx").on(table.providerCode, table.createdAt),
  ],
);
