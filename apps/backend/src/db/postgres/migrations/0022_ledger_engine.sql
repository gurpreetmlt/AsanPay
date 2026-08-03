CREATE TYPE "public"."account_class" AS ENUM('asset', 'liability', 'internal', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."account_scope" AS ENUM('platform', 'tenant');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'inactive', 'closed');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('treasury', 'company', 'sd', 'distributor', 'retailer', 'bank', 'transit', 'float', 'control', 'suspense', 'settlement', 'income', 'expense');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "account_balances" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"settleable" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_balances_settleable_within_balance" CHECK ("account_balances"."settleable" >= 0 AND "account_balances"."settleable" <= "account_balances"."balance")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"account_type" "account_type" NOT NULL,
	"account_class" "account_class" NOT NULL,
	"parent_id" bigint,
	"scope" "account_scope" DEFAULT 'tenant' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"user_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"requires_balance_check" boolean DEFAULT false NOT NULL,
	"block_services" boolean DEFAULT false NOT NULL,
	"block_topup" boolean DEFAULT false NOT NULL,
	"block_settlement" boolean DEFAULT false NOT NULL,
	"block_login" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"blocked_by" uuid,
	"blocked_at" timestamp with time zone,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_system_has_no_user" CHECK (NOT ("accounts"."is_system" AND "accounts"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "journals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"txn_type" varchar(40) NOT NULL,
	"reference_id" text,
	"idem_key" varchar(120) NOT NULL,
	"performed_by" uuid,
	"reason" text,
	"reverses_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journals_reverses_not_self" CHECK ("journals"."reverses_id" IS DISTINCT FROM "journals"."id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"journal_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"direction" char(2) NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_direction_valid" CHECK ("ledger_entries"."direction" IN ('DR','CR')),
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_blocked_by_users_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journals" ADD CONSTRAINT "journals_reverses_id_journals_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_tenant_code_uidx" ON "accounts" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "accounts_tenant_type_idx" ON "accounts" USING btree ("tenant_id","account_type");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id") WHERE "accounts"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "journals_tenant_idem_uidx" ON "journals" USING btree ("tenant_id","idem_key");--> statement-breakpoint
CREATE INDEX "journals_tenant_type_created_idx" ON "journals" USING btree ("tenant_id","txn_type","created_at");--> statement-breakpoint
CREATE INDEX "journals_reference_idx" ON "journals" USING btree ("tenant_id","reference_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_id");
