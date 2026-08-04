CREATE TABLE IF NOT EXISTS "service_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"provider_id" uuid,
	"role" "user_role",
	"rule_type" "commission_rule_type" NOT NULL,
	"value" numeric(10, 4) NOT NULL,
	"min_amount" numeric(14, 2),
	"max_amount" numeric(14, 2),
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_charges_tenant_service_idx" ON "service_charges" USING btree ("tenant_id","service_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_charges_service_provider_idx" ON "service_charges" USING btree ("service_id","provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_charges_active_idx" ON "service_charges" USING btree ("service_id","is_active","effective_from");
