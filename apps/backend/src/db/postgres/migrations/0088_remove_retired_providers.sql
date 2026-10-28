-- Remove the retired providers (InstantPay, PaySprint) and leftover wallet-shim test providers.
-- Deleting a provider cascades its provider_services, commission rules, provider income, shares and
-- service charges; transactions keep their history with provider_id set to NULL.
-- A provider still referenced by a float route or bank entry (restrict FKs) is kept inactive instead,
-- with a WARNING, so the migration never blocks a deploy.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT "id", "code", "name"
    FROM "providers"
    WHERE "code" IN ('instantpay', 'paysprint')
       OR ("code" LIKE 'SHIM%' AND "name" LIKE 'Shim provider %')
  LOOP
    IF EXISTS (SELECT 1 FROM "float_routes" WHERE "to_provider_id" = p."id")
       OR EXISTS (SELECT 1 FROM "bank_entries" WHERE "provider_id" = p."id") THEN
      UPDATE "providers" SET "is_active" = false WHERE "id" = p."id";
      RAISE WARNING 'Provider % (%) kept inactive: a float route or bank entry still references it', p."name", p."code";
    ELSE
      BEGIN
        DELETE FROM "providers" WHERE "id" = p."id";
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE "providers" SET "is_active" = false WHERE "id" = p."id";
        RAISE WARNING 'Provider % (%) kept inactive: another table still references it', p."name", p."code";
      END;
    END IF;
  END LOOP;
END $$;
