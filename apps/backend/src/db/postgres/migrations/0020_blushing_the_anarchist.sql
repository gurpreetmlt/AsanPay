ALTER TYPE "public"."otp_purpose" ADD VALUE 'email_verify';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
