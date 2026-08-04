# Task 28 — Commission payout report

## Size: M
## Depends: 19-commission-schemes

## Goal
Admin report: commission ledger payouts (who earned what, from which txn).

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/commission/commission.service.ts` | ledger + earnings |
| `apps/backend/src/modules/admin/admin.routes.ts` | mount admin APIs |
| `apps/admin-portal/app/commission/page.tsx` | schemes UI — add report |

## Steps
1. Admin API: list + summary from `commission_ledger` (role / date filters)
2. Admin `/commission` page: payouts table under schemes
3. CHECKLIST: Commission payout report

## Done when
- [x] `GET /admin/commission/payouts` returns rows + totals
- [x] Admin UI shows recent payouts with filters
- [x] BBPS / schemes builder unchanged
