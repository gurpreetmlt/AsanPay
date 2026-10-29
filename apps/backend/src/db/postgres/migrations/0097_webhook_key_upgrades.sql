ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "services" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE "webhook_keys" SET "services" = CASE "provider"
	WHEN 'noble' THEN '["UPI QR","Recharge","CMS"]'::jsonb
	WHEN 'vyaparapi' THEN '["Recharge"]'::jsonb
	WHEN 'telegram' THEN '["Bot updates"]'::jsonb
	WHEN 'whatsapp' THEN '["Support inbox"]'::jsonb
	ELSE '[]'::jsonb
END
WHERE "services" = '[]'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(30) NOT NULL,
	"key_id" uuid REFERENCES "webhook_keys"("id") ON DELETE SET NULL,
	"result" varchar(16) NOT NULL,
	"http_status" integer,
	"ip" varchar(64),
	"txn_ref" varchar(80),
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_key_created_idx" ON "webhook_deliveries" ("key_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_provider_created_idx" ON "webhook_deliveries" ("provider", "created_at" DESC);
