-- Signup v2: home GPS (step 5). Shop GPS stays in outlet_latitude / outlet_longitude.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "home_latitude" varchar(32);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "home_longitude" varchar(32);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "home_location_at" timestamp with time zone;
--> statement-breakpoint
-- Public phone-browser capture (signup shop / home QR): IP of the request, for the VPN risk flag.
ALTER TABLE "geo_link_requests" ADD COLUMN IF NOT EXISTS "capture_ip" varchar(64);
