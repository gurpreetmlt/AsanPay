CREATE TABLE IF NOT EXISTS "bank_statement_imports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
	"bank_account_id" bigint NOT NULL REFERENCES "bank_accounts"("id") ON DELETE restrict,
	"file_name" varchar(200),
	"source" varchar(10) DEFAULT 'paste' NOT NULL,
	"period_from" date,
	"period_to" date,
	"line_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"imported_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_statement_imports_source_valid" CHECK ("source" IN ('file', 'paste'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statement_imports_tenant_idx" ON "bank_statement_imports" USING btree ("tenant_id", "created_at");--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD COLUMN IF NOT EXISTS "import_id" bigint REFERENCES "bank_statement_imports"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_statement_lines_import_idx" ON "bank_statement_lines" USING btree ("import_id");
