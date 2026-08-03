CREATE TYPE "public"."settlement_mode" AS ENUM('imps', 'neft', 'rtgs');--> statement-breakpoint
CREATE TYPE "public"."settlement_request_status" AS ENUM('requested', 'queued', 'processing', 'success', 'failed', 'returned');--> statement-breakpoint
CREATE TABLE "agent_settlement_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_number_last4" char(4) NOT NULL,
	"ifsc" varchar(15) NOT NULL,
	"holder_name" varchar(160) NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_ref" varchar(80),
	"is_active" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_settlement_accounts_maker_checker" CHECK ("agent_settlement_accounts"."approved_by" IS NULL OR "agent_settlement_accounts"."created_by" IS DISTINCT FROM "agent_settlement_accounts"."approved_by")
);
--> statement-breakpoint
CREATE TABLE "settlement_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_account_id" bigint NOT NULL,
	"settlement_account_id" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"charges" bigint DEFAULT 0 NOT NULL,
	"net_amount" bigint NOT NULL,
	"mode" "settlement_mode" DEFAULT 'imps' NOT NULL,
	"status" "settlement_request_status" DEFAULT 'requested' NOT NULL,
	"batch_id" varchar(64),
	"bank_utr" varchar(60),
	"failure_reason" text,
	"debit_journal_id" bigint,
	"payout_journal_id" bigint,
	"reversal_journal_id" bigint,
	"payout_bank_account_id" bigint,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "settlement_requests_amount_positive" CHECK ("settlement_requests"."amount" > 0),
	CONSTRAINT "settlement_requests_net_positive" CHECK ("settlement_requests"."net_amount" > 0),
	CONSTRAINT "settlement_requests_net_equals_amount_minus_charges" CHECK ("settlement_requests"."net_amount" = "settlement_requests"."amount" - "settlement_requests"."charges"),
	CONSTRAINT "settlement_requests_success_has_payout" CHECK ("settlement_requests"."status" <> 'success' OR "settlement_requests"."payout_journal_id" IS NOT NULL),
	CONSTRAINT "settlement_requests_failed_has_reversal" CHECK ("settlement_requests"."status" <> 'failed' OR "settlement_requests"."reversal_journal_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD CONSTRAINT "agent_settlement_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD CONSTRAINT "agent_settlement_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD CONSTRAINT "agent_settlement_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settlement_accounts" ADD CONSTRAINT "agent_settlement_accounts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_agent_account_id_accounts_id_fk" FOREIGN KEY ("agent_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_settlement_account_id_agent_settlement_accounts_id_fk" FOREIGN KEY ("settlement_account_id") REFERENCES "public"."agent_settlement_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_debit_journal_id_journals_id_fk" FOREIGN KEY ("debit_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_payout_journal_id_journals_id_fk" FOREIGN KEY ("payout_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_reversal_journal_id_journals_id_fk" FOREIGN KEY ("reversal_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_requests" ADD CONSTRAINT "settlement_requests_payout_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("payout_bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_settlement_accounts_one_active_uidx" ON "agent_settlement_accounts" USING btree ("user_id") WHERE "agent_settlement_accounts"."is_active" = true;--> statement-breakpoint
CREATE INDEX "agent_settlement_accounts_user_idx" ON "agent_settlement_accounts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "settlement_requests_user_idx" ON "settlement_requests" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "settlement_requests_tenant_status_idx" ON "settlement_requests" USING btree ("tenant_id","status","requested_at");
