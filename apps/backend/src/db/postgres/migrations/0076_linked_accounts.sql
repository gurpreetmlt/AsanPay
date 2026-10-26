ALTER TYPE "public"."otp_purpose" ADD VALUE IF NOT EXISTS 'account_link';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"linked_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"link_method" varchar(10) DEFAULT 'otp' NOT NULL,
	"otp_verified_at" timestamp with time zone,
	"switch_failed_attempts" integer DEFAULT 0 NOT NULL,
	"switch_locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "linked_accounts_user_uq" ON "linked_accounts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linked_accounts_group_idx" ON "linked_accounts" ("group_id");
