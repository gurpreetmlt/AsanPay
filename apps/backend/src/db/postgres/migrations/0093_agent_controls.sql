CREATE TABLE IF NOT EXISTS "agent_service_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "service_group" varchar(20) NOT NULL,
  "reason" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_service_blocks_user_group_key"
  ON "agent_service_blocks" ("user_id", "service_group");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_txn_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "service_group" varchar(20) NOT NULL,
  "per_txn_rupees" numeric(14, 2),
  "daily_rupees" numeric(14, 2),
  "monthly_rupees" numeric(14, 2),
  "reason" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_txn_limits_user_group_key"
  ON "agent_txn_limits" ("user_id", "service_group");
