# Task 27D — VAN + webhook auto-credit

## Size: M
## Depends: 27A (fund-request credit path)
## Queue: wallet-engine · 4 of 4

## Goal
Path A top-up: bank webhook on virtual account → DEPOSIT_RECEIVE + DEPOSIT_CREDIT.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/db/postgres/schema/banking.ts` | `virtual_accounts` |
| `apps/backend/src/modules/banking/banking.service.ts` | Statement / suspense helpers |
| `apps/backend/src/modules/fund-requests/fundRequest.service.ts` | Two-journal credit pattern |
| `apps/backend/src/core/ledger/postJournal.ts` | Idempotent journals |

## Steps
1. Webhook route (signature verify) → match VAN → owner account.
2. Post DEPOSIT_RECEIVE + DEPOSIT_CREDIT with idem key from bank txn id.
3. Unmatched → UNIDENTIFIED_CREDIT to suspense.
4. Best-effort notify outside the money txn.

## Do NOT
- Settlements, recon, UI polish beyond minimal admin visibility
- Explore outside Read ONLY

## Done when
- [x] Same webhook replay never double-credits
- [x] Unknown VAN money goes to suspense, not a guessed wallet
