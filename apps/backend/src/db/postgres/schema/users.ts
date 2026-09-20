import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { userRoleEnum, kycStatusEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Public agent code — legacy RT/DS/MD/AD+hex; new = ASPRT/ASPD/ASPSD/ASPAD + sequential digits
    uid: varchar("uid", { length: 20 }).notNull().unique(),
    // who onboarded this user — null only for the root admin
    parentId: uuid("parent_id").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    role: userRoleEnum("role").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    mobile: varchar("mobile", { length: 15 }).notNull().unique(),
    email: varchar("email", { length: 150 }).unique(),
    // Set when the address is confirmed via an email_verify OTP. Invoices and
    // statements are only sent to a verified address.
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Opt-in for rare product update emails (P3). Transactional mail ignores this. */
    emailMarketingOptIn: boolean("email_marketing_opt_in").notNull().default(false),
    passwordHash: text("password_hash").notNull(),
    // 4-6 digit transaction PIN (bcrypt) — required on every money-moving endpoint,
    // separate from the login password so a hijacked session alone can't move funds.
    txnPinHash: text("txn_pin_hash"),
    txnPinFailedAttempts: integer("txn_pin_failed_attempts").notNull().default(0),
    txnPinLockedUntil: timestamp("txn_pin_locked_until", { withTimezone: true }),
    // 4-digit login MPIN (bcrypt) — quick unlock on mobile Welcome-back screen.
    loginMpinHash: text("login_mpin_hash"),
    // Retailer's OWN biometric proof-of-presence at the counter — separate from the customer's
    // AEPS biometric. AEPS/DMT operations require this once per India calendar day.
    // Null = never agent-authed on record.
    lastAgentAuthAt: timestamp("last_agent_auth_at", { withTimezone: true }),
    // PAN/Aadhaar stored AES-256-GCM encrypted at rest, never in plaintext
    panNumberEncrypted: text("pan_number_encrypted"),
    aadhaarNumberEncrypted: text("aadhaar_number_encrypted"),
    kycStatus: kycStatusEnum("kyc_status").notNull().default("pending"),
    /** InstantPay merchant outlet id from onboarding — required for sandbox/live AEPS. */
    instantpayOutletId: varchar("instantpay_outlet_id", { length: 64 }),
    /** Registered business geo (degrees). Used for AEPS geofence checks. */
    outletLatitude: varchar("outlet_latitude", { length: 32 }),
    outletLongitude: varchar("outlet_longitude", { length: 32 }),
    /** Last successful AEPS / Aadhaar Pay txn — dormancy = inactivity > AEPS_DORMANCY_DAYS. */
    lastAepsTxnAt: timestamp("last_aeps_txn_at", { withTimezone: true }),
    /** Extended Due Diligence required after repeated biometric mismatches. */
    aepsEddRequired: boolean("aeps_edd_required").notNull().default(false),
    /** Soft-block reason for AEPS (e.g. bio_mismatch). Null = not blocked. */
    aepsBlockReason: varchar("aeps_block_reason", { length: 120 }),
    /**
     * When an admin last re-admitted this merchant after a block or dormancy, on re-verified KYC.
     * The dormancy gate anchors on the later of this and `lastAepsTxnAt`: without it a dormant
     * merchant can never transact, so the transaction anchor can never advance, and the block
     * has no exit.
     */
    aepsReactivatedAt: timestamp("aeps_reactivated_at", { withTimezone: true }),
    /** Retailer-pinned AePS bank ids (shared web + mobile). Null = use client defaults. */
    aepsFavouriteBankIds: jsonb("aeps_favourite_bank_ids").$type<string[] | null>(),
    /** Optional per-retailer daily transaction ceiling for alerting. Null = no limit configured. */
    dailyLimitAmount: numeric("daily_limit_amount", { precision: 14, scale: 2 }),
    /**
     * Telegram chat id for OTP delivery (interim until SMS). Null = not linked.
     * Unique when set so one chat cannot receive OTPs for multiple accounts.
     */
    telegramChatId: varchar("telegram_chat_id", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_parent_id_idx").on(table.parentId),
    index("users_role_idx").on(table.role),
  ],
);

/** One-time tokens for t.me/Bot?start=link_<token> deep links. */
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    token: varchar("token", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("telegram_link_tokens_user_id_idx").on(table.userId)],
);

// Closure table: one row per (ancestor, descendant) pair, including depth-0 self rows.
// Lets the commission engine fetch "everyone above this retailer" in a single indexed query
// instead of walking parentId recursively on every transaction.
export const userHierarchy = pgTable(
  "user_hierarchy",
  {
    ancestorId: uuid("ancestor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    descendantId: uuid("descendant_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    depth: integer("depth").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ancestorId, table.descendantId] }),
    index("user_hierarchy_descendant_idx").on(table.descendantId),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    deviceInfo: varchar("device_info", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("refresh_tokens_user_idx").on(table.userId)],
);
