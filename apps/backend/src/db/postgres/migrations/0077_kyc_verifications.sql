DO $$ BEGIN
	CREATE TYPE "public"."kyc_check_status" AS ENUM('pending', 'verified', 'failed', 'retry_required', 'manual_review');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_verifications" (
	"user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"pan_number" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"pan_image" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"aadhaar_otp" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"aadhaar_image" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"cross_check" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"overall" "kyc_check_status" DEFAULT 'pending' NOT NULL,
	"aadhaar_provider_request_id" varchar(128),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_decision" varchar(10),
	"review_reason" text,
	"reviewed_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "kyc_verifications" ("user_id", "overall", "review_decision", "reviewed_at")
SELECT "id",
	CASE WHEN "kyc_status" = 'verified' THEN 'verified'::"kyc_check_status" ELSE 'failed'::"kyc_check_status" END,
	CASE WHEN "kyc_status" = 'verified' THEN 'approved' ELSE 'rejected' END,
	"updated_at"
FROM "users"
WHERE "role" <> 'admin' AND "kyc_status" IN ('verified', 'rejected')
ON CONFLICT ("user_id") DO NOTHING;
