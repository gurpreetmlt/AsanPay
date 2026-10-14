-- verify:shim left its throwaway providers active; providers is global, so they leaked into
-- ASANPAY routing and the admin Treasury page.
UPDATE providers SET is_active = false WHERE code LIKE 'SHIM%' AND name LIKE 'Shim provider %';
