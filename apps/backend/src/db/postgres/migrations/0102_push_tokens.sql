-- FCM registration tokens per signed-in app install (web login approval pushes).
CREATE TABLE IF NOT EXISTS "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"device_id" varchar(80) NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_device_uidx" ON "push_tokens" ("user_id", "device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_token_idx" ON "push_tokens" ("token");
