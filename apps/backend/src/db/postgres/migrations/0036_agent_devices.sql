-- Biometric scanner registry.
--
-- Until now nothing recorded WHICH scanner an agent used. The `devices` table tracks the phone
-- running the app (a client-generated id), not the UIDAI L1 device that captures the fingerprint.
-- That left the strongest available fraud signal unusable: one physical scanner rotating between
-- several agent IDs, which is device sharing rather than a broken device being replaced.
--
-- The serial and the RD licence expiry both come from the RD Service INFO call
-- (in.gov.uidai.rdservice.fp.INFO), never typed by the agent — a typed serial can be anything,
-- and the one-serial-one-agent rule is only meaningful if the value comes off the device.
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'device_register';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS agent_devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- As reported by the RD Service. Uppercased and stripped before storage.
  serial            varchar(80) NOT NULL,
  vendor            varchar(60),
  model             varchar(60),
  -- Surfaced in the app and alerted on 15 days out. A large share of "my scanner is broken"
  -- tickets are an expired RD licence, and without this there is no way to tell them apart.
  rd_license_expiry timestamptz,
  registered_at     timestamptz NOT NULL DEFAULT now(),
  registered_ip     varchar(45),
  -- Soft delete. History has to survive so change frequency can be derived, and so a replaced
  -- device can be told apart from a device that keeps moving between agents.
  deregistered_at   timestamptz,
  deregistered_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  deregister_reason varchar(200),
  created_at        timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- One serial, one active agent — enforced by the database rather than a nightly job, so the
-- second agent's registration fails at the moment it is attempted instead of being reported
-- hours later. Deregistered rows are excluded, so a genuine hand-over still works.
CREATE UNIQUE INDEX IF NOT EXISTS agent_devices_active_serial_uidx
  ON agent_devices (serial) WHERE deregistered_at IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_devices_user_idx ON agent_devices (user_id, registered_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_devices_expiry_idx ON agent_devices (rd_license_expiry)
  WHERE deregistered_at IS NULL;
