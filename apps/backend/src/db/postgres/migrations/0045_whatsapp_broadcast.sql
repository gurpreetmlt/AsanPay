-- WhatsApp Support Phase 3 — template broadcasts + per-recipient status.
DO $$ BEGIN
  CREATE TYPE "whatsapp_broadcast_status" AS ENUM ('queued', 'sending', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_broadcast_recipient_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_broadcasts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "template_name" varchar(120) NOT NULL,
  "template_language" varchar(16) NOT NULL DEFAULT 'en',
  "body_text" text NOT NULL,
  "roles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" "whatsapp_broadcast_status" NOT NULL DEFAULT 'queued',
  "total_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whatsapp_broadcasts_created_at_idx" ON "whatsapp_broadcasts" ("created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_broadcasts_status_idx" ON "whatsapp_broadcasts" ("status");

CREATE TABLE IF NOT EXISTS "whatsapp_broadcast_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "broadcast_id" uuid NOT NULL REFERENCES "whatsapp_broadcasts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mobile" varchar(15) NOT NULL,
  "wa_id" varchar(32) NOT NULL,
  "status" "whatsapp_broadcast_recipient_status" NOT NULL DEFAULT 'pending',
  "wamid" varchar(128),
  "error_message" text,
  "sent_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "whatsapp_broadcast_recipients_broadcast_idx"
  ON "whatsapp_broadcast_recipients" ("broadcast_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_broadcast_recipients_broadcast_user_uidx"
  ON "whatsapp_broadcast_recipients" ("broadcast_id", "user_id");
