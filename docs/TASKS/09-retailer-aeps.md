# Task 09 — Retailer AEPS

## Size: L — **3 alag chats mein split karo**
1. Withdraw form UI only
2. API wire + ServiceTxn write
3. Receipt screen

## Depends: 11-mobile-bottom-tabs (optional web: apps/agent-portal)

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/transactions/txn.routes.ts` | AEPS endpoints |
| `apps/backend/src/modules/transactions/txn.service.ts` | Txn logic |
| `apps/agent-portal/app/dashboard/page.tsx` | Retailer dashboard |
| `apps/mobile/src/screens/RoleHomeScreens.tsx` | Mobile entry |

## API
`POST /api/txn/aeps/withdraw` — retailer role, txn PIN required

## Do NOT read
- Full provider registry unless adding new adapter
- Legacy retailer-web

## Test
Login retailer `9333333333` → service tile → mock success receipt

## Done when
- [ ] Form: aadhaar, bank, amount
- [ ] Idempotency key on request
- [ ] Success/fail/pending states
