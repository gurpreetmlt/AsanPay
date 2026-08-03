-- Ledger engine guards. drizzle-kit does not generate triggers, functions or grants —
-- these are authored by hand and must ship in the same release as 0022_ledger_engine.sql.
--
-- Three invariants are enforced here, at the database, not in application code:
--   1. journals and ledger_entries are append-only
--   2. a LIABILITY (agent wallet) balance can never go negative — no overdraft, ever
--   3. protected system accounts cannot be deleted, renamed, retyped or handed to a user

-- 1 ── APPEND-ONLY LEDGER ---------------------------------------------------------------
-- Corrections are reversal journals. An UPDATE or DELETE here is always a defect, so it
-- fails loudly rather than silently rewriting financial history.
CREATE OR REPLACE FUNCTION raise_ledger_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only; post a REVERSAL journal instead of % on row',
    TG_TABLE_NAME, TG_OP;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

DROP TRIGGER IF EXISTS trg_journals_immutable ON journals;
CREATE TRIGGER trg_journals_immutable
BEFORE UPDATE OR DELETE ON journals
FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

-- 2 ── NO OVERDRAFT ---------------------------------------------------------------------
-- Postgres CHECK cannot contain a subquery, so the "LIABILITY balance >= 0" rule needs a
-- trigger that joins to accounts.account_class. Every rupee in a hierarchy wallet must be
-- backed by money already received; there is no exception path and no credit limit.
CREATE OR REPLACE FUNCTION enforce_no_overdraft() RETURNS TRIGGER AS $$
DECLARE
  acc_class account_class;
  acc_code  TEXT;
BEGIN
  IF NEW.balance >= 0 THEN
    RETURN NEW;
  END IF;

  SELECT a.account_class, a.code INTO acc_class, acc_code
  FROM accounts a WHERE a.id = NEW.account_id;

  IF acc_class = 'liability' THEN
    RAISE EXCEPTION
      'Overdraft blocked: account % would go to % paise. Agent wallets can never go negative.',
      acc_code, NEW.balance;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_overdraft ON account_balances;
CREATE TRIGGER trg_no_overdraft
BEFORE INSERT OR UPDATE ON account_balances
FOR EACH ROW EXECUTE FUNCTION enforce_no_overdraft();

-- 3 ── PROTECTED SYSTEM ACCOUNTS --------------------------------------------------------
-- COMPANY_001, TREASURY_*, COMMISSION_INCOME and friends are structural. Renaming or
-- retyping one silently redirects money; attaching a user_id turns a treasury account into
-- something that looks like a hierarchy wallet.
CREATE OR REPLACE FUNCTION protect_system_accounts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_protected THEN
    RAISE EXCEPTION 'Protected account % cannot be deleted', OLD.code;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_protected THEN
    IF NEW.code <> OLD.code
       OR NEW.name <> OLD.name
       OR NEW.account_type <> OLD.account_type
       OR NEW.account_class <> OLD.account_class
       OR NEW.tenant_id <> OLD.tenant_id
       OR NEW.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Protected account % is immutable', OLD.code;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_accounts ON accounts;
CREATE TRIGGER trg_protect_accounts
BEFORE UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION protect_system_accounts();

-- 4 ── REVOKED GRANTS -------------------------------------------------------------------
-- A permission that does not exist cannot become a bug. Note this is defence in depth only:
-- REVOKE has no effect on the role that OWNS the table, so if the app connects as the table
-- owner the triggers above remain the real enforcement. Run this as a superuser against the
-- actual application role if it differs from the owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asanpay_app') THEN
    REVOKE UPDATE, DELETE ON TABLE ledger_entries FROM asanpay_app;
    REVOKE UPDATE, DELETE ON TABLE journals       FROM asanpay_app;
    REVOKE DELETE            ON TABLE accounts    FROM asanpay_app;
  END IF;
END $$;

-- 5 ── TENANT #1 ------------------------------------------------------------------------
-- AsanPay is a normal tenant with no special-cased code path anywhere. Idempotent so a
-- re-run, or a second pod racing this migration, cannot create a duplicate.
INSERT INTO tenants (code, name)
VALUES ('ASANPAY', 'AsanPay')
ON CONFLICT (code) DO NOTHING;
