ALTER TABLE "account_balances" DROP CONSTRAINT "account_balances_settleable_within_balance";--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_settleable_within_balance" CHECK ("account_balances"."settleable" >= 0 AND ("account_balances"."settleable" = 0 OR "account_balances"."settleable" <= "account_balances"."balance"));
