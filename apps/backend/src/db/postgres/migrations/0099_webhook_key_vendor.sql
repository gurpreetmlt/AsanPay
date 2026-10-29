ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "vendor_name" varchar(120);
--> statement-breakpoint
ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "contact_name" varchar(80);
--> statement-breakpoint
ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "contact_email" varchar(150);
--> statement-breakpoint
ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "contact_phone" varchar(20);
--> statement-breakpoint
ALTER TABLE "webhook_keys" ADD COLUMN IF NOT EXISTS "environment" varchar(8);
