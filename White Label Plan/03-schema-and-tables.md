# Schema Changes: Tables & Tenant Scoping

## Tables needing `tenant_id`

Every table holding tenant-scoped business data:

`users`, `user_hierarchy`, `wallets`, `wallet_ledger_groups`, `wallet_ledger_entries`, `wallet_idempotency`, `commission_rules`, `user_commission_rates`, `commission_ledger`, `transactions`, `refresh_tokens`, `devices`, `alert_logs`, `audit_logs`, `otp_requests`, `support_tickets`, `aeps_bio_mismatch_counters`, `aeps_cash_receipts`, `biometric_replay_guard`.

## Tables staying global (NOT tenant-scoped)

- `service_categories`, `services`, `providers`, `provider_services` — platform-wide catalog data shared across all tenants. A tenant can enable/disable which services they offer (via a new `tenant_services` mapping, see `08-future-suggestions.md`), but the catalog itself stays global.
- `api_clients`/`api_ip_whitelist` — needs review, may become per-tenant once API reselling (Phase 2) is built. See `09-open-items.md`.

## New tables needed

### `tenants` (core, Phase 1)

- `id`, `name`, `domain`
- Brand config: logo URL, theme color
- Billing status: `setup_fee_paid`, `license_status`, `license_due_date`, `grace_period_ends_at`, `is_suspended`
- `margin_range_min` / `margin_range_max` — bounds for the tenant-settable margin layer
- `created_at`

### `tenant_staff` (Phase 2, see `06-tenant-staff-roles.md`)

- `tenantId`, `email`/`mobile`, `role` (`sales_manager` | `asm` | `support` | `finance` | ...)
- `invitedBy`, `invitedAt`, `status` (`invited` | `active` | `revoked`)
- `permissions` (if per-role permission sets need per-invite overrides)

### `tenant_commission_overrides` (or extend `commission_rules` with `tenantId`)

Exact shape not yet decided — see `09-open-items.md`. Supports the extra tenant-margin layer in the payout waterfall (see `04-implementation-steps.md`, step 5).

### `tenant_services` (future, see `08-future-suggestions.md`)

Maps which catalog services are enabled per tenant, so smaller partners can get a limited/cheaper package.
