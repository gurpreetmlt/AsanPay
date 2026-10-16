-- TCR05–TCR14: scheme CSV import audit, override expiry, rate change events, tax month locks
CREATE TABLE IF NOT EXISTS "commission_scheme_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "admin_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "file_name" varchar(200),
  "row_count" integer NOT NULL DEFAULT 0,
  "created_count" integer NOT NULL DEFAULT 0,
  "updated_count" integer NOT NULL DEFAULT 0,
  "skipped_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_scheme_import_batches_tenant_idx"
  ON "commission_scheme_import_batches" ("tenant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "user_commission_rates" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_commission_rates_expires_idx"
  ON "user_commission_rates" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_rate_change_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "admin_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "entity_type" varchar(20) NOT NULL,
  "entity_id" uuid NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "service_id" uuid REFERENCES "services"("id") ON DELETE set null,
  "before" jsonb,
  "after" jsonb,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_rate_change_events_tenant_created_idx"
  ON "commission_rate_change_events" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_rate_change_events_entity_idx"
  ON "commission_rate_change_events" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_tax_month_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "year_month" varchar(7) NOT NULL,
  "locked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "locked_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "unlocked_at" timestamp with time zone,
  "unlock_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commission_tax_month_locks_tenant_month_key"
  ON "commission_tax_month_locks" ("tenant_id", "year_month");
