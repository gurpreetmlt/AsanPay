-- GST on the customer fee: false = added on top of the fee (current behaviour), true = already inside the fee.
ALTER TABLE "tax_service_configs" ADD COLUMN IF NOT EXISTS "gst_on_fee_inclusive" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Provider side (read from the tenant default row): GST we bill the provider on its payout, TDS it deducts.
ALTER TABLE "tax_service_configs" ADD COLUMN IF NOT EXISTS "provider_output_gst_percent" numeric(10, 4) DEFAULT '18.0000' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tax_service_configs" ADD COLUMN IF NOT EXISTS "provider_tds_percent" numeric(10, 4) DEFAULT '2.0000' NOT NULL;
