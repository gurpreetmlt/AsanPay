CREATE TABLE IF NOT EXISTS "bank_entry_category_rules" (
  "id" bigserial PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "utr_prefix" varchar(32) NOT NULL,
  "category" varchar(40) NOT NULL,
  "bank_account_id" bigint REFERENCES "bank_accounts"("id") ON DELETE cascade,
  "is_active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_entry_category_rules_global_uidx"
  ON "bank_entry_category_rules" ("tenant_id", "utr_prefix")
  WHERE "bank_account_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_entry_category_rules_bank_uidx"
  ON "bank_entry_category_rules" ("tenant_id", "utr_prefix", "bank_account_id")
  WHERE "bank_account_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_entry_category_rules_tenant_active_idx"
  ON "bank_entry_category_rules" ("tenant_id", "is_active");
