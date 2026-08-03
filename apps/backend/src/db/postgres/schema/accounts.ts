import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  uuid,
  varchar,
  text,
  char,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// Chart of accounts. Every account resolves by (tenant_id, code) — nothing is hardcoded,
// so adding a bank or an aggregator is an INSERT, not a code change.

export const accountTypeEnum = pgEnum("account_type", [
  "treasury",
  "company",
  "sd",
  "distributor",
  "retailer",
  "bank",
  "transit",
  "float",
  "control",
  "suspense",
  "settlement",
  "income",
  "expense",
]);

// Determines the normal balance side AND whether a debit needs a balance check.
// Only "liability" (agent wallets) is hard balance-checked and row-locked — system accounts
// are never locked, which is what keeps COMPANY_001 off the hot path.
export const accountClassEnum = pgEnum("account_class", [
  "asset",
  "liability",
  "internal",
  "income",
  "expense",
]);

export const accountScopeEnum = pgEnum("account_scope", ["platform", "tenant"]);

export const accountStatusEnum = pgEnum("account_status", ["active", "inactive", "closed"]);

export const accounts = pgTable(
  "accounts",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    accountClass: accountClassEnum("account_class").notNull(),
    parentId: bigint("parent_id", { mode: "bigint" }).references((): AnyPgColumn => accounts.id, {
      onDelete: "restrict",
    }),
    scope: accountScopeEnum("scope").notNull().default("tenant"),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    // Hierarchy wallets belong to a user; system accounts belong to no one (see CHECK below).
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),

    isSystem: boolean("is_system").notNull().default(false),
    isProtected: boolean("is_protected").notNull().default(false),
    isHidden: boolean("is_hidden").notNull().default(false),
    requiresBalanceCheck: boolean("requires_balance_check").notNull().default(false),

    // Granular blocks — never collapse these into one is_blocked boolean. Blocking an agent's
    // services must not trap the money they already earned, so block_settlement is a separate
    // decision requiring a named approver and a written reason.
    blockServices: boolean("block_services").notNull().default(false),
    blockTopup: boolean("block_topup").notNull().default(false),
    blockSettlement: boolean("block_settlement").notNull().default(false),
    blockLogin: boolean("block_login").notNull().default(false),
    blockReason: text("block_reason"),
    blockedBy: uuid("blocked_by").references(() => users.id, { onDelete: "set null" }),
    blockedAt: timestamp("blocked_at", { withTimezone: true }),

    status: accountStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_tenant_code_uidx").on(table.tenantId, table.code),
    index("accounts_tenant_type_idx").on(table.tenantId, table.accountType),
    index("accounts_user_idx").on(table.userId).where(sql`${table.userId} is not null`),
    // A system account can never be owned by a user — that is how a treasury account would
    // otherwise be mistaken for a hierarchy wallet.
    check(
      "accounts_system_has_no_user",
      sql`NOT (${table.isSystem} AND ${table.userId} IS NOT NULL)`,
    ),
  ],
);

// Cached projection of the ledger, written in the SAME transaction as the entries.
// Never written outside core/ledger.postJournal().
export const accountBalances = pgTable(
  "account_balances",
  {
    accountId: bigint("account_id", { mode: "bigint" })
      .primaryKey()
      .references(() => accounts.id, { onDelete: "restrict" }),
    // Paise. Total book balance.
    // Defaults are SQL literals, not JS BigInt — drizzle-kit cannot serialize a BigInt into
    // its snapshot JSON, so `.default(0n)` breaks `db:generate`.
    balance: bigint("balance", { mode: "bigint" }).notNull().default(sql`0`),
    // Paise. The earned portion (AePS/microATM/Aadhaar-pay credits + commission payouts) that
    // may be withdrawn to the agent's own bank. The remainder is a prepaid advance against
    // services and is spendable but NOT withdrawable.
    settleable: bigint("settleable", { mode: "bigint" }).notNull().default(sql`0`),
    version: bigint("version", { mode: "bigint" }).notNull().default(sql`0`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "account_balances_settleable_within_balance",
      sql`${table.settleable} >= 0 AND ${table.settleable} <= ${table.balance}`,
    ),
  ],
);

// The "liability balance >= 0" rule (no overdraft, ever) cannot be a CHECK — Postgres CHECK
// cannot contain the subquery needed to read accounts.account_class. It is enforced by the
// trg_no_overdraft BEFORE UPDATE trigger in migrations/custom. See 0022_ledger_guards.sql.
