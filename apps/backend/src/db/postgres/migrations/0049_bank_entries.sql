CREATE TABLE IF NOT EXISTS "bank_entries" (
  "id" bigserial PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "bank_account_id" bigint REFERENCES "bank_accounts"("id") ON DELETE restrict,
  "provider_id" uuid REFERENCES "providers"("id") ON DELETE restrict,
  "category" varchar(40) NOT NULL,
  "direction" varchar(6) NOT NULL,
  "amount" bigint NOT NULL,
  "txn_date" date NOT NULL,
  "mode" varchar(10) NOT NULL,
  "utr" varchar(40),
  "party_name" varchar(120),
  "party_ifsc" varchar(11),
  "party_account_last4" varchar(4),
  "narration" text,
  "attachment_name" varchar(160),
  "attachment_data_url" text,
  "status" "maker_checker_status" NOT NULL DEFAULT 'requested',
  "requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE restrict,
  "decision_note" text,
  "journal_id" bigint REFERENCES "journals"("id") ON DELETE restrict,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "decided_at" timestamp with time zone,
  CONSTRAINT "bank_entries_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "bank_entries_direction_valid" CHECK ("direction" IN ('credit', 'debit', 'none')),
  CONSTRAINT "bank_entries_maker_is_not_checker" CHECK ("approved_by" IS NULL OR "approved_by" <> "requested_by"),
  CONSTRAINT "bank_entries_approved_has_journal" CHECK ("status" <> 'approved' OR "journal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_entries_tenant_status_idx" ON "bank_entries" ("tenant_id", "status", "txn_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_entries_utr_uidx" ON "bank_entries" ("tenant_id", "utr") WHERE "utr" IS NOT NULL AND "status" <> 'rejected';
