CREATE TABLE IF NOT EXISTS "recon_adjustments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"debit_code" varchar(64) NOT NULL,
	"credit_code" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"status" "maker_checker_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"decision_note" text,
	"journal_id" bigint,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "recon_adjustments_amount_positive" CHECK ("recon_adjustments"."amount" > 0),
	CONSTRAINT "recon_adjustments_codes_differ" CHECK ("recon_adjustments"."debit_code" <> "recon_adjustments"."credit_code"),
	CONSTRAINT "recon_adjustments_maker_is_not_checker" CHECK ("recon_adjustments"."approved_by" IS NULL OR "recon_adjustments"."approved_by" <> "recon_adjustments"."requested_by"),
	CONSTRAINT "recon_adjustments_approved_has_journal" CHECK ("recon_adjustments"."status" <> 'approved' OR "recon_adjustments"."journal_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "recon_adjustments" ADD CONSTRAINT "recon_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recon_adjustments" ADD CONSTRAINT "recon_adjustments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recon_adjustments" ADD CONSTRAINT "recon_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recon_adjustments" ADD CONSTRAINT "recon_adjustments_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recon_adjustments_tenant_status_idx" ON "recon_adjustments" USING btree ("tenant_id","status","requested_at");
