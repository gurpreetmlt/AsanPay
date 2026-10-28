-- Per-slab role split: a share row can cover one amount slab (min/max, inclusive) and can pay a
-- flat ₹ per txn instead of a % of provider income. Rows without bounds stay the service default.
ALTER TABLE "commission_shares" ADD COLUMN IF NOT EXISTS "min_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "commission_shares" ADD COLUMN IF NOT EXISTS "max_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "commission_shares" ADD COLUMN IF NOT EXISTS "flat_amount" numeric(10, 4);
