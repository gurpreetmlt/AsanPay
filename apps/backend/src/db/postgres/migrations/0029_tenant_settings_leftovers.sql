ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."otp_purpose" ADD VALUE IF NOT EXISTS 'settlement_bank';--> statement-breakpoint
-- Optional ops hardening (safe to re-run). Creates a logs schema stub + readonly role template.
CREATE SCHEMA IF NOT EXISTS logs;--> statement-breakpoint
COMMENT ON SCHEMA logs IS 'Reserved for partitioned audit/provider log archives. App still writes public.audit_logs until cutover.';
