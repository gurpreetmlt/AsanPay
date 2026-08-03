# Task 27B — Ledger reconciliation cron

## Size: M
## Depends: 27A
## Queue: wallet-engine · 2 of 4

## Goal
Run ledger recon checks on a schedule; add the missing checks from the wallet-engine spec.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/reconciliation/checks.ts` | Existing 5 checks + `runReconciliation` |
| `apps/backend/src/server.ts` | Where to wire the interval |
| `apps/backend/src/db/postgres/schema/reconciliation.ts` | Exceptions table |
| `apps/backend/src/modules/bootstrap/systemAccounts.ts` | Active tenants loop pattern |

## Steps
1. Wire `runReconciliation(tenantId)` for each active tenant on an interval (env-gated).
2. Add checks: stale transit (>4h), stale fund request (>24h), unmatched bank credits (>48h) if data exists.
3. Never auto-fix — only write `reconciliation_exceptions`.

## Do NOT
- Settlements, float management, UI dashboards
- Explore outside Read ONLY

## Done when
- [x] Interval runs in `server.ts` (or document why separate process)
- [x] New findings land in `reconciliation_exceptions`
- [x] Env flag can disable the job
