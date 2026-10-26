CREATE TABLE IF NOT EXISTS "policy_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"policy_version" varchar(40) NOT NULL,
	"channel" varchar(10) NOT NULL,
	"login_method" varchar(10) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(300),
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_acceptances_user_version_uq" ON "policy_acceptances" ("user_id", "policy_version");
