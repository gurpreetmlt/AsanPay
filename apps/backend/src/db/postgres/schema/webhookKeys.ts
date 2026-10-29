import { pgTable, uuid, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Shared secrets providers send with callbacks (Admin → Webhooks & keys). The secret is stored
 * AES-encrypted; only the last 4 characters are kept in clear for display.
 */
export const webhookKeys = pgTable(
  "webhook_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** noble | vyaparapi | telegram | whatsapp */
    provider: varchar("provider", { length: 30 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    notes: varchar("notes", { length: 300 }),
    secretEncrypted: text("secret_encrypted").notNull(),
    secretLast4: varchar("secret_last4", { length: 4 }).notNull(),
    /** generated | pasted */
    source: varchar("source", { length: 12 }).notNull(),
    /** active | disabled */
    status: varchar("status", { length: 12 }).notNull().default("active"),
    /** Set on the old key when it is rotated; the key stops matching after this. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedFromId: uuid("rotated_from_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [index("webhook_keys_provider_status_idx").on(t.provider, t.status)],
);
