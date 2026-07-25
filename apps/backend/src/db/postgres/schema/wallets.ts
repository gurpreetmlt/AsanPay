import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { walletTypeEnum, ledgerEntryTypeEnum } from "./enums";
import { users } from "./users";

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletType: walletTypeEnum("wallet_type").notNull().default("main"),
    // Available (spendable) balance — cached, source of truth is the sum of wallet_ledger_entries,
    // updated inside the same DB transaction under SELECT FOR UPDATE (see wallet service).
    balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
    // Amount currently reserved against an in-flight debit-direction transaction (service_txn
    // already moved out of `balance` into the system wallet, but the provider hasn't confirmed
    // success/failure yet). Released back to 0 when the transaction resolves. Purely a bookkeeping
    // mirror for retailer-facing "Locked vs Available" reporting — does not itself hold money.
    holdBalance: numeric("hold_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    // optimistic-lock guard used alongside row locking to detect lost updates
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallets_user_id_wallet_type_key").on(table.userId, table.walletType),
    check("wallets_balance_nonnegative", sql`${table.balance} >= 0`),
    check("wallets_hold_balance_nonnegative", sql`${table.holdBalance} >= 0`),
  ],
);

// Journal header — one row per business event that moves money (a transaction, a commission
// payout, a manual topup/adjustment, a reversal). Every entry below must net to zero per group.
export const walletLedgerGroups = pgTable(
  "wallet_ledger_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceType: varchar("reference_type", { length: 40 }).notNull(),
    referenceId: uuid("reference_id"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wallet_ledger_groups_reference_idx").on(table.referenceType, table.referenceId),
    // Defense-in-depth: one ledger group per (type, business ref) for service_txn/reversal —
    // Finalize already row-locks, this blocks a second accidental insert. EXCLUDES "commission":
    // that referenceType fans out to one group per beneficiary (retailer's distributor, master
    // distributor, ...) sharing the same referenceId (the settled txn) by design — collapsing
    // them to one row would silently drop every beneficiary after the first. commission_ledger's
    // own (transactionId, beneficiaryUserId) unique key is what guards against a duplicate payout
    // there.
    uniqueIndex("wallet_ledger_groups_ref_uidx")
      .on(table.referenceType, table.referenceId)
      .where(sql`${table.referenceId} is not null and ${table.referenceType} <> 'commission'`),
  ],
);

// Double-entry lines. amount is always positive; direction is carried by entryType.
export const walletLedgerEntries = pgTable(
  "wallet_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => walletLedgerGroups.id, { onDelete: "restrict" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wallet_ledger_entries_wallet_idx").on(table.walletId, table.createdAt),
    index("wallet_ledger_entries_group_idx").on(table.groupId),
    check("wallet_ledger_entries_amount_positive", sql`${table.amount} > 0`),
  ],
);

/** Per-user idempotency for admin fund / downline transfer (prevents double-submit). */
export const walletIdempotency = pgTable(
  "wallet_idempotency",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    ledgerGroupId: uuid("ledger_group_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.idempotencyKey] })],
);
