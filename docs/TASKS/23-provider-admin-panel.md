# Task 23 — Admin: Providers panel + Transactions detail

## Size: L (split — Part A first, Part B second, across chats)
## Depends: 22 (PaySprint adapter, so there are 2+ providers to actually list)
## Branch: `api-providers`
## Full spec: pasted by user in session 2026-07-21 — condensed here, ask user to
## re-paste the full "AsanPay — Admin Panel: Providers & Transactions" spec
## if sub-details are needed (attempt-history UI, reconciliation copy, etc.)

## Goal (1 line)
`Developer Options → Providers`: one collapsible table grouped by service,
showing registered adapters (from `provider.registry.ts`) mapped to DB rows
(`provider_services`) — toggle active/disable, set priority, no code editing.
Plus admin-only columns on the Transactions list/detail (provider, attempt
history, wallet ledger, reconciliation).

## Existing infra — do NOT redesign
- `providers`, `services`, `provider_services` tables **already exist**
  (`apps/backend/src/db/postgres/schema/catalog.ts`) — extend with columns
  needed (commission_rate, min/max limit, onboarding_stage, health_percent,
  last_changed_by/at) via a new migration, don't recreate the tables.
- `provider.registry.ts` already maps code → adapter instance — the admin
  panel lists what's registered here, cross-joined with `provider_services`.
- `transactions`, `wallet_ledger_*` (`apps/backend/src/db/postgres/schema/wallets.ts`),
  and `provider_logs` (`apps/backend/src/db/postgres/schema/logs.ts`) **already
  exist** — Part B is mostly admin APIs + UI reading these, NOT new core
  tables. Only maybe-missing: `transaction_attempts` (or derive attempts from
  `provider_logs` filtered by `txnRef` — check before adding a table) and
  `reconciliation_log` (Task 24 decides if needed).

## Part A — Providers panel (do this half first)
- Single page, one table, collapsible service groups (not per-service tabs)
- Row: provider name, status toggle, priority (editable), health %, last changed
- Bulk "disable all" per service group
- Provider-service mapping stores: status, priority, commission, min/max limit,
  onboarding_stage (`Testing → Live → Deprecated`)
- **No auto-failover for money-moving calls** — manual toggle only, except:
  toggling a provider off immediately routes *new* txns to next priority
  (deliberate human action = safe). Pending txns on the disabled provider
  still get status-rechecked, never abandoned.
- Read-only calls (bank list, balance, status-check) — safe to auto-switch

### 🟡 Part A — shipped (this chat), first cut only
- ✅ Backend: `GET /admin/providers` (grouped by service), `PATCH /admin/providers/:providerServiceId` (isActive/priority), `POST /admin/providers/services/:serviceId/disable-all` — [admin.service.ts](../../apps/backend/src/modules/admin/admin.service.ts), [admin.routes.ts](../../apps/backend/src/modules/admin/admin.routes.ts)
- ✅ Frontend: `apps/admin-web/app/developer-options/providers/page.tsx` + nav entry in `AdminShell.tsx` ("Developer Options → Providers")
- ✅ Type-checks clean (backend + admin-web)
- ⬜ **Not done**: commission_rate/min-max-limit/onboarding_stage/health_percent/last_changed_by columns (no migration written — current page only exposes isActive + priority, the columns that already exist on `provider_services`)
- ⬜ **Not done**: AEPS/DMT service codes are invisible to this panel — they still route via `AEPS_PROVIDER_MODE` (see `aepsMode.ts`), not `provider_services`. This panel only affects other services (BBPS/recharge today). Migrating AEPS/DMT onto this panel is a separate decision — it changes how live InstantPay AEPS traffic routes today, don't do it casually.
- ⬜ **Not tested against a running server/DB** — no `npm run dev:backend` / `npm run db:migrate` was run this session (Terminal-only per CLAUDE.md); verify manually before trusting this in production.
- ✅ [seedProviders.ts](../../apps/backend/scripts/seedProviders.ts) (`npm run seed:providers -w @asanpay/backend`) — seeds `providers` rows (eko/instantpay/paysprint) + `provider_services` rows for every BBPS category service (mapped to `eko`, since InstantPay/PaySprint BBPS is unimplemented). This also fixes a real gap: BBPS/recharge txns were resolving 0 providers (503 NO_PROVIDER_AVAILABLE) before this ran, since no `provider_services` rows existed at all — not just a panel-display issue.
- Removed the duplicate sidebar Logout button in `AdminShell.tsx` (already in the `AdminHeader` user-menu dropdown).
- **Redesigned to category-level grouping** (2026-07-21, user feedback: 30 individual BBPS tiles was noise since they all share one real provider). `listProvidersAdmin` now returns one row per `service_categories` row (DMT, AEPS, BBPS, ...) with one sub-row per distinct provider underneath — not per catalog tile. New endpoints: `PATCH /admin/providers/categories/:categoryId/provider/:providerId`, `POST /admin/providers/categories/:categoryId/disable-all` (both act on every `provider_services` row in that category at once). Old per-service endpoints removed.
- `GET /admin/providers` now also returns `railInfo` (`getAepsDmtRailInfo()`) — read-only `{ mode, activeProviderCode, note }` sourced from `AEPS_PROVIDER_MODE`, shown as an info banner above the category list so AEPS/DMT aren't invisible, without pretending they're toggleable through this table.

