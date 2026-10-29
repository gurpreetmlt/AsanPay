CREATE TABLE IF NOT EXISTS "rate_card_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"admin_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"file_name" varchar(200) NOT NULL,
	"reason" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_count" integer NOT NULL,
	"inverse_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_card_imports_tenant_created_idx" ON "rate_card_imports" ("tenant_id", "created_at" DESC);
