CREATE TABLE IF NOT EXISTS "geo_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL UNIQUE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"purpose" varchar(20) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"accuracy_meters" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_link_requests_user_created_idx" ON "geo_link_requests" ("user_id", "created_at");
