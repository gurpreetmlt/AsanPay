-- Device repair / RMA flow (task #16). Separates "my device broke" from "I swapped my serial" —
-- without this table both look identical in agent_devices history, and the change-frequency
-- signal in task #15 would keep flagging honest retailers whose scanner genuinely failed.
CREATE TYPE device_repair_status AS ENUM (
  'submitted',
  'rma_issued',
  'in_repair',
  'resolved',
  'rejected'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS device_repair_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: the device may not be in agent_devices (unregistered scanner, or a printer/MATM
  -- that was never through /devices). The serial is still captured as free text either way.
  agent_device_id   uuid REFERENCES agent_devices(id) ON DELETE SET NULL,
  device_type       varchar(40) NOT NULL DEFAULT 'biometric_machine',
  serial            varchar(80) NOT NULL,
  vendor            varchar(60),
  model             varchar(60),
  issue_type        varchar(60) NOT NULL,
  invoice_date      date,
  invoice_number    varchar(80),
  remarks           text NOT NULL,
  -- Client-hosted URLs — no server-side upload exists anywhere in this codebase yet (fund
  -- requests use the same stub-URL convention). Not introducing new upload infra here.
  photo_urls        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status            device_repair_status NOT NULL DEFAULT 'submitted',
  rma_number        varchar(60),
  resolution_note   text,
  -- Set when the resolution is "device replaced" — links the closed ticket to the
  -- deregistration event in agent_devices so a replacement is never confused with the
  -- device-sharing case the partial unique index guards against.
  replaced_with_device_id uuid REFERENCES agent_devices(id) ON DELETE SET NULL,
  reviewed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS device_repair_requests_user_idx
  ON device_repair_requests (user_id, submitted_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS device_repair_requests_status_idx
  ON device_repair_requests (status, submitted_at DESC);
