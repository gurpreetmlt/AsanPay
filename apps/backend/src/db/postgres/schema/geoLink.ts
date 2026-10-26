import { pgTable, uuid, varchar, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Web → phone location hand-off. The web shows a QR with `token`; the same user scans it in the
 * mobile app, which posts the phone's GPS. Browser geolocation on desktops is IP-based and easy
 * to fake, so web AEPS / onboarding use these coordinates instead.
 * status: pending → verified (phone posted GPS) → used (consumed by a web submit).
 */
export const geoLinkRequests = pgTable(
  "geo_link_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    accuracyMeters: integer("accuracy_meters"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("geo_link_requests_user_created_idx").on(table.userId, table.createdAt)],
);
