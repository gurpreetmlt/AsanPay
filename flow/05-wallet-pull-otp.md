# 05 — Wallet pull / Wapas (OTP)

Parent collects money **from** direct child.

## Flow
1. Parent opens downline → **Wapas**
2. `POST /api/wallet/pull/request` `{ targetUserId, amount }`
   - OTP → **child mobile** (`otp_purpose: wallet_pull`)
3. Parent enters child OTP + **own txn PIN**
4. `POST /api/wallet/pull/confirm` → ledger child main → parent main (`upline_pull`)

## Rules
- Same hierarchy as transfer: SD↔Dist, Dist↔Retailer (direct + active)
- Child must have enough balance
- Idempotency on confirm
- Dev may return OTP in response when expose-OTP env is on

## UI
- [`apps/agent-portal/components/dashboard/PullForm.tsx`](../apps/agent-portal/components/dashboard/PullForm.tsx)
- Wallet list: Fund + Wapas buttons

## Mobile
- Pull UI **not** shipped yet (next chat)

## Code
- `requestPullFromChild` / `confirmPullFromChild` in [`wallet.service.ts`](../apps/backend/src/modules/wallet/wallet.service.ts)
- Routes: `/api/wallet/pull/request`, `/api/wallet/pull/confirm`
- Migration: `0015_wallet_pull_otp.sql`
