# Task 24 — Shared financial-safety layer (idempotency, hold/confirm, reconciliation)

## Size: L (split — schema first, then logic, then reconciliation job)
## Depends: 22 (PaySprint adapter — this is what makes multi-provider failover real)
## Branch: `api-providers`
## Full spec: see Part C of "AsanPay — Admin Panel" spec (user pasted 2026-07-21)

## Goal (1 line)
One shared module every provider adapter money-call goes through — so PaySprint
(and any future provider) automatically inherits idempotency, hold→confirm
wallet pattern, and pending-recheck, instead of each adapter reimplementing it.

## Rules (non-negotiable — do not simplify)
1. Every txn has internal `txnRef`, sent to provider as `externalRef`. Retries reuse the same `txnRef`.
2. Only 3 states: `Success` (debit confirmed), `Failed` (auto-credited back), `Pending/TUP` (never auto-reverse or auto-retry from here).
3. Timeout ≠ Failed. Set `Pending`, background job rechecks via provider status API until confirmed.
4. Failover only on clean fail (explicit reject). Timeout → confirm via recheck first, never blind-retry a money-moving call on a second provider.
5. Wallet: Debit HOLD (not final) → provider call → Success: finalize debit / Fail: release hold / Pending: hold stays.
6. Daily reconciliation job: recheck every Pending txn + cross-check provider settlement file; mismatch → manual review queue, never auto-resolved.
7. Full immutable audit log per txn (attempt, response, switch, wallet action).

## Check before building
`apps/backend/src/modules/transactions/txn.service.ts` already has
`executeServiceTxn` + `recheckTxnStatus` with debit-hold + auto-reversal for
AEPS/DMT (see `docs/TASKS/21-instantpay-adapter.md` — "TUP" pending pattern
already exists there for InstantPay). Wallet ledger (`wallet_ledger_*`) and
raw provider call logs (`provider_logs`) also already exist. **This task
generalizes/wires the existing pattern for PaySprint**, not invents a new
one — read `executeServiceTxn`/`recheckTxnStatus` first before adding schema.

## Read ONLY these files
| Path | Why |
|------|-----|
| `apps/backend/src/modules/transactions/txn.service.ts` | `executeServiceTxn` + `recheckTxnStatus` — existing hold/reversal/recheck logic to generalize |
| `apps/backend/src/modules/providers/types.ts` | Where to add a common status/result shape if missing |
| `apps/backend/src/db/postgres/schema/wallets.ts` | Existing `wallet_ledger_*` — confirm attempt-level granularity before adding new tables |
| `apps/backend/src/db/postgres/schema/logs.ts` | Existing `provider_logs` — may already cover "attempt history"; only add `transaction_attempts`/`reconciliation_log` if this genuinely can't serve that role |

## Steps
1. Confirm current schema gap (transactions table exists? attempts/ledger separate tables or fields on txn row?)
2. Migration: add `transaction_attempts`, `wallet_ledger`, `reconciliation_log` if missing
3. Wrap `executeServiceTxn` (or extract a shared helper) so PaySprint DMT/AEPS calls (Task 22) use the same hold/confirm + pending-recheck path InstantPay already uses
4. Reconciliation background job (daily) — start with recheck-only, settlement-file matching can be a later task once providers share settlement file format

## Done when
- [ ] PaySprint money-moving calls (DMT transfer, AEPS withdraw) go through the same hold→confirm path as InstantPay
- [ ] Pending txns get auto-rechecked, never silently abandoned
- [ ] Audit log entries written for every attempt/switch/wallet action
