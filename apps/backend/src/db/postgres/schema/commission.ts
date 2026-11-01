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
  integer,
} from "drizzle-orm/pg-core";
import { userRoleEnum, commissionRuleTypeEnum } from "./enums";
import { services, providers } from "./catalog";
import { users } from "./users";
import { transactions } from "./transactions";
import { walletLedgerGroups } from "./wallets";
import { tenants } from "./tenants";

// Config: "for service X (optionally, only via provider P), role Y earns flat/percentage Z".
// providerId is nullable: a null-provider rule is the default for that service+role; a
// provider-specific row (e.g. a Noble-only slab) is preferred when one matches — see
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
 * What the provider pays AsanPay per successful txn (provider income), versioned by effective_from.
 * providerId null = any provider. Slab bounds are inclusive on the txn amount (₹), same as
 * commission_rules. percentage → % of txn amount, optionally capped at cap_amount (₹).
 */
export const providerPayoutRules = pgTable(
  "provider_payout_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    ruleType: commissionRuleTypeEnum("rule_type").notNull(),
    // percentage: 0–100 (e.g. 0.5 = 0.5%); flat: rupees
    value: numeric("value", { precision: 10, scale: 4 }).notNull(),
    capAmount: numeric("cap_amount", { precision: 14, scale: 2 }),
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("provider_payout_rules_service_provider_idx").on(table.serviceId, table.providerId),
    index("provider_payout_rules_active_idx").on(table.serviceId, table.isActive, table.effectiveFrom),
  ],
);

/**
 * Role earning as a share of provider income (e.g. retailer 60 %) or a flat ₹, optionally per amount
 * slab. Resolution order per payout: agent override → share (only when provider income is
 * configured) → commission_rules → none. providerId null = all providers; a provider-specific row
 * wins, then a slab row over the service default.
 */
export const commissionShares = pgTable(
  "commission_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    // 0–100 percent of provider income
    sharePercent: numeric("share_percent", { precision: 7, scale: 4 }).notNull(),
    /** Slab bounds (₹, inclusive). Both null = service default; a matching slab row wins over it. */
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    /** Set = flat ₹ per txn instead of `share_percent` (which is then 0). */
    flatAmount: numeric("flat_amount", { precision: 10, scale: 4 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commission_shares_service_provider_role_idx").on(table.serviceId, table.providerId, table.role),
    index("commission_shares_active_idx").on(table.serviceId, table.isActive, table.effectiveFrom),
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
    /** Slab bounds (₹, inclusive). Both null = every amount of the service; the narrowest matching slab wins. */
    minAmount: numeric("min_amount", { precision: 14, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 14, scale: 2 }),
    /** Set = pay this % of what the provider pays (like a rate card share); `value` is then unused. */
    sharePercent: numeric("share_percent", { precision: 7, scale: 4 }),
    isActive: boolean("is_active").notNull().default(true),
    /** TCR06: override stops applying once expires_at <= now (null = never expires). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per user + service + slab (unique index on COALESCEd bounds lives in migration 0090).
    index("user_commission_rates_user_service_idx").on(table.userId, table.serviceId),
    index("user_commission_rates_user_idx").on(table.userId),
    index("user_commission_rates_expires_idx").on(table.expiresAt),
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
    /** false = GST added on top of the fee; true = fee already includes GST (GST = fee − fee ÷ 1.18). */
    gstOnFeeInclusive: boolean("gst_on_fee_inclusive").notNull().default(false),
    /** Provider side, read from the tenant default row only: GST billed to the provider on its payout. */
    providerOutputGstPercent: numeric("provider_output_gst_percent", { precision: 10, scale: 4 })
      .notNull()
      .default("18.0000"),
    /** Provider side, tenant default row only: TDS the provider deducts from its payout. */
    providerTdsPercent: numeric("provider_tds_percent", { precision: 10, scale: 4 }).notNull().default("2.0000"),
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

/** TCR05: audit row per CSV scheme import (dry runs are not stored). */
export const commissionSchemeImportBatches = pgTable(
  "commission_scheme_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    fileName: varchar("file_name", { length: 200 }),
    rowCount: integer("row_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("commission_scheme_import_batches_tenant_idx").on(table.tenantId, table.createdAt)],
);

/** TCR12: before/after trail for role-default rules and per-agent overrides. */
export const commissionRateChangeEvents = pgTable(
  "commission_rate_change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** `rule` (commission_rules) | `override` (user_commission_rates) | `share` | `provider_income` | `tax_config` | `customer_fee` */
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commission_rate_change_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("commission_rate_change_events_entity_idx").on(table.entityType, table.entityId),
  ],
);

/** TCR14: lock a tax month so rates cannot be changed retroactively after filing. */
export const commissionTaxMonthLocks = pgTable(
  "commission_tax_month_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** IST calendar month, YYYY-MM */
    yearMonth: varchar("year_month", { length: 7 }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    lockedBy: uuid("locked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    unlockReason: text("unlock_reason"),
  },
  (table) => [uniqueIndex("commission_tax_month_locks_tenant_month_key").on(table.tenantId, table.yearMonth)],
);

/** One admin rate card file import; `inverseChanges` restores the rates it replaced (undo within 24 h, once). */
export const rateCardImports = pgTable(
  "rate_card_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    reason: text("reason"),
    /** [{ serviceId, serviceName, providerName, changes }] */
    services: jsonb("services").notNull().default([]),
    changeCount: integer("change_count").notNull(),
    /** PendingChange-like writes, already in replay order. */
    inverseChanges: jsonb("inverse_changes").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneBy: uuid("undone_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("rate_card_imports_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

/**
 * Cash Collection (CMS) margins per biller from the provider sheet. All margins share the company margin's unit;
 * retailer + distributor + super <= company margin, AsanPay keeps the rest.
 */
export const cmsBillerRates = pgTable(
  "cms_biller_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billerId: varchar("biller_id", { length: 20 }).notNull(),
    billerName: varchar("biller_name", { length: 200 }).notNull(),
    companyMargin: numeric("company_margin", { precision: 10, scale: 6 }).notNull(),
    retailerMargin: numeric("retailer_margin", { precision: 10, scale: 6 }).notNull(),
    distributorMargin: numeric("distributor_margin", { precision: 10, scale: 6 }).notNull(),
    superMargin: numeric("super_margin", { precision: 10, scale: 6 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("cms_biller_rates_biller_id_key").on(table.billerId)],
);

/** One biller sheet upload; `undoPayload` = each touched biller's row before the upload (null = it was new). */
export const cmsBillerImports = pgTable(
  "cms_biller_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    reason: text("reason").notNull(),
    newCount: integer("new_count").notNull().default(0),
    changedCount: integer("changed_count").notNull().default(0),
    removedCount: integer("removed_count").notNull().default(0),
    undoPayload: jsonb("undo_payload").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneBy: uuid("undone_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("cms_biller_imports_tenant_created_idx").on(table.tenantId, table.createdAt)],
);
