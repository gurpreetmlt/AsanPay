CREATE TABLE IF NOT EXISTS "bank_daily_balance_locks" (
  "id" bigserial PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "bank_account_id" bigint NOT NULL REFERENCES "bank_accounts"("id") ON DELETE restrict,
  "business_date" date NOT NULL,
  "statement_opening" bigint,
  "statement_closing" bigint,
  "books_opening" bigint NOT NULL,
  "books_closing" bigint NOT NULL,
  "closing_diff" bigint,
  "locked_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "locked_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_daily_balance_locks_bank_date_uidx"
  ON "bank_daily_balance_locks" ("bank_account_id", "business_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_daily_balance_locks_tenant_date_idx"
  ON "bank_daily_balance_locks" ("tenant_id", "business_date");
