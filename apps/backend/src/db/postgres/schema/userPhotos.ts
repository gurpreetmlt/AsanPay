import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Profile photo an agent sets from Settings (web + app). Kept out of `users` so user lists never
 * load image bytes. Base64 body only (no `data:` prefix); the client sends a ≤ 512 px JPEG/PNG/WebP.
 */
export const userPhotos = pgTable("user_photos", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentType: varchar("content_type", { length: 32 }).notNull(),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
