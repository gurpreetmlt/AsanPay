import { pgTable, uuid, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Same-person account links (one Distributor + one Retailer, max 2 per group). A user belongs to
 * at most one group. Unlink deletes the whole group; history lives in `audit_logs`.
 * `otp_verified_at` / switch counters are about switching INTO this row's user.
 */
export const linkedAccounts = pgTable(
  "linked_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedByUserId: uuid("linked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    linkMethod: varchar("link_method", { length: 10 }).notNull().default("otp"),
    otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
    switchFailedAttempts: integer("switch_failed_attempts").notNull().default(0),
    switchLockedUntil: timestamp("switch_locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("linked_accounts_user_uq").on(table.userId),
    index("linked_accounts_group_idx").on(table.groupId),
  ],
);
