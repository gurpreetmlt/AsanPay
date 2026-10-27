CREATE TABLE IF NOT EXISTS "provider_payout_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE cascade,
	"provider_id" uuid REFERENCES "providers"("id") ON DELETE cascade,
	"rule_type" "commission_rule_type" NOT NULL,
	"value" numeric(10, 4) NOT NULL,
	"cap_amount" numeric(14, 2),
	"min_amount" numeric(14, 2),
	"max_amount" numeric(14, 2),
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_payout_rules_service_provider_idx" ON "provider_payout_rules" USING btree ("service_id","provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_payout_rules_active_idx" ON "provider_payout_rules" USING btree ("service_id","is_active","effective_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE cascade,
	"provider_id" uuid REFERENCES "providers"("id") ON DELETE cascade,
	"role" "user_role" NOT NULL,
	"share_percent" numeric(7, 4) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_shares_service_provider_role_idx" ON "commission_shares" USING btree ("service_id","provider_id","role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_shares_active_idx" ON "commission_shares" USING btree ("service_id","is_active","effective_from");
--> statement-breakpoint
-- Default shares for every active service (all providers). They only pay once provider income
-- is configured for the service; until then payouts keep using commission_rules.
INSERT INTO "commission_shares" ("service_id", "provider_id", "role", "share_percent")
SELECT s."id", NULL, d."role"::"user_role", d."pct"
FROM "services" s
CROSS JOIN (VALUES ('retailer', 60.0000), ('distributor', 10.0000), ('super_distributor', 5.0000)) AS d("role", "pct")
WHERE s."is_active" = true
	AND NOT EXISTS (
		SELECT 1 FROM "commission_shares" cs
		WHERE cs."service_id" = s."id" AND cs."provider_id" IS NULL AND cs."role" = d."role"::"user_role"
	);
