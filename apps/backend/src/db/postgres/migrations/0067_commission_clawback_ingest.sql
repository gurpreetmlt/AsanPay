-- TC18: clawback marker on commission_ledger (partial unique for active rows)
-- TC15: raw provider commission ingest store (parse rules await sample payload)
ALTER TABLE "commission_ledger" ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone;
--> statement-breakpoint
DROP INDEX IF EXISTS "commission_ledger_txn_beneficiary_key";
--> statement-breakpoint
CREATE UNIQUE INDEX "commission_ledger_txn_beneficiary_key"
  ON "commission_ledger" ("transaction_id", "beneficiary_user_id")
  WHERE "reversed_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_commission_ingest" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_code" varchar(40) NOT NULL,
  "external_ref" varchar(120),
  "payload" jsonb NOT NULL,
  "parse_status" varchar(20) NOT NULL DEFAULT 'stored',
  "parse_note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_commission_ingest_provider_idx"
  ON "provider_commission_ingest" ("provider_code", "created_at");
