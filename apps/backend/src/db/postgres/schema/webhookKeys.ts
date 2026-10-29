import { pgTable, uuid, varchar, text, integer, timestamp, index, jsonb } from "drizzle-orm/pg-core";
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
    /** Company that holds this key (e.g. "Noble Web Studio"). Null = the provider label. */
    vendorName: varchar("vendor_name", { length: 120 }),
    contactName: varchar("contact_name", { length: 80 }),
    contactEmail: varchar("contact_email", { length: 150 }),
    contactPhone: varchar("contact_phone", { length: 20 }),
    /** dev | live. Null = whatever this server is. */
    environment: varchar("environment", { length: 8 }),
    notes: varchar("notes", { length: 300 }),
    /** Services this key is used for, from the provider's allowed list (e.g. ["UPI QR","CMS"]). */
    services: jsonb("services").$type<string[]>().notNull().default([]),
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

/** One row per incoming callback (latest 500 per provider). Never stores the token. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 30 }).notNull(),
    keyId: uuid("key_id").references(() => webhookKeys.id, { onDelete: "set null" }),
    /** ok | bad_token | no_token | error | test */
    result: varchar("result", { length: 16 }).notNull(),
    httpStatus: integer("http_status"),
    ip: varchar("ip", { length: 64 }),
    txnRef: varchar("txn_ref", { length: 80 }),
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("webhook_deliveries_key_created_idx").on(t.keyId, t.createdAt.desc()),
    index("webhook_deliveries_provider_created_idx").on(t.provider, t.createdAt.desc()),
  ],
);
