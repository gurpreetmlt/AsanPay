ALTER TABLE "users" DROP COLUMN IF EXISTS "instantpay_outlet_id";
--> statement-breakpoint
UPDATE "provider_services" SET "is_active" = false, "is_primary" = false
WHERE "provider_id" IN (SELECT "id" FROM "providers" WHERE "code" IN ('instantpay', 'paysprint'));
--> statement-breakpoint
UPDATE "providers" SET "is_active" = false WHERE "code" IN ('instantpay', 'paysprint');
