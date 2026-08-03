# Task 27C — Settlements module

## Size: L ⚠️ split if >1 chat
## Depends: 27B
## Queue: wallet-engine · 3 of 4

## Goal
Agent can withdraw settleable earnings to their verified bank via `postJournal`.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/core/ledger/postJournal.ts` | Write path + settleable |
| `apps/backend/src/core/ledger/flowMatrix.ts` | SETTLEMENT_DEBIT / SETTLEMENT_PAYOUT |
| `apps/backend/src/db/postgres/schema/accounts.ts` | block_* flags, settleable |
| `apps/backend/src/modules/wallet/wallet.ledger.ts` | Cut-over patterns |

## Steps
1. Migration: `agent_settlement_accounts`, `settlement_requests`.
2. Request: debit wallet → SETTLEMENT_PAYABLE (settleable + balance checks).
3. Payout success/fail → payout journal or REVERSAL.
4. Enforce one active settlement bank; respect `block_settlement`.

## Do NOT
- VAN webhooks, float routes, peer transfers, OD
- Explore whole repo

## Done when
- [ ] Cannot settle more than settleable
- [ ] Advance (non-settleable) cannot leave to bank
- [ ] Failed payout restores via reversal journal
