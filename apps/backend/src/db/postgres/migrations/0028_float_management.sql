CREATE TYPE "public"."float_transfer_status" AS ENUM('initiated', 'in_transit', 'confirmed', 'returned', 'failed');--> statement-breakpoint
CREATE TYPE "public"."float_transfer_mode" AS ENUM('neft', 'rtgs', 'imps');--> statement-breakpoint
CREATE TABLE "float_routes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_bank_id" bigint NOT NULL,
	"to_provider_id" uuid NOT NULL,
	"beneficiary_name" varchar(160) NOT NULL,
	"beneficiary_acc_enc" text NOT NULL,
	"beneficiary_acc_last4" varchar(4) NOT NULL,
	"beneficiary_ifsc" varchar(15) NOT NULL,
	"transfer_mode" "float_transfer_mode" DEFAULT 'neft' NOT NULL,
	"min_amount" bigint,
	"max_amount" bigint,
	"priority" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "float_transfers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"route_id" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"bank_utr" varchar(60),
	"status" "float_transfer_status" DEFAULT 'initiated' NOT NULL,
	"initiated_by" uuid NOT NULL,
	"approved_by" uuid,
	"transit_journal_id" bigint,
	"confirm_journal_id" bigint,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "float_transfers_amount_positive" CHECK ("float_transfers"."amount" > 0),
	CONSTRAINT "float_transfers_maker_checker" CHECK ("float_transfers"."approved_by" IS NULL OR "float_transfers"."initiated_by" IS DISTINCT FROM "float_transfers"."approved_by")
);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD COLUMN IF NOT EXISTS "cooling_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "float_routes" ADD CONSTRAINT "float_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_routes" ADD CONSTRAINT "float_routes_from_bank_id_bank_accounts_id_fk" FOREIGN KEY ("from_bank_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_routes" ADD CONSTRAINT "float_routes_to_provider_id_providers_id_fk" FOREIGN KEY ("to_provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_route_id_float_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."float_routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_transit_journal_id_journals_id_fk" FOREIGN KEY ("transit_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_transfers" ADD CONSTRAINT "float_transfers_confirm_journal_id_journals_id_fk" FOREIGN KEY ("confirm_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "float_routes_tenant_idx" ON "float_routes" USING btree ("tenant_id","is_active","priority");--> statement-breakpoint
CREATE INDEX "float_transfers_tenant_status_idx" ON "float_transfers" USING btree ("tenant_id","status","initiated_at");
