-- Remove the wallet-verification test catalogue ("Shim banking", "Shim other", SHIM_UNMAPPED…).
-- Only rows nothing else depends on are deleted: a SHIM% service with transactions is kept inactive
-- (WARNING), and a SHIM% category is deleted only once it has no services left. Money tables
-- (transactions, ledgers) are never touched here.
DO $$
DECLARE
  s record;
  c record;
BEGIN
  FOR s IN SELECT "id", "code" FROM "services" WHERE "code" ILIKE 'SHIM%' LOOP
    IF EXISTS (SELECT 1 FROM "transactions" WHERE "service_id" = s."id") THEN
      UPDATE "services" SET "is_active" = false WHERE "id" = s."id";
      RAISE WARNING 'Service % kept inactive: transactions still reference it', s."code";
    ELSE
      BEGIN
        DELETE FROM "services" WHERE "id" = s."id";
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE "services" SET "is_active" = false WHERE "id" = s."id";
        RAISE WARNING 'Service % kept inactive: another table still references it', s."code";
      END;
    END IF;
  END LOOP;

  FOR c IN SELECT "id", "code" FROM "service_categories" WHERE "code" ILIKE 'SHIM%' LOOP
    IF EXISTS (SELECT 1 FROM "services" WHERE "category_id" = c."id") THEN
      UPDATE "service_categories" SET "is_active" = false WHERE "id" = c."id";
      RAISE WARNING 'Category % kept inactive: services still use it', c."code";
    ELSE
      BEGIN
        DELETE FROM "service_categories" WHERE "id" = c."id";
      EXCEPTION WHEN foreign_key_violation THEN
        UPDATE "service_categories" SET "is_active" = false WHERE "id" = c."id";
        RAISE WARNING 'Category % kept inactive: another table still references it', c."code";
      END;
    END IF;
  END LOOP;
END $$;
