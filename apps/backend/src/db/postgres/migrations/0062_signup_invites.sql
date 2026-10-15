CREATE TABLE IF NOT EXISTS "signup_invites" (
  "id" bigserial PRIMARY KEY,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL,
  "name" varchar(120) NOT NULL,
  "mobile" varchar(10) NOT NULL,
  "email" varchar(160) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "email_sent_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "accepted_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_invites_inviter_idx" ON "signup_invites" ("inviter_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_invites_mobile_idx" ON "signup_invites" ("mobile");
