ALTER TABLE "wallets" ADD COLUMN "hold_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_hold_balance_nonnegative" CHECK ("wallets"."hold_balance" >= 0);
