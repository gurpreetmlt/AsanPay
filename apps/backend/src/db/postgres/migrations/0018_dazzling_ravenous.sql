CREATE TYPE "public"."wallet_kind" AS ENUM('ledger', 'aggregator');--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "wallet_kind" "wallet_kind" DEFAULT 'ledger' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_rules_service_provider_role_idx" ON "commission_rules" USING btree ("service_id","provider_id","role");--> statement-breakpoint
-- Backfill: mark the existing root admin's main wallet as the aggregator wallet so
-- getSystemWallet()/commission distribution keep resolving to it after this migration
-- (previously found via role=admin + parentId IS NULL; now found via wallet_kind).
UPDATE "wallets"
SET "wallet_kind" = 'aggregator'
WHERE "wallet_type" = 'main'
  AND "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin' AND "parent_id" IS NULL);
