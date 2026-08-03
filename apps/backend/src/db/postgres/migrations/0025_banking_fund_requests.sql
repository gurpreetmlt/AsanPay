CREATE TYPE "public"."bank_purpose" AS ENUM('collection', 'payout', 'ops');--> statement-breakpoint
CREATE TYPE "public"."statement_match_status" AS ENUM('unmatched', 'matched', 'suspense', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."fund_request_actor" AS ENUM('retailer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."fund_request_status" AS ENUM('submitted', 'pending_match', 'auto_matched', 'amount_mismatch', 'suspect', 'under_review', 'credited', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash_deposit', 'neft', 'rtgs', 'imps', 'upi', 'cheque');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ledger_account_id" bigint NOT NULL,
	"bank_name" varchar(120) NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_number_last4" char(4) NOT NULL,
	"ifsc" varchar(15) NOT NULL,
	"purpose" "bank_purpose" NOT NULL,
	"supports_van" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"bank_txn_id" varchar(120) NOT NULL,
	"txn_date" date NOT NULL,
	"value_datetime" timestamp with time zone,
	"direction" char(2) NOT NULL,
	"amount" bigint NOT NULL,
	"utr" varchar(60),
	"utr_norm" varchar(60),
	"narration" text,
	"sender_name" varchar(160),
	"balance_after" bigint,
	"match_status" "statement_match_status" DEFAULT 'unmatched' NOT NULL,
	"matched_to_type" varchar(30),
	"matched_to_id" bigint,
	"suspense_journal_id" bigint,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_lines_direction_valid" CHECK ("bank_statement_lines"."direction" IN ('DR','CR')),
	CONSTRAINT "bank_statement_lines_amount_positive" CHECK ("bank_statement_lines"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "virtual_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"owner_account_id" bigint NOT NULL,
	"van_number" varchar(40),
	"vpa" varchar(100),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "virtual_accounts_van_number_unique" UNIQUE("van_number"),
	CONSTRAINT "virtual_accounts_vpa_unique" UNIQUE("vpa"),
	CONSTRAINT "virtual_accounts_has_identifier" CHECK ("virtual_accounts"."van_number" IS NOT NULL OR "virtual_accounts"."vpa" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "fund_request_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund_request_id" bigint NOT NULL,
	"from_status" "fund_request_status",
	"to_status" "fund_request_status" NOT NULL,
	"actor_id" uuid,
	"actor_type" "fund_request_actor" NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requester_account_id" bigint NOT NULL,
	"bank_account_id" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"credited_amount" bigint,
	"payment_mode" "payment_mode" NOT NULL,
	"reference_number" varchar(60),
	"reference_norm" varchar(60),
	"deposit_datetime" timestamp with time zone NOT NULL,
	"sender_name" varchar(160),
	"receipt_url" text NOT NULL,
	"receipt_sha256" varchar(64) NOT NULL,
	"remarks" text,
	"status" "fund_request_status" DEFAULT 'submitted' NOT NULL,
	"match_confidence" integer,
	"matched_line_id" bigint,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reject_reason_code" varchar(40),
	"reject_remarks" text,
	"receive_journal_id" bigint,
	"credit_journal_id" bigint,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone,
	CONSTRAINT "fund_requests_amount_positive" CHECK ("fund_requests"."amount" > 0),
	CONSTRAINT "fund_requests_credited_has_journal" CHECK ("fund_requests"."status" <> 'credited' OR "fund_requests"."credit_journal_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_id_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_accounts" ADD CONSTRAINT "virtual_accounts_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_request_events" ADD CONSTRAINT "fund_request_events_fund_request_id_fund_requests_id_fk" FOREIGN KEY ("fund_request_id") REFERENCES "public"."fund_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_request_events" ADD CONSTRAINT "fund_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_requester_account_id_accounts_id_fk" FOREIGN KEY ("requester_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_matched_line_id_bank_statement_lines_id_fk" FOREIGN KEY ("matched_line_id") REFERENCES "public"."bank_statement_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_receive_journal_id_journals_id_fk" FOREIGN KEY ("receive_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD CONSTRAINT "fund_requests_credit_journal_id_journals_id_fk" FOREIGN KEY ("credit_journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_ledger_uidx" ON "bank_accounts" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_tenant_purpose_idx" ON "bank_accounts" USING btree ("tenant_id","purpose","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_txn_uidx" ON "bank_statement_lines" USING btree ("bank_account_id","bank_txn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_claim_uidx" ON "bank_statement_lines" USING btree ("matched_to_type","matched_to_id") WHERE "bank_statement_lines"."matched_to_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bank_statement_lines_utr_idx" ON "bank_statement_lines" USING btree ("bank_account_id","utr_norm");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_unmatched_idx" ON "bank_statement_lines" USING btree ("bank_account_id","txn_date","amount") WHERE "bank_statement_lines"."match_status" = 'unmatched';--> statement-breakpoint
CREATE INDEX "virtual_accounts_owner_idx" ON "virtual_accounts" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "fund_request_events_request_idx" ON "fund_request_events" USING btree ("fund_request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_requests_bank_ref_uidx" ON "fund_requests" USING btree ("bank_account_id","reference_norm") WHERE "fund_requests"."reference_norm" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "fund_requests_tenant_status_idx" ON "fund_requests" USING btree ("tenant_id","status","submitted_at");--> statement-breakpoint
CREATE INDEX "fund_requests_requester_idx" ON "fund_requests" USING btree ("requester_user_id","submitted_at");--> statement-breakpoint
CREATE INDEX "fund_requests_receipt_hash_idx" ON "fund_requests" USING btree ("receipt_sha256");
