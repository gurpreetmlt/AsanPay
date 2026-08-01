import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { otpPurposeEnum } from "./enums";

// Security/action audit trail. No FK on userId — logging must succeed even for
// actions tied to a user that's since been deleted, or attempts by unknown mobiles.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    action: varchar("action", { length: 100 }).notNull(), // e.g. "auth.login", "auth.login_failed"
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

// Audit trail for every ops/retailer alert actually sent to Slack (debounced/suppressed
// alerts are not written here — see src/utils/alert.ts). Independent of Slack delivery
// success so a webhook outage never loses the record of what was detected.
export const alertLogs = pgTable(
  "alert_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertType: varchar("alert_type", { length: 60 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(), // "critical" | "general"
    retailerId: uuid("retailer_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    deliveredToSlack: boolean("delivered_to_slack").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alert_logs_type_idx").on(table.alertType),
    index("alert_logs_retailer_idx").on(table.retailerId),
    index("alert_logs_created_at_idx").on(table.createdAt),
  ],
);

export interface OtpMeta {
  /** Signup OTP */
  name?: string;
  sponsorUid?: string;
  /** Child role being created via public signup */
  childRole?: "master_distributor" | "distributor" | "retailer";
  /** Wallet pull OTP — parent collects from direct child */
  actorId?: string;
  targetUserId?: string;
  amount?: string;
  walletType?: string;
  /** Email verification OTP — address being verified, keyed by the user's mobile */
  email?: string;
}

// Login/signup OTPs. No native TTL in Postgres — rows are filtered by expiresAt on
// every read, and periodically swept by a setInterval in server.ts.
export const otpRequests = pgTable(
  "otp_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mobile: varchar("mobile", { length: 15 }).notNull(),
    otpHash: text("otp_hash").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Present for signup OTPs — name + distributor/sponsor UID.
    meta: jsonb("meta").$type<OtpMeta | null>(),
  },
  (table) => [
    index("otp_requests_mobile_idx").on(table.mobile),
    index("otp_requests_expires_at_idx").on(table.expiresAt),
  ],
);

// Raw provider request/response payloads — large, schemaless, only read during
// support/debugging. The transactions table stores only the small structured fields.
export const providerLogs = pgTable(
  "provider_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txnRef: varchar("txn_ref", { length: 40 }),
    providerCode: varchar("provider_code", { length: 60 }).notNull(),
    operation: varchar("operation", { length: 60 }).notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().notNull().default({}),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 30 }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("provider_logs_txn_ref_idx").on(table.txnRef),
    index("provider_logs_provider_code_idx").on(table.providerCode),
    index("provider_logs_created_at_idx").on(table.createdAt),
  ],
);
