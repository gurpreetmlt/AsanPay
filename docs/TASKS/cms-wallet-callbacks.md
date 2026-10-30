# Cash collection (CMS) — wallet callbacks

Size: **M** · Surfaces: backend (+ flip Coming soon on web + mobile)

## Why

The provider moves money for cash collection through **our** callbacks. Status `"1"` = we accept
liability for the amount. Today every CMS wallet action is declined and the UI says Coming soon.

## Callback flow (POST to the Noble callback URL, field `action`)

| action | We must | Reply |
|---|---|---|
| `balance_check` | merchantId → retailer (mobile); txn exists in `cms_transactions`; main wallet ≥ amount | `"1"` / `"0"` |
| `balance_check_debit` | **Idempotent** main-wallet debit for `transactionId` (ledger, service code CMS); store billerId/billerName/mobile; status `pending` | `"1"` only after the debit commits |
| `transaction_post` | `tranStatus` Success → `success`, save utr + commission; Fail → refund the debit once, `failed` | `"1"` |

All JSON fields are strings. `transaction_post` can arrive ~15 min later — the status check API stays as fallback.

## Read ONLY

- `apps/backend/src/modules/providers/noble/webhook.routes.ts` — `CMS_WALLET_ACTIONS` decline branch
- `apps/backend/src/modules/providers/noble/cms.service.ts` — `CMS_WALLET_CALLBACKS_READY`
- `apps/backend/src/modules/wallet/wallet.ledger.ts` — debit / refund journal helpers
- `apps/backend/src/modules/transactions/txn.service.ts` — `settleTxnFromProviderCallback` pattern

## Done when

- [ ] Debit + refund are idempotent per `transactionId` (replayed callback never double-debits)
- [ ] Unknown txn / merchant mismatch / low balance → `"0"` with a clear message
- [ ] Commission per rate card on success
- [ ] Unit tests: replay, low balance, fail → refund once
- [ ] `CMS_WALLET_CALLBACKS_READY = true` → Coming soon disappears on web + mobile
- [ ] Callback URL with the noble key shared with the provider for CMS
