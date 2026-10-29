CREATE TABLE IF NOT EXISTS "webhook_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"notes" varchar(300),
	"secret_encrypted" text NOT NULL,
	"secret_last4" varchar(4) NOT NULL,
	"source" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"rotated_from_id" uuid,
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_keys_provider_status_idx" ON "webhook_keys" ("provider", "status");
