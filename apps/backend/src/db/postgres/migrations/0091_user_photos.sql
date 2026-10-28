CREATE TABLE IF NOT EXISTS "user_photos" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content_type" varchar(32) NOT NULL,
  "data" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
