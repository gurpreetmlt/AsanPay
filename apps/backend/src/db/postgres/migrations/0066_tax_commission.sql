-- TC02/TC03: per-service tax config + commission_ledger tax columns + txn fee GST
CREATE TABLE IF NOT EXISTS "tax_service_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "service_id" uuid REFERENCES "services"("id") ON DELETE cascade,
  "tds_applies" boolean NOT NULL DEFAULT true,
  "tds_percent" numeric(10, 4) NOT NULL DEFAULT '2.0000',
  "gst_on_fee_applies" boolean NOT NULL DEFAULT false,
  "gst_on_fee_percent" numeric(10, 4) NOT NULL DEFAULT '18.0000',
  "effective_from" timestamp with time zone NOT NULL DEFAULT now(),
  "effective_to" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_service_configs_tenant_active_idx"
  ON "tax_service_configs" ("tenant_id", "is_active", "effective_from");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_service_configs_tenant_service_idx"
  ON "tax_service_configs" ("tenant_id", "service_id");
--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD COLUMN IF NOT EXISTS "gross_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD COLUMN IF NOT EXISTS "tds_amount" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "commission_ledger" ADD COLUMN IF NOT EXISTS "tds_percent" numeric(10, 4);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "customer_fee_gst" numeric(14, 2) NOT NULL DEFAULT '0';
--> statement-breakpoint
-- Global default: TDS on for all services (draft 2%)
INSERT INTO "tax_service_configs" (
  "tenant_id", "service_id", "tds_applies", "tds_percent",
  "gst_on_fee_applies", "gst_on_fee_percent", "is_active"
)
SELECT t.id, NULL, true, '2.0000', false, '18.0000', true
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tax_service_configs" c
  WHERE c.tenant_id = t.id AND c.service_id IS NULL AND c.is_active = true
);
--> statement-breakpoint
-- DMT / Money Transfer: GST on fee (18%) + TDS still on
INSERT INTO "tax_service_configs" (
  "tenant_id", "service_id", "tds_applies", "tds_percent",
  "gst_on_fee_applies", "gst_on_fee_percent", "is_active"
)
SELECT t.id, s.id, true, '2.0000', true, '18.0000', true
FROM "tenants" t
CROSS JOIN "services" s
WHERE s.code IN ('MONEY_TRANSFER', 'DMT', 'dmt')
  AND NOT EXISTS (
    SELECT 1 FROM "tax_service_configs" c
    WHERE c.tenant_id = t.id AND c.service_id = s.id AND c.is_active = true
  );
