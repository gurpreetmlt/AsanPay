-- Per-agent commission by slab: an override can cover one amount slab and pay a share of what the
-- provider pays. Existing rows (no bounds, no share) keep working as before.
ALTER TABLE "user_commission_rates" ADD COLUMN IF NOT EXISTS "min_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "user_commission_rates" ADD COLUMN IF NOT EXISTS "max_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "user_commission_rates" ADD COLUMN IF NOT EXISTS "share_percent" numeric(7, 4);
--> statement-breakpoint
DROP INDEX IF EXISTS "user_commission_rates_user_service_key";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_commission_rates_user_service_slab_key"
  ON "user_commission_rates" ("user_id", "service_id", COALESCE("min_amount", -1), COALESCE("max_amount", -1));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_commission_rates_user_service_idx" ON "user_commission_rates" ("user_id", "service_id");
