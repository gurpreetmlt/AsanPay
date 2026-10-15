ALTER TYPE "public"."fund_request_status" ADD VALUE IF NOT EXISTS 'voided';--> statement-breakpoint
ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "voided_by" uuid REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "void_reason" text;
