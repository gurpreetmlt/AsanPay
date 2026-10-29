CREATE TABLE IF NOT EXISTS "provider_sessions" (
	"provider_code" varchar(40) PRIMARY KEY NOT NULL,
	"token_encrypted" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"obtained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"obtained_by" varchar(20) NOT NULL,
	"login_count_day" varchar(10),
	"login_count" integer DEFAULT 0 NOT NULL
);
