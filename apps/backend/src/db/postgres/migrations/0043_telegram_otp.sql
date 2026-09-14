-- Telegram OTP delivery: store chat id on user + one-time link tokens.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_chat_id_uidx" ON "users" ("telegram_chat_id") WHERE "telegram_chat_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "token" varchar(64) PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "telegram_link_tokens_user_id_idx" ON "telegram_link_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_expires_at_idx" ON "telegram_link_tokens" ("expires_at");
