# 05 — Wallet reverse / pull (PIN only — same as Transfer)

Parent collects money **from** direct child (SD→Dist, Dist→Retailer).

## Flow
1. Parent opens Network / Wallet → **Wallet** on downline → choose **Reverse**
2. Enter amount + optional note → Continue
3. Enter **own 4-digit txn PIN** (same as Transfer — **no child OTP**)
4. `POST /api/wallet/pull/confirm` `{ targetUserId, amount, txnPin, idempotencyKey }`
   → ledger child main → parent main (`upline_pull`)

## Rules
- Same hierarchy as transfer: SD↔Dist, Dist↔Retailer (direct + active)
- Child must have enough balance
- Idempotency on confirm
- Legacy `POST /api/wallet/pull/request` (child OTP) is optional / unused by current UI

## UI
- Web: `WalletActionForm` (Transfer / Reverse tabs)
- Mobile: Network → Wallet modal (Transfer / Reverse)

## Code
- `confirmPullFromChild` in `apps/backend/src/modules/wallet/wallet.service.ts`
- Route: `/api/wallet/pull/confirm`
