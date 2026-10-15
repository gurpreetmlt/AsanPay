CREATE TABLE IF NOT EXISTS "admin_wallet_moves" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
	"kind" varchar(10) NOT NULL,
	"agent_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
	"upline_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
	"amount" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(10) NOT NULL DEFAULT 'requested',
	"requested_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
	"decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"decision_note" text,
	"ledger_group_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "admin_wallet_moves_kind_chk" CHECK ("kind" IN ('transfer', 'reverse')),
	CONSTRAINT "admin_wallet_moves_status_chk" CHECK ("status" IN ('requested', 'done', 'rejected')),
	CONSTRAINT "admin_wallet_moves_amount_chk" CHECK ("amount" > 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_wallet_moves_tenant_status_idx" ON "admin_wallet_moves" ("tenant_id", "status", "created_at");
