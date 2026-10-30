-- One-time recovery codes for admin two-factor login (SHA-256 hashes; a used code is removed).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_totp_backup_codes" jsonb;
