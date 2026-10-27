-- Paid bank account name checks (pennyless / ₹1 penny drop) before adding a DMT payee.
-- Routing rows only: the category is inactive so the catalog never shows them as tiles.
INSERT INTO "service_categories" ("code", "name", "display_order", "is_active")
SELECT 'VERIFICATION_RAILS', 'Verification (internal)', 999, false
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "code" = 'VERIFICATION_RAILS');
--> statement-breakpoint
INSERT INTO "services" ("category_id", "code", "name", "min_amount", "max_amount", "display_order", "is_active")
SELECT c."id", v."code", v."name", 0.01, 10.00, 999, true
FROM "service_categories" c
CROSS JOIN (
  VALUES
    ('BANK_NAME_CHECK', 'Bank name check'),
    ('BANK_PENNY_DROP', 'Bank name check (₹1 test credit)')
) AS v("code", "name")
WHERE c."code" = 'VERIFICATION_RAILS'
  AND NOT EXISTS (SELECT 1 FROM "services" s WHERE s."code" = v."code");
--> statement-breakpoint
INSERT INTO "provider_services" ("service_id", "provider_id", "provider_service_code", "is_primary", "priority", "is_active")
SELECT s."id", p."id", 'noble:' || s."code", true, 0, true
FROM "services" s
CROSS JOIN "providers" p
WHERE s."code" IN ('BANK_NAME_CHECK', 'BANK_PENNY_DROP')
  AND p."code" = 'noble'
  AND NOT EXISTS (
    SELECT 1 FROM "provider_services" ps
    WHERE ps."service_id" = s."id" AND ps."is_primary" = true AND ps."is_active" = true
  )
ON CONFLICT ("service_id", "provider_id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_name_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"account_hash" varchar(64) NOT NULL,
	"account_last4" varchar(4) NOT NULL,
	"ifsc" varchar(11) NOT NULL,
	"method" varchar(12) NOT NULL,
	"bank_name" varchar(160),
	"txn_ref" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_name_checks_account_idx" ON "bank_name_checks" ("account_hash", "ifsc", "created_at");
