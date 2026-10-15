ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "holder_name" varchar(160);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "account_type" varchar(20);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "branch_name" varchar(120);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "branch_code" varchar(20);
