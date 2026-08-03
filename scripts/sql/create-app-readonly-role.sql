-- Optional ops hardening (run manually on Postgres as superuser — NOT via app migrate).
-- Creates a non-owner app role template. Adjust password + grants to match Coolify DATABASE_URL user.
--
-- Example:
--   psql "$DATABASE_URL" -f scripts/sql/create-app-readonly-role.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asanpay_app') THEN
    CREATE ROLE asanpay_app LOGIN PASSWORD 'CHANGE_ME_BEFORE_USE';
  END IF;
END$$;

GRANT CONNECT ON DATABASE current_database() TO asanpay_app;
GRANT USAGE ON SCHEMA public TO asanpay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO asanpay_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO asanpay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asanpay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO asanpay_app;

-- Deny DDL / ownership transfer: app role must not be table owner.
-- Ensure tables stay owned by the migration role (Coolify migrate user), not asanpay_app.

GRANT USAGE ON SCHEMA logs TO asanpay_app;
