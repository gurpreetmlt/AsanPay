-- Soft-delete company banks. Hard DELETE is blocked by VAN / statement / fund-request FKs.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
