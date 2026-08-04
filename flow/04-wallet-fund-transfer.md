# 04 — Wallet fund & transfer (down)

## Admin mint
- `POST /api/wallet/fund` + txn PIN
- Self or `targetUserId` = **direct Super Dist** only
- Admin **cannot** use `/wallet/transfer`

## Parent → child transfer
- Roles: Super Dist → Dist, Dist → Retailer
- `POST /api/wallet/transfer` — direct child + role pair + active + actor KYC + txn PIN
- Idempotency key required
- Ledger `referenceType: downline_transfer`

## UI
- Agent: [`apps/agent-portal/app/wallet/page.tsx`](../apps/agent-portal/app/wallet/page.tsx) + `FundForm`
- Admin: [`apps/admin-portal/app/wallet/page.tsx`](../apps/admin-portal/app/wallet/page.tsx)

## Code
- [`wallet.service.ts`](../apps/backend/src/modules/wallet/wallet.service.ts) — `transferToChild`, `adminFundOwnWallet`
- [`wallet.ledger.ts`](../apps/backend/src/modules/wallet/wallet.ledger.ts) — double-entry
