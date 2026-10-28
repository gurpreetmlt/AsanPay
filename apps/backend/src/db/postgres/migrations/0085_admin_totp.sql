-- Admin portal two-factor login (TOTP). Secret is AES-GCM encrypted; enabled_at NULL = pending / off.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_totp_secret_encrypted" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_totp_enabled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_totp_last_step" integer;
