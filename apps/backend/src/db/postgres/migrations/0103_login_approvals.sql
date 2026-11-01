-- Agent web sign-ins waiting for approval on the user's trusted phone (PL-42).
CREATE TABLE IF NOT EXISTS "login_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"match_number" smallint NOT NULL,
	"match_choices" jsonb NOT NULL,
	"browser" varchar(150),
	"ip" varchar(64),
	"city" varchar(80),
	"user_agent" varchar(300),
	"device_id" varchar(100),
	"login_method" varchar(10) NOT NULL,
	"poll_token_hash" varchar(64) NOT NULL,
	"deny_reason" varchar(20),
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_device_id" varchar(100),
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_approvals_user_status_idx" ON "login_approvals" ("user_id", "status", "expires_at");
