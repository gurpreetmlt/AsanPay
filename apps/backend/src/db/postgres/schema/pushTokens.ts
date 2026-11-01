import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * FCM registration token per signed-in app install. `device_id` is the per-install id from the
 * mobile app (same value the trusted-device login uses), so a reinstall gets a fresh row.
 * One FCM token belongs to one install, so registering it for a new user removes it from the old one.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 80 }).notNull(),
    token: text("token").notNull(),
    /** android | ios */
    platform: varchar("platform", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("push_tokens_user_device_uidx").on(table.userId, table.deviceId),
    index("push_tokens_token_idx").on(table.token),
  ],
);
