-- Bank account check result for an agent settlement bank (name as per bank + which check answered).
-- bank_check_status: verified | not_confirmed | pending | error (NULL = never checked).
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_check_status" varchar(16);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_holder_name" varchar(160);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_check_method" varchar(12);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_check_ref" varchar(40);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_check_message" varchar(200);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "bank_checked_at" timestamp with time zone;
