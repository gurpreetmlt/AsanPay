import { bigserial, index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Upline-issued signup links: Super Distributor → Distributor, Distributor → Retailer.
 * Only the SHA-256 of the token is stored; the raw token lives in the emailed link.
 */
export const signupInvites = pgTable(
  "signup_invites",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    mobile: varchar("mobile", { length: 10 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("signup_invites_inviter_idx").on(t.inviterId, t.createdAt),
    index("signup_invites_mobile_idx").on(t.mobile),
  ],
);
