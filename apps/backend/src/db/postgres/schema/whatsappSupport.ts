import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * AsanPay WhatsApp Support inbox (not AsanConnect SaaS).
 * Droppable as a unit when WHATSAPP_SUPPORT_ENABLED stays off / module removed.
 * OTP auth does not depend on these tables.
 */

export const whatsappMessageDirectionEnum = pgEnum("whatsapp_message_direction", [
  "inbound",
  "outbound",
]);

export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Customer WhatsApp id (usually digits with country code, no +). */
    waId: varchar("wa_id", { length: 32 }).notNull(),
    phoneDisplay: varchar("phone_display", { length: 20 }),
    profileName: varchar("profile_name", { length: 120 }),
    /** Linked AsanPay user when mobile matches. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("whatsapp_conversations_wa_id_uidx").on(table.waId),
    index("whatsapp_conversations_last_message_idx").on(table.lastMessageAt),
    index("whatsapp_conversations_user_idx").on(table.userId),
  ],
);

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    /** Meta wamid — unique when present (inbound + outbound). */
    wamid: varchar("wamid", { length: 128 }),
    direction: whatsappMessageDirectionEnum("direction").notNull(),
    messageType: varchar("message_type", { length: 32 }).notNull().default("text"),
    body: text("body"),
    status: whatsappMessageStatusEnum("status").notNull().default("sent"),
    errorCode: varchar("error_code", { length: 32 }),
    errorMessage: text("error_message"),
    isOtp: boolean("is_otp").notNull().default(false),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    statusAt: timestamp("status_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("whatsapp_messages_wamid_uidx").on(table.wamid),
    index("whatsapp_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const whatsappWebhookEvents = pgTable(
  "whatsapp_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Idempotency key — wamid, status id+status, or hash of payload slice. */
    eventKey: varchar("event_key", { length: 191 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("whatsapp_webhook_events_event_key_uidx").on(table.eventKey)],
);

export const whatsappBroadcastStatusEnum = pgEnum("whatsapp_broadcast_status", [
  "queued",
  "sending",
  "completed",
  "cancelled",
]);

export const whatsappBroadcastRecipientStatusEnum = pgEnum("whatsapp_broadcast_recipient_status", [
  "pending",
  "sent",
  "failed",
  "skipped",
]);

export const whatsappBroadcasts = pgTable(
  "whatsapp_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    templateName: varchar("template_name", { length: 120 }).notNull(),
    templateLanguage: varchar("template_language", { length: 16 }).notNull().default("en"),
    /** Body variable {{1}} — same text for all recipients. */
    bodyText: text("body_text").notNull(),
    /** Agent roles included, e.g. ["retailer","distributor"]. */
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    status: whatsappBroadcastStatusEnum("status").notNull().default("queued"),
    totalCount: integer("total_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("whatsapp_broadcasts_created_at_idx").on(table.createdAt),
    index("whatsapp_broadcasts_status_idx").on(table.status),
  ],
);

export const whatsappBroadcastRecipients = pgTable(
  "whatsapp_broadcast_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => whatsappBroadcasts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mobile: varchar("mobile", { length: 15 }).notNull(),
    waId: varchar("wa_id", { length: 32 }).notNull(),
    status: whatsappBroadcastRecipientStatusEnum("status").notNull().default("pending"),
    wamid: varchar("wamid", { length: 128 }),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    index("whatsapp_broadcast_recipients_broadcast_idx").on(table.broadcastId, table.status),
    uniqueIndex("whatsapp_broadcast_recipients_broadcast_user_uidx").on(
      table.broadcastId,
      table.userId,
    ),
  ],
);
