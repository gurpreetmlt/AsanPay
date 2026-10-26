import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per agent per accepted legal bundle (`POLICY_VERSION` in shared-types, e.g.
 * `T1.1-P1.0-E1.0`). Login is blocked until a row exists for the current version, so bumping the
 * version makes every agent accept again. Never store OTPs or passwords here.
 */
export const policyAcceptances = pgTable(
  "policy_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    policyVersion: varchar("policy_version", { length: 40 }).notNull(),
    channel: varchar("channel", { length: 10 }).notNull(),
    loginMethod: varchar("login_method", { length: 10 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 300 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("policy_acceptances_user_version_uq").on(table.userId, table.policyVersion)],
);
