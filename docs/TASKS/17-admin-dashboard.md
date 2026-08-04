# Task 17 — Admin Dashboard Stats

## Size: M

## Read ONLY
| Path | Why |
|------|-----|
| `apps/admin-portal/app/dashboard/page.tsx` | Current UI |
| `apps/backend/src/modules/wallet/wallet.service.ts` | Balances |
| `apps/backend/src/modules/transactions/txn.service.ts` | GMV queries |

## Stats needed
GMV today/month, txn count, total float, active retailers/distributors, pending KYC

## May need NEW
- `GET /admin/stats` route — add in new admin module

## Do NOT read
- Full admin prompt doc — implement stats only

## Done when
- [ ] Stat cards on admin dashboard
- [ ] API returns real counts from Postgres
