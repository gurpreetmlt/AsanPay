ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "noble_unique_agent_id" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "noble_agent_code" varchar(10);
