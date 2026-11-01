import { pgTable, uuid, varchar, smallint, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const LOGIN_APPROVAL_STATUSES = ["pending", "approved", "denied", "expired"] as const;
export type LoginApprovalStatus = (typeof LOGIN_APPROVAL_STATUSES)[number];

/**
 * Agent web sign-in waiting for a tap on the user's trusted phone. The browser polls with a
 * one-time secret (only its hash is stored); the phone decides by picking `match_number`
 * out of `match_choices`. Tokens are issued once, on the first poll after approval.
 */
export const loginApprovals = pgTable(
  "login_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending | approved | denied | expired */
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    matchNumber: smallint("match_number").notNull(),
    matchChoices: jsonb("match_choices").$type<number[]>().notNull(),
    /** e.g. "Chrome on macOS" — shown on the phone. */
    browser: varchar("browser", { length: 150 }),
    ip: varchar("ip", { length: 64 }),
    city: varchar("city", { length: 80 }),
    userAgent: varchar("user_agent", { length: 300 }),
    /** Browser device id (agent web localStorage) — trusted on approve. */
    deviceId: varchar("device_id", { length: 100 }),
    /** password | otp */
    loginMethod: varchar("login_method", { length: 10 }).notNull(),
    pollTokenHash: varchar("poll_token_hash", { length: 64 }).notNull(),
    /** Why it was denied: user | wrong_number. */
    denyReason: varchar("deny_reason", { length: 20 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Phone that approved / denied. */
    decidedDeviceId: varchar("decided_device_id", { length: 100 }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("login_approvals_user_status_idx").on(table.userId, table.status, table.expiresAt)],
);
