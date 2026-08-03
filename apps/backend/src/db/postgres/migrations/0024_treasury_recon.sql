CREATE TYPE "public"."maker_checker_status" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."recon_severity" AS ENUM('info', 'warn', 'critical');--> statement-breakpoint
CREATE TYPE "public"."recon_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"status" "maker_checker_status" DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"decision_note" text,
	"journal_id" bigint,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "allocations_amount_positive" CHECK ("allocations"."amount" > 0),
	CONSTRAINT "allocations_maker_is_not_checker" CHECK ("allocations"."approved_by" IS NULL OR "allocations"."approved_by" <> "allocations"."requested_by"),
	CONSTRAINT "allocations_approved_has_journal" CHECK ("allocations"."status" <> 'approved' OR "allocations"."journal_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "reconciliation_exceptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"check_name" varchar(60) NOT NULL,
	"severity" "recon_severity" NOT NULL,
	"details" jsonb NOT NULL,
	"fingerprint" varchar(200) NOT NULL,
	"status" "recon_status" DEFAULT 'open' NOT NULL,
	"closed_by" uuid,
	"close_note" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_tenant_status_idx" ON "allocations" USING btree ("tenant_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "recon_exceptions_open_idx" ON "reconciliation_exceptions" USING btree ("tenant_id","status","severity");--> statement-breakpoint
CREATE INDEX "recon_exceptions_fingerprint_idx" ON "reconciliation_exceptions" USING btree ("tenant_id","fingerprint","status");