### 🔴 2026-07-21 — AEPS/DMT migrated onto provider_services (user-approved, read before touching)
User explicitly asked to migrate AEPS/DMT off the single `AEPS_PROVIDER_MODE` switch so they're
admin-toggleable like BBPS. Done:
- `AEPS_ROUTED_SERVICE_CODES` (`aepsMode.ts`) trimmed to **Nepal remittance only** — AEPS/DMT
  product operations (balance/withdraw/deposit/mini-statement/bank-list/Aadhaar-Pay/agent daily
  2FA/DMT remitter-beneficiary-transfer-refund) now resolve via the normal multi-provider
  `resolveProvidersForService` path.
- **NOT migrated** (deliberately): Nepal remittance (`nepal_*`, `MONEY_TRANSFER`) and merchant
  onboarding/eKYC (`onboarding.service.ts`) — these call InstantPay-specific endpoints directly,
  not through `ProviderAdapter`, so there's nothing generic to route to yet. Still governed by
  `AEPS_PROVIDER_MODE`.
- `agentAuth.ts`'s daily-2FA core call already went through `resolveProvidersForService("agent_auth")`
  — safe to migrate. Its `isInstantPayAepsMode()` check is only an optional InstantPay-specific
  status enrichment (outlet login status), wrapped in try/catch — degrades gracefully under PaySprint.
- [seedProviders.ts](../../apps/backend/scripts/seedProviders.ts) rewritten: adds two hidden
  categories (`AEPS_RAIL`, `DMT_RAIL`, `serviceCategories.isActive=false` — never shown in the
  retailer catalog), seeds a `services` row per AEPS/DMT operation code, and seeds all 3
  providers (eko/instantpay/paysprint) per operation — **whichever matches the CURRENT
  `AEPS_PROVIDER_MODE` at seed time is marked primary+active**, the other two present but
  inactive, so running the seed does not silently change live routing. Re-run after changing
  `AEPS_PROVIDER_MODE` in a fresh environment to keep them in sync.

### 🟡 2026-07-21 — per-service granularity + pinned order (user feedback)
- Category order pinned: **AEPS → DMT → everything else** (`PINNED_CATEGORY_ORDER` in `admin.service.ts`) without touching `serviceCategories.displayOrder` (that field also drives the retailer-facing tile grid — deliberately left alone).
- Each category now also returns a `services[]` breakdown; the panel has a collapsible "View N individual services" sub-table so one biller (e.g. just "DTH") can be moved to a different provider independently of the rest of the rail. New endpoint: `PATCH /admin/providers/service/:providerServiceId` (single-row), alongside the existing category-level bulk endpoint.

### ⚠️ Known gap admin must know before toggling PaySprint on for DMT
Toggling only works per-category (all-or-nothing bulk), and PaySprint's DMT adapter is
**partial** (Task 22): `dmtRemitterRegister`/`RegisterVerify`/`Kyc`/`dmtBankList` still throw
`501 PROVIDER_NOT_IMPLEMENTED` (see `paysprint.adapter.ts`). **Do not activate PaySprint for the
DMT category in the panel until Task 22's remaining DMT gap is closed** — beneficiary/transfer/
refund would work, but a brand-new remitter couldn't register at all. AEPS is fully wired for
PaySprint (all methods real), safe to toggle once UAT-tested.

## Session order
Do Part A in its own chat. **Do Part B only after Task 24 ships** (attempt
history + wallet-ledger UI needs the generalized hold/confirm + audit trail
Task 24 builds) — order is 23A → 24 → 23B, not 23A → 23B → 24.

## Part B — Transactions (do after Task 24, not right after Part A)
- List columns: Txn ID, Service, Provider*, Provider Txn ID*, Amount, Status, Retailer, Last Changed (*admin-only, **stripped server-side by role**, not just hidden in UI)
- Filters: service type, provider, status, date range; CSV export
- Detail page: summary, provider details (admin-only), attempt history
  (per-attempt request/response collapsed), wallet ledger (hold→confirm
  trail), reconciliation status, "Report to Provider" / "Retry" actions,
  full immutable audit log

## Read ONLY these files (Part A start)
| Path | Why |
|------|-----|
| `apps/backend/src/modules/providers/provider.registry.ts` | Source of registered adapters |
| `apps/backend/src/db/postgres/schema/catalog.ts` | Current `providers`/`provider_services` columns before writing migration |
| `apps/admin-web/components/layout/AdminShell.tsx` | Admin nav — add "Developer Options → Providers" here, NOT in `apps/web` (that's the agent portal, wrong app) |
| `docs/TASKS/17-admin-dashboard.md` | Existing admin panel conventions |

## Do NOT read
- Mobile app files — this is web admin only (`apps/admin-web`)
- `apps/web` — that's the agent portal (retailer/distributor), not admin
- InstantPay/PaySprint provider docs — not needed for this UI task

## Done when
- [ ] Part A: Providers panel live, toggle + priority work end-to-end against real `provider_services` rows
- [ ] Part A: role-based field stripping verified (retailer token can't see provider name via API response)
- [ ] Part B: Transactions list + detail page with attempt history and wallet ledger (once Task 24 schema exists)
