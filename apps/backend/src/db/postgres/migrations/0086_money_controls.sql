-- Money controls: one UTR per settlement payout, one bank UTR per credited fund request,
-- and a remitter-mobile index for the DMT monthly limit.
-- The unique indexes are skipped (with a WARNING) when existing rows already collide, so the
-- migration never blocks a deploy; the application pre-checks still enforce the rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "settlement_requests"
    WHERE regexp_replace("bank_utr", '[^A-Za-z0-9]', '', 'g') <> ''
    GROUP BY "tenant_id", upper(regexp_replace("bank_utr", '[^A-Za-z0-9]', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'settlement_requests_bank_utr_uidx skipped: duplicate bank_utr values exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "settlement_requests_bank_utr_uidx"
      ON "settlement_requests" ("tenant_id", (upper(regexp_replace("bank_utr", '[^A-Za-z0-9]', '', 'g'))))
      WHERE regexp_replace("bank_utr", '[^A-Za-z0-9]', '', 'g') <> '';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "fund_requests"
    WHERE "status" = 'credited' AND "reference_norm" IS NOT NULL AND length("reference_norm") >= 12
    GROUP BY "tenant_id", "reference_norm"
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'fund_requests_credited_utr_uidx skipped: a UTR is already credited on more than one fund request';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "fund_requests_credited_utr_uidx"
      ON "fund_requests" ("tenant_id", "reference_norm")
      WHERE "status" = 'credited' AND "reference_norm" IS NOT NULL AND length("reference_norm") >= 12;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_customer_mobile_idx"
  ON "transactions" ((metadata ->> 'customerMobile'), "created_at")
  WHERE (metadata ->> 'customerMobile') IS NOT NULL;
