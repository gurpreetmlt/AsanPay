import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Agents allowed to use a service group during the night service window (admin → agent → Controls).
 * `until` null = always open at night; otherwise the exception ends by itself at that instant.
 */
export const nightServiceExceptions = pgTable(
  "night_service_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** aeps | dmt | bbps | recharge | cms */
    serviceGroup: varchar("service_group", { length: 16 }).notNull(),
    /** Null = open from the moment it was saved. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    until: timestamp("until", { withTimezone: true }),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("night_service_exceptions_user_group_key").on(t.userId, t.serviceGroup)],
);
