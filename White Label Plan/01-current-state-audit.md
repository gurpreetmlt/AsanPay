# Current State Audit (pre-multi-tenant)

Findings from a full codebase review before any multi-tenant work began.

- **No tenant column anywhere.** `users`, `wallets`, `commission_rules`, `transactions`, `refresh_tokens`, `devices`, `alert_logs` — none scoped.
- **JWT payload** (`apps/backend/src/utils/jwt.ts`) only carries `{sub, uid, role, type}` — no tenant claim.
- **`getSystemWallet()`** ([apps/backend/src/modules/transactions/txn.service.ts:48](../apps/backend/src/modules/transactions/txn.service.ts)) assumes exactly one `walletKind='aggregator'` row system-wide — must become per-tenant. Same pattern duplicated in `commission.service.ts:40-44`.
- **Hold-balance logic** (`apps/backend/src/modules/wallet/wallet.ledger.ts`) is solid: `applyLockedEntry` row-locks wallets, `adjustWalletHold` mirrors hold amounts, `transferBetweenWallets` locks both wallets in sorted order + writes balanced double-entry `wallet_ledger_entries`. Reusable as-is, just needs tenant scoping added to the wallet lookup, not the locking logic itself.
- **Idempotency** already solid: Postgres advisory lock keyed on `hashtext("${userId}:${idempotencyKey}")` + DB unique index `transactions_user_idempotency_uidx (userId, idempotencyKey)`. Needs `tenantId` folded into the key scope (two different tenants' users could theoretically collide on `userId` once tenants have independent user spaces — needs confirming user IDs stay globally unique or become tenant-scoped).
- **Commission slabs** (`commission.service.ts:107-160`, `findActiveRule`): already provider-aware (provider-specific rule preferred over null-provider default), ordered lookup by `effectiveFrom`. Good extension point for adding a tenant-margin layer.
- **Branding**: `apps/agent-portal/lib/brand.ts` = build-time env var override only. `apps/asanpay-mobile-app/src/theme/brand.ts` = fully hardcoded, compiled-in (mobile app literally cannot be white-labeled without a rebuild — flagged as a hard constraint).
- No existing domain-resolution, tenant-lookup, or RLS code anywhere in the repo.

## Existing schema tables (`apps/backend/src/db/postgres/schema/`)

| File | Tables |
|---|---|
| `aepsCompliance.ts` | `aeps_bio_mismatch_counters`, `aeps_cash_receipts` |
| `apiClients.ts` | `api_clients`, `api_ip_whitelist` |
| `biometricReplay.ts` | `biometric_replay_guard` |
| `catalog.ts` | `service_categories`, `services`, `providers`, `provider_services` |
| `commission.ts` | `commission_rules`, `user_commission_rates`, `commission_ledger` |
| `devices.ts` | `devices` |
| `logs.ts` | `audit_logs`, `alert_logs`, `otp_requests`, `provider_logs` |
| `support.ts` | `support_tickets` |
| `transactions.ts` | `transactions` |
| `users.ts` | `users`, `user_hierarchy`, `refresh_tokens` |
| `wallets.ts` | `wallets`, `wallet_ledger_groups`, `wallet_ledger_entries`, `wallet_idempotency` |

## Two existing frontend apps (relevant to admin dashboard design)

- **`apps/agent-portal`** — agent-facing portal (Retailer/Distributor/SD login, transact: DMT/AEPS/BBPS/Payout)
- **`apps/admin-portal`** — existing platform admin app
