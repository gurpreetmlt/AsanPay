-- UPI Cash Point QR collections run through executeServiceTxn on the catalog service code.
-- Limits match the client screens (₹200 – ₹5,000); only filled when not already configured.
UPDATE "services" SET "min_amount" = 200.00 WHERE "code" = 'UPI_CASH_POINT' AND "min_amount" IS NULL;
--> statement-breakpoint
UPDATE "services" SET "max_amount" = 5000.00 WHERE "code" = 'UPI_CASH_POINT' AND "max_amount" IS NULL;
--> statement-breakpoint
INSERT INTO "provider_services" ("service_id", "provider_id", "provider_service_code", "is_primary", "priority", "is_active")
SELECT s."id", p."id", 'noble:UPI_CASH_POINT', true, 0, true
FROM "services" s
CROSS JOIN "providers" p
WHERE s."code" = 'UPI_CASH_POINT'
  AND p."code" = 'noble'
  AND NOT EXISTS (
    SELECT 1 FROM "provider_services" ps
    WHERE ps."service_id" = s."id" AND ps."is_primary" = true AND ps."is_active" = true
  )
ON CONFLICT ("service_id", "provider_id") DO NOTHING;
