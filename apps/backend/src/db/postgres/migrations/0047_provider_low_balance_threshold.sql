-- Per-provider low-balance warning for the admin Treasury page. Paise; NULL = no warning.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS low_balance_threshold bigint;
