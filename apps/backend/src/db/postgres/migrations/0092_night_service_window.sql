CREATE TABLE IF NOT EXISTS "night_service_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "service_group" varchar(16) NOT NULL,
  "until" timestamp with time zone,
  "reason" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "night_service_exceptions_user_group_key"
  ON "night_service_exceptions" ("user_id", "service_group");
