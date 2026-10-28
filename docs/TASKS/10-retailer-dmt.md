# Task 10 — Retailer DMT

## Size: L — split: (1) add beneficiary (2) transfer (3) receipt

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/transactions/txn.routes.ts` | DMT routes |
| `apps/backend/src/modules/transactions/txn.service.ts` | Transfer logic |
| `apps/backend/src/modules/providers/adapters/` (Noble DMT) | DMT provider |

## Flow
Add beneficiary → verify → transfer → receipt

## Do NOT read
- Commission module unless task says payout

## Test
Retailer login → DMT → mock transfer → wallet debit

## Done when
- [ ] Beneficiary CRUD or inline add
- [ ] Txn PIN before transfer
- [ ] Receipt with ref id
