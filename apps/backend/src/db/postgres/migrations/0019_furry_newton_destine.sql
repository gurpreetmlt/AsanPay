CREATE TABLE "alert_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" varchar(60) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"retailer_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered_to_slack" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "daily_limit_amount" numeric(14, 2);--> statement-breakpoint
CREATE INDEX "alert_logs_type_idx" ON "alert_logs" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "alert_logs_retailer_idx" ON "alert_logs" USING btree ("retailer_id");--> statement-breakpoint
CREATE INDEX "alert_logs_created_at_idx" ON "alert_logs" USING btree ("created_at");
