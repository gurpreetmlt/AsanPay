# Task 14 — BBPS & Recharge

## Size: M

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/transactions/txn.routes.ts` | BBPS/recharge |
| `apps/backend/src/modules/providers/adapters/paysprint.adapter.ts` | Mock pay |
| `apps/agent-portal/components/dashboard/CategorySection.tsx` | Service tiles |

## Flow
Fetch bill → confirm → pay → receipt (recharge: direct amount)

## Test
Retailer → Mobile recharge tile → mock success

## Done when
- [ ] Fetch + pay flow
- [ ] Wallet debit atomic
- [ ] Receipt page
