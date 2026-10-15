ALTER TABLE "bank_entries" ADD COLUMN IF NOT EXISTS "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD COLUMN IF NOT EXISTS "reversed_by" uuid REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD COLUMN IF NOT EXISTS "reversal_journal_id" bigint REFERENCES "journals"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "bank_entries" ADD COLUMN IF NOT EXISTS "reverse_reason" text;--> statement-breakpoint
DROP INDEX IF EXISTS "bank_entries_utr_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_entries_utr_uidx" ON "bank_entries" ("tenant_id", "utr") WHERE "utr" IS NOT NULL AND "status" <> 'rejected' AND "reversed_at" IS NULL;
