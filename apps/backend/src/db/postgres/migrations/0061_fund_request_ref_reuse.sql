DROP INDEX IF EXISTS "fund_requests_bank_ref_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fund_requests_bank_ref_uidx"
  ON "fund_requests" ("bank_account_id", "reference_norm")
  WHERE "reference_norm" IS NOT NULL AND "status" NOT IN ('rejected', 'cancelled', 'voided');
