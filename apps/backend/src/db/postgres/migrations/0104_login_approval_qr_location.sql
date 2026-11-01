-- QR login (user unknown until a phone scans) + phone GPS check on web login approval (PL-43).
ALTER TABLE "login_approvals" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "login_approvals" ALTER COLUMN "match_number" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "login_approvals" ALTER COLUMN "match_choices" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "qr_secret_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "scanned_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "phone_latitude" varchar(32);
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "phone_longitude" varchar(32);
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "phone_accuracy_m" integer;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "phone_mock" boolean;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "phone_ip" varchar(64);
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "distance_km" real;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "same_network" boolean;
--> statement-breakpoint
ALTER TABLE "login_approvals" ADD COLUMN IF NOT EXISTS "location_status" varchar(10);
