-- Disputes / chargebacks (task #11). The customer's account gets debited but the retailer's
-- machine shows a failure, or the aggregator later charges us back — until now every case like
-- this was handled over WhatsApp with no record, no SLA, and no link to the journal that moved
-- the money. Retrofitting this onto transactions that already happened is much harder than
-- recording it as it goes, so this ships before real volume, not after.
CREATE TYPE dispute_status AS ENUM (
  'raised',
  'under_review',
  'resolved',
  'rejected'
);
--> statement-breakpoint

CREATE TYPE dispute_category AS ENUM (
  'customer_debited_no_service',
  'chargeback',
  'duplicate_charge',
  'wrong_amount',
  'other'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS disputes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  transaction_id      uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  raised_by           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category            dispute_category NOT NULL,
  description         text NOT NULL,
  -- Client-hosted URLs — same stub-URL convention as fund_requests.receipt_url and
  -- device_repair_requests.photo_urls; no server-side upload exists in this codebase.
  evidence_urls        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status               dispute_status NOT NULL DEFAULT 'raised',
  -- Ops SLA clock — spec §5's fund-request pattern uses the same idea (24h auto-escalate).
  sla_due_at           timestamptz NOT NULL,
  resolution_note      text,
  -- A resolved dispute that returns money links here — one or more journal ids that were
  -- reversed via postJournal()'s REVERSAL type (spec §4.8: never a fresh credit, never a
  -- direct balance edit). Stored as jsonb array of bigint-as-text since a service transaction
  -- can be more than one journal (principal leg + fee leg).
  reversal_journal_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz
);
--> statement-breakpoint

-- One open dispute per transaction — a second complaint about the same txn is a duplicate, not
-- a new case. Partial: a rejected/resolved dispute doesn't block re-raising if genuinely needed.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_open_per_txn_uidx
  ON disputes (transaction_id) WHERE status IN ('raised', 'under_review');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS disputes_tenant_status_idx
  ON disputes (tenant_id, status, submitted_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disputes_raised_by_idx
  ON disputes (raised_by, submitted_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS disputes_sla_open_idx
  ON disputes (sla_due_at) WHERE status IN ('raised', 'under_review');
