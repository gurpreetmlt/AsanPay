CREATE TABLE IF NOT EXISTS "cms_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"provider" varchar(20) NOT NULL,
	"transaction_id" varchar(25) NOT NULL UNIQUE,
	"merchant_id" varchar(10) NOT NULL,
	"status" varchar(12) DEFAULT 'initiated' NOT NULL,
	"provider_status" varchar(40),
	"amount" numeric(14, 2),
	"utr" varchar(40),
	"biller_name" varchar(120),
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_transactions_user_created_idx" ON "cms_transactions" ("user_id", "created_at");
