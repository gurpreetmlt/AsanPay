ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "test_marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "test_marked_by" uuid REFERENCES "users"("id") ON DELETE set null;
