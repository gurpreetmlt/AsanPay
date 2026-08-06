-- Move the two append-only, high-volume trace tables into the `logs` schema as monthly range
-- partitions (spec §1). Retention becomes DROP PARTITION instead of DELETE — a delete on a
-- table this size rewrites pages and bloats the heap, and there is no retention job at all today,
-- so these two tables currently grow without bound.
--
-- The old public tables are RENAMED, not dropped, so a bad cutover is one rename away from being
-- undone. Dropping them is a follow-up once the new tables have been writing for a while.
--
-- Partitioned tables require the partition key in every unique constraint, so the primary key
-- becomes (id, created_at) rather than (id). Neither table is referenced by a foreign key, and
-- both are only ever inserted into and read by created_at range, so nothing depends on the old
-- single-column key.

-- The schema already exists (0029) as a placeholder; this is the cutover it was reserved for.
COMMENT ON SCHEMA logs IS 'Partitioned audit/provider log archives. Monthly range partitions on created_at.';
--> statement-breakpoint

CREATE TABLE logs.audit_logs (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid,
  action      varchar(100) NOT NULL,
  entity_type varchar(60) NOT NULL,
  entity_id   varchar(100),
  ip_address  varchar(45),
  user_agent  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
--> statement-breakpoint

CREATE TABLE logs.provider_logs (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  txn_ref          varchar(40),
  provider_code    varchar(60) NOT NULL,
  operation        varchar(60) NOT NULL,
  request_payload  jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           varchar(30) NOT NULL,
  duration_ms      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
--> statement-breakpoint

-- Indexes are declared on the parent so every future partition inherits them.
CREATE INDEX audit_logs_user_id_idx ON logs.audit_logs (user_id);
--> statement-breakpoint
CREATE INDEX audit_logs_action_idx ON logs.audit_logs (action);
--> statement-breakpoint
CREATE INDEX audit_logs_created_at_idx ON logs.audit_logs (created_at);
--> statement-breakpoint
CREATE INDEX provider_logs_txn_ref_idx ON logs.provider_logs (txn_ref);
--> statement-breakpoint
CREATE INDEX provider_logs_provider_code_idx ON logs.provider_logs (provider_code);
--> statement-breakpoint
CREATE INDEX provider_logs_created_at_idx ON logs.provider_logs (created_at);
--> statement-breakpoint

-- A DEFAULT partition means an insert can never fail because the maintenance job did not run.
-- The job still pre-creates real partitions; this only stops a missing one from taking writes
-- down, which for an audit trail would be worse than a slow query.
CREATE TABLE logs.audit_logs_default PARTITION OF logs.audit_logs DEFAULT;
--> statement-breakpoint
CREATE TABLE logs.provider_logs_default PARTITION OF logs.provider_logs DEFAULT;
--> statement-breakpoint

-- Partitions covering the existing rows plus the current and next month, so the cutover and the
-- first month of writes land in real partitions rather than the default one.
DO $$
DECLARE
  m date;
  start_month date;
BEGIN
  SELECT LEAST(
    COALESCE((SELECT date_trunc('month', MIN(created_at))::date FROM public.audit_logs), CURRENT_DATE),
    COALESCE((SELECT date_trunc('month', MIN(created_at))::date FROM public.provider_logs), CURRENT_DATE)
  ) INTO start_month;

  m := start_month;
  WHILE m <= date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month' LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS logs.audit_logs_%s PARTITION OF logs.audit_logs
         FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYYMM'), m, m + INTERVAL '1 month');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS logs.provider_logs_%s PARTITION OF logs.provider_logs
         FOR VALUES FROM (%L) TO (%L)',
      to_char(m, 'YYYYMM'), m, m + INTERVAL '1 month');
    m := (m + INTERVAL '1 month')::date;
  END LOOP;
END $$;
--> statement-breakpoint

INSERT INTO logs.audit_logs (id, user_id, action, entity_type, entity_id, ip_address, user_agent, metadata, created_at)
SELECT id, user_id, action, entity_type, entity_id, ip_address, user_agent, metadata, created_at
FROM public.audit_logs;
--> statement-breakpoint

INSERT INTO logs.provider_logs (id, txn_ref, provider_code, operation, request_payload, response_payload, status, duration_ms, created_at)
SELECT id, txn_ref, provider_code, operation, request_payload, response_payload, status, duration_ms, created_at
FROM public.provider_logs;
--> statement-breakpoint

-- Kept as the rollback path. Drop in a later migration once logs.* has been writing cleanly.
ALTER TABLE public.audit_logs RENAME TO audit_logs_pre_partition;
--> statement-breakpoint
ALTER TABLE public.provider_logs RENAME TO provider_logs_pre_partition;
