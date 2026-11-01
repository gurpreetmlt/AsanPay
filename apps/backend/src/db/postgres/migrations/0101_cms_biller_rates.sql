-- Cash Collection (CMS) margins per biller, uploaded from the provider sheet. Margins are absolute values in the
-- same unit as the company margin; retailer + distributor + super <= company margin.
CREATE TABLE IF NOT EXISTS "cms_biller_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biller_id" varchar(20) NOT NULL,
	"biller_name" varchar(200) NOT NULL,
	"company_margin" numeric(10, 6) NOT NULL,
	"retailer_margin" numeric(10, 6) NOT NULL,
	"distributor_margin" numeric(10, 6) NOT NULL,
	"super_margin" numeric(10, 6) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cms_biller_rates_biller_id_key" ON "cms_biller_rates" ("biller_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cms_biller_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"admin_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"file_name" varchar(200) NOT NULL,
	"reason" text NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"removed_count" integer DEFAULT 0 NOT NULL,
	"undo_payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_biller_imports_tenant_created_idx" ON "cms_biller_imports" ("tenant_id", "created_at" DESC);
