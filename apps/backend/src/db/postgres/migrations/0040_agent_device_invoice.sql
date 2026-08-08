-- Invoice details captured at registration time, so a device dispute (repair/RMA, warranty)
-- doesn't need the agent to dig up paperwork separately from the app.
ALTER TABLE agent_devices ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
--> statement-breakpoint
ALTER TABLE agent_devices ADD COLUMN IF NOT EXISTS invoice_number varchar(60);
--> statement-breakpoint
ALTER TABLE agent_devices ADD COLUMN IF NOT EXISTS remarks varchar(300);
