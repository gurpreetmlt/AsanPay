# Cash collection (CMS) — wallet callbacks

Size: **M** · Surfaces: backend (+ flip Coming soon on web + mobile)

## Why

The provider moves money for cash collection through **our** callbacks. Status `"1"` = we accept
liability for the amount. Today every CMS wallet action on our callback URL is declined (no debit
handler yet). Service on/off stays with Admin service controls (`cms` group) — no code flag.

## Callback flow (POST to the Noble callback URL, field `action`)

| action | We must | Reply |
|---|---|---|
| `balance_check` | merchantId → retailer (mobile); txn exists in `cms_transactions`; main wallet ≥ amount | `"1"` / `"0"` |
| `balance_check_debit` | **Idempotent** main-wallet debit for `transactionId` (ledger, service code CMS); store billerId/billerName/mobile; status `pending` | `"1"` only after the debit commits |
| `transaction_post` | `tranStatus` Success → `success`, save utr + commission; Fail → refund the debit once, `failed` | `"1"` |

All JSON fields are strings. `transaction_post` can arrive ~15 min later — the status check API stays as fallback.

## Status (1 Nov)

Provider dashboard shows CMS **LIVE**. Agent web opens the provider page, biller lookup works and every
Initiate creates a `cms_transactions` row (`initiated`). Money still blocked by the decline branch — the
test txn stopped before Confirm, so no wallet callback has reached us yet.

## Build plan (reuse the ledger engine — no new money code, no migration)

1. **`balance_check_debit`** → `executeServiceTxn` with actor = `cms_transactions.userId` (+ role),
   `serviceCode: "CASH_COLLECTION"`, `direction: "debit"`, `walletType: "main"`,
   `idempotencyKey: "cms:<transactionId>"`, `amount` from the callback, metadata
   `{ cmsTransactionId, billerId, billerName, depositorMobile }`, `invoke` returns a **pending**
   `ProviderResult` (no outbound call). Reply `"1"` only when the returned txn is `pending` / `initiated`
   (debit committed); replay of the same `transactionId` returns the same row (no second debit).
   Insufficient balance / KYC / service off → `HttpError` → reply `"0"` with that message.
2. **`balance_check`** → read-only: merchantId = retailer mobile of the `cms_transactions` row, main
   wallet available ≥ amount.
3. **`transaction_post`** → find `transactions` by `idempotencyKey = cms:<transactionId>` →
   `settleTxnFromProviderCallback(txnRef, { status, data: { commission, utr, transactionId } })`.
   Success commits + runs commission; Fail reverses the debit once (finalizeTxn locks the row).
   Also update `cms_transactions` (status, utr, billerName, amount).
4. Commission: `withProviderEconomics` stores `commission` in `metadata.provider`. Provider income for
   the split = biller margin from `cms_biller_rates` (PL-37) when the biller is known, else the callback
   `commission`; role split = rate card share (50 / 10 / 0) or the biller row's margins. **Confirm the
   margin unit (% of amount vs ₹ per txn) first.**
5. `checkCashCollection` (status API fallback) settles the ledger txn when the provider status is final
   and `transaction_post` never came.

## Prod prerequisites (check before going live)

- `services` row `CASH_COLLECTION` active with min / max amount (`assertAmountWithinLimits` needs max)
- Provider route for `CASH_COLLECTION` (`resolveProvidersForService`)
- Test retailer KYC `verified`, main wallet funded, Admin service group `cms` on
- One real callback body per action from `logs.provider_logs` (field names) before coding replies

## Read ONLY

- `apps/backend/src/modules/providers/noble/webhook.routes.ts` — `CMS_WALLET_ACTIONS` decline branch
- `apps/backend/src/modules/providers/noble/cms.service.ts`
- `apps/backend/src/modules/wallet/wallet.ledger.ts` — debit / refund journal helpers
- `apps/backend/src/modules/transactions/txn.service.ts` — `settleTxnFromProviderCallback` pattern

## Done when

- [ ] Debit + refund are idempotent per `transactionId` (replayed callback never double-debits)
- [ ] Unknown txn / merchant mismatch / low balance → `"0"` with a clear message
- [ ] Commission per rate card on success
- [ ] Unit tests: replay, low balance, fail → refund once
- [ ] Decline branch in `webhook.routes.ts` replaced by the real handler
- [ ] Callback URL with the noble key shared with the provider for CMS
