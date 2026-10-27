-- Every provider hit of a bank account check is logged (verified or not) with what it cost us,
-- so failed hits the company pays for are visible. Only `verified` rows are reused as a cache.
ALTER TABLE "bank_name_checks" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'verified' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_name_checks" ADD COLUMN IF NOT EXISTS "cost_rupees" numeric(8, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_name_checks" ADD COLUMN IF NOT EXISTS "purpose" varchar(20) DEFAULT 'dmt_payee' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_name_checks" ADD COLUMN IF NOT EXISTS "detail" varchar(200);
--> statement-breakpoint
ALTER TABLE "bank_name_checks" ALTER COLUMN "txn_ref" DROP NOT NULL;
