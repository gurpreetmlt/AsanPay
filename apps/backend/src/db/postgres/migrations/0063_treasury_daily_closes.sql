CREATE TABLE IF NOT EXISTS "treasury_daily_closes" (
  "id" bigserial PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "business_date" date NOT NULL,
  "closed_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "closed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "note" text,
  "snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "treasury_daily_closes_tenant_date_uidx"
  ON "treasury_daily_closes" ("tenant_id", "business_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "treasury_daily_closes_tenant_closed_idx"
  ON "treasury_daily_closes" ("tenant_id", "closed_at");
