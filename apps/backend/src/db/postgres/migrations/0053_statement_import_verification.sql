ALTER TABLE "bank_statement_imports" ADD COLUMN IF NOT EXISTS "account_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "bank_statement_imports" ADD COLUMN IF NOT EXISTS "verification" varchar(12);
