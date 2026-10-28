-- Signup without a password: temporary password emailed on KYC approval, forced change on first login.
-- login_email_status: sent | failed (NULL = never sent).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_password_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_email_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_email_status" varchar(12);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_email_message" varchar(200);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_email_sent_at" timestamp with time zone;
