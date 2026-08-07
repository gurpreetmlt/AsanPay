-- Log-only risk signals for device and location anomalies (task #15).
--
-- Deliberately NOT wired to block anything. Every threshold here is a guess until there is a
-- month of real data to calibrate against — writing findings without enforcing them is what
-- makes it safe to turn on before the thresholds are trusted.
CREATE TABLE IF NOT EXISTS agent_risk_signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- mock_location | low_accuracy_ignored | gps_missing | ip_geo_mismatch | out_of_zone |
  -- device_change_flag | device_change_investigate | rd_license_expiring
  signal_type  varchar(40) NOT NULL,
  severity     varchar(10) NOT NULL DEFAULT 'info', -- info | warn | critical
  reference_id varchar(80),
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at  timestamptz,
  reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_risk_signals_user_idx
  ON agent_risk_signals (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_risk_signals_type_idx
  ON agent_risk_signals (signal_type, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_risk_signals_unreviewed_idx
  ON agent_risk_signals (created_at DESC) WHERE reviewed_at IS NULL;
