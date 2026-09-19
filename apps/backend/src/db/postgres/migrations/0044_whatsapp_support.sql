-- AsanPay WhatsApp Support inbox (Admin). OTP does not depend on these tables.
DO $$ BEGIN
  CREATE TYPE "whatsapp_message_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_status" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wa_id" varchar(32) NOT NULL,
  "phone_display" varchar(20),
  "profile_name" varchar(120),
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "last_message_at" timestamptz,
  "last_inbound_at" timestamptz,
  "last_message_preview" text,
  "unread_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversations_wa_id_uidx" ON "whatsapp_conversations" ("wa_id");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_idx" ON "whatsapp_conversations" ("last_message_at");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_user_idx" ON "whatsapp_conversations" ("user_id");

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
  "wamid" varchar(128),
  "direction" "whatsapp_message_direction" NOT NULL,
  "message_type" varchar(32) NOT NULL DEFAULT 'text',
  "body" text,
  "status" "whatsapp_message_status" NOT NULL DEFAULT 'sent',
  "error_code" varchar(32),
  "error_message" text,
  "is_otp" boolean NOT NULL DEFAULT false,
  "raw" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "status_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_wamid_uidx" ON "whatsapp_messages" ("wamid");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_idx" ON "whatsapp_messages" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "whatsapp_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_key" varchar(191) NOT NULL,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_webhook_events_event_key_uidx" ON "whatsapp_webhook_events" ("event_key");
