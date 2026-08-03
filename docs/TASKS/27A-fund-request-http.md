# Task 27A — Fund request + banking HTTP

## Size: M
## Depends: ledger cut-over (done)
## Queue: wallet-engine · 1 of 4

## Goal
Expose existing fund-request + banking services over Express with idempotency.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/fund-requests/fundRequest.service.ts` | Submit / approve / reject / credit |
| `apps/backend/src/modules/fund-requests/matching.ts` | Match engine |
| `apps/backend/src/modules/banking/banking.service.ts` | Banks, statement import, suspense |
| `apps/backend/src/app.ts` | Mount routers |
| `apps/backend/src/modules/wallet/wallet.routes.ts` | Route/auth pattern to copy |

## Steps
1. Add `fund-requests/*.routes.ts` + `banking/*.routes.ts` (auth + role guards).
2. Require `Idempotency-Key` on money-mutating POSTs.
3. Mount under `/api/fund-requests` and `/api/banking`.
4. No UI this chat — API only.

## Do NOT
- Settlements, VAN webhooks, recon cron, mobile/web UI
- Explore outside Read ONLY paths

## Done when
- [x] Retailer can submit FR via API
- [x] Admin can approve/reject/credit via API
- [x] Statement import endpoint works
- [x] Double-submit same idem key does not double-credit
