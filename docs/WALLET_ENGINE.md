# AsanPay — Wallet & Ledger Engine

**Status doc: as-built + gap map.** Every section is tagged so you can tell the
shipped system apart from the target design.

| Tag | Meaning |
|---|---|
| ✅ BUILT | Exists in `apps/backend`, migrated, in use |
| 🟡 PARTIAL | Exists but diverges from the target design |
| ❌ NOT BUILT | No table, no code — target design only |

**Actual stack:** Express 5 · PostgreSQL · **Drizzle ORM** · Redis (cache/OTP) ·
module folders under `apps/backend/src/modules`
**Actual money type:** `numeric(14, 2)` — **rupees**, not paise. `toPaise()` /
`fromPaise()` in [decimal.ts](apps/backend/src/modules/wallet/decimal.ts) convert to
integer paise for arithmetic only; storage and transport stay decimal strings.
**Tenancy:** none. Single tenant. No `tenant_id` column exists anywhere.

> The original spec assumed NestJS + Prisma + `BIGINT` paise + multi-tenancy.
> None of those are true. Names below are the **real** ones.

---

## 0. Golden Rules

| # | Rule | Status |
|---|---|---|
| 1 | Admin is an operator, not a wallet | 🟡 — admin **owns** the aggregator wallet (`wallet_kind = 'aggregator'`); admin funds via `POST /wallet/fund` |
| 2 | Treasury never transfers assets | ❌ — no treasury layer exists |
| 3 | One account is the only source of hierarchy credit | ✅ — the root admin's `aggregator` wallet, enforced by route RBAC (`/wallet/fund` is `admin` only) |
| 4 | Every money movement creates a journal with balanced entries | ✅ — `wallet_ledger_groups` (1) → `wallet_ledger_entries` (N) |
| 5 | Ledger is append-only | 🟡 — no code updates/deletes entries, but **no DB trigger enforces it** |
| 6 | Balance is a cached projection written in the same transaction | ✅ — `wallets.balance` updated inside the same `db.transaction()` |
| 7 | Reconciliation never writes balances directly | ❌ — no reconciliation module |
| 8 | Money never travels over a queue | ✅ — all movement is synchronous in-transaction |
| 9 | Nothing hardcoded; accounts resolved by code | 🟡 — wallets resolved by `(user_id, wallet_type)` UUID, not by a `code` column |
| 10 | When in doubt money goes to SUSPENSE | ❌ — no suspense account |
| 11 | Treasury's only outbound destination is the company wallet | ❌ — n/a, no treasury |

### Explicitly out of scope — ✅ HOLDS

**Overdraft / credit (OD) is not part of this system.** There is no `credit_limit`,
no `od_ledger`, no receivable against an agent. Enforced in two places:

* `wallets_balance_nonnegative` CHECK constraint on `wallets.balance`
* an explicit `nextPaise < 0 → INSUFFICIENT_BALANCE` guard in `applyLockedEntry()`

Do not add this feature and do not leave hooks for it.

---

## 1. Account Model

### 1.1 What exists today — 🟡

There is no chart of accounts. There is one `wallets` table, keyed by user:

```ts
wallets {
  id           uuid pk
  user_id      uuid → users.id
  wallet_type  'main' | 'aeps'          // unique together with user_id
  wallet_kind  'ledger' | 'aggregator'  // exactly one 'aggregator' row expected
  balance      numeric(14,2) >= 0
  hold_balance numeric(14,2) >= 0
  version      integer                  // optimistic-lock guard
}
```

`wallet_kind` is the only structural class distinction:

| Kind | Meaning | Balance check on debit? |
|---|---|---|
| `aggregator` | the platform's single real-money settlement counterparty at the provider; root admin's `main` wallet | Yes (same code path) |
| `ledger` | every SD / Distributor / Retailer internal book balance | Yes |

Hierarchy roles come from `users.role` (`admin`, `master_distributor`,
`distributor`, `retailer`) and `user_hierarchy` (closure table:
`ancestor_id`, `descendant_id`, `depth`).

### 1.2 Divergence from target — ❌

Target design wanted `ASSET / LIABILITY / INTERNAL / INCOME / EXPENSE` account
classes with a `(tenant_id, code)` resolver and per-class locking policy. Not built.
Consequences today:

* **Every** wallet is row-locked on every transfer, including the aggregator wallet.
  Since admin funding is a single-sided credit and hierarchy transfers are
  SD→D / D→R, the aggregator row is not on the hot path for downline transfers — but
  it is for every admin fund and every service transaction settlement.
* There is no `TREASURY_001`, `COMPANY_001`, `FLOAT_*`, `BANK_*`, `TRANSIT_*`,
  `SETTLE_*`, `SUSPENSE_*`, `COMMISSION_INCOME`, or `BANK_CHARGES` account.
* Commission is not an INCOME account — it lives in a dedicated `commission_ledger`
  table plus `commission_rules` / `user_commission_rates`.

---

## 2. Ledger Model — ✅ BUILT

```
wallet_ledger_groups (1) ──< wallet_ledger_entries (N)
```

* A group is one atomic business event (the spec's "journal").
* Entries carry direction via `entry_type` (`debit` | `credit`); `amount` is always
  positive (`CHECK amount > 0`).
* Each entry stores `balance_after`.
* `wallet_ledger_groups_ref_uidx` — unique on `(reference_type, reference_id)` where
  `reference_id IS NOT NULL AND reference_type <> 'commission'`. Commission is excluded
  on purpose: one settled txn fans out to one group per beneficiary, guarded instead by
  `commission_ledger`'s own `(transaction_id, beneficiary_user_id)` unique key.

### 2.1 The write path — 🟡

The single write path is [wallet.ledger.ts](apps/backend/src/modules/wallet/wallet.ledger.ts).
It exposes three functions, not one `postJournal()`:

```ts
// balanced two-sided move — the normal case
await transferBetweenWallets({
  fromWalletId, toWalletId,
  amount: "50000.00",
  referenceType: "downline_transfer",
  referenceId: someUuid,
  description: "SD funding",
}, existingTx);          // optional — join the caller's transaction

// single-sided credit: money entering the system from outside
await fundWallet({ walletId, amount, referenceId, description }, existingTx);

// bookkeeping mirror only — moves nothing, updates wallets.hold_balance
await adjustWalletHold(tx, walletId, amount, "hold" | "release");
```

`transferBetweenWallets()` does, in order:

1. Reject self-transfer.
2. Sort the two wallet ids and `SELECT ... FOR UPDATE` in **sorted-id order** —
   direction-independent, so concurrent opposite transfers between the same pair
   cannot deadlock. ✅ matches the target design's ascending-lock rule.
3. Insert the ledger group.
4. Apply debit leg, then credit leg, each: recompute balance in paise, reject if
   negative, `UPDATE wallets` (balance + `version + 1`), insert the entry with
   `balance_after`.

**Gaps vs target:**

| Target step | Status |
|---|---|
| Idempotency check inside the write path | 🟡 — lives outside, in `wallet_idempotency` and `transactions.idempotency_key` |
| Account code → id resolution, Redis-cached | ❌ — callers pass wallet UUIDs |
| Flow matrix validation | ❌ — **not implemented** |
| Σ DR = Σ CR assertion before commit | 🟡 — structurally guaranteed (always exactly one debit + one credit), never asserted |
| Lock only balance-checked accounts | ❌ — every wallet is locked |
| `performed_by` on the journal | ❌ — no such column; actor lives in `audit_logs` |
| `txn_type` on the journal | 🟡 — `reference_type` plays this role |

### 2.2 Flow Matrix — ❌ NOT BUILT

There is no flow-matrix table. Allowed movement is enforced by **route RBAC** in
[wallet.routes.ts](apps/backend/src/modules/wallet/wallet.routes.ts):

| Route | Role gate | Effect |
|---|---|---|
| `POST /wallet/fund` | `admin` | single-sided credit, `reference_type = 'external_funding'` |
| `POST /wallet/transfer` | `master_distributor`, `distributor` | downline transfer, `reference_type = 'downline_transfer'` |
| `POST /wallet/pull/request` → `/pull/confirm` | `master_distributor`, `distributor` | OTP-gated reverse transfer, `reference_type = 'upline_pull'` |
| `GET /wallet/me`, `GET /wallet/ledger` | any authenticated | read |

Live `reference_type` values in the codebase:

```
external_funding · downline_transfer · upline_pull · service_txn · commission · reversal
```

**Known risk:** because there is no matrix, nothing at the ledger layer prevents an
arbitrary wallet pair from being wired together by a future caller. RBAC on the route
is the only gate. If the flow matrix is ever built, it belongs inside
`transferBetweenWallets()`, keyed on `reference_type` + the two wallets' `wallet_kind`
and owners' `users.role`.

---

## 3. System Accounts & Bootstrap — ❌ NOT BUILT

There is no `seedSystemAccounts()`, no boot-time verifier, no `is_system` /
`is_protected` / `is_hidden` flags, no advisory-lock seeder. The aggregator wallet is
created as part of normal admin user seeding (`docs/TASKS/07-database-seed.md`).

Nothing makes the app refuse to boot if the aggregator wallet is missing or if a
second `wallet_kind = 'aggregator'` row appears. Both are worth adding — the second
one is a one-line partial unique index:

```sql
CREATE UNIQUE INDEX wallets_single_aggregator_uidx
  ON wallets ((wallet_kind)) WHERE wallet_kind = 'aggregator';
```

---

## 4. Money Flows (as implemented)

Amounts are decimal-string rupees exactly as stored.

### 4.1 Admin funding — ✅ (single-sided)

```
external_funding
    Cr  <admin aggregator wallet>   50000.00
```

**This is intentionally unbalanced.** There is no internal counterparty to debit —
money entered from outside (a reconciled bank transfer). `reference_type =
'external_funding'` marks the documented exception to the balanced-group rule.

> Target design instead wanted two journals (`DEPOSIT_RECEIVE` then `DEPOSIT_CREDIT`)
> through `BANK_* → COMPANY_001 → RTL_*`, keeping every group balanced. Adopting that
> requires the account-class model from §1.2 first.

### 4.2 Company capital allocation — ❌ NOT BUILT

No `FLOAT_CONTROL`, no allocation journal, no maker-checker. §4.1 is the whole story.

### 4.3 Bank → Aggregator float — ❌ NOT BUILT

No `float_routes`, no `float_transfers`, no `TRANSIT_*`, no stale-transit alarm.
Float at the provider is tracked by the provider, not in our ledger.

### 4.4 Hierarchy transfer — ✅

```
downline_transfer
    Dr  <SD wallet>          500000.00
    Cr  <Distributor wallet> 500000.00
```

Both legs in one group, both wallets locked in sorted-id order.

### 4.5 Upline pull — ✅ (not in the original spec)

An upline can pull balance back from a direct downline, OTP-confirmed
(`otp_requests`, two-step `/pull/request` → `/pull/confirm`).

```
upline_pull
    Dr  <Distributor wallet> 10000.00
    Cr  <SD wallet>          10000.00
```

### 4.6 Service transaction (DMT / BBPS / recharge / AePS) — ✅

Retailer wallet ↔ aggregator wallet, `reference_type = 'service_txn'`,
`reference_id = transactions.id`. `transactions` carries `txn_ref` (unique),
`idempotency_key`, `provider_txn_id`, `status`, `wallet_type`, `customer_fee`,
`metadata`. `adjustWalletHold()` mirrors in-flight amounts into `hold_balance` for the
retailer-facing "Locked vs Available" display; it moves no money.

### 4.7 Commission — ✅

Separate concern from the entry model in the target spec: `commission_rules` +
`user_commission_rates` decide the split, `commission_ledger` records
`(transaction_id, beneficiary_user_id)` uniquely, and payout posts a ledger group with
`reference_type = 'commission'` per beneficiary.

### 4.8 Reversal — ✅

`reference_type = 'reversal'`, posted as a fresh balanced group. There is **no
`reverses_id` foreign key** linking a reversal back to the original group — the link is
only via a shared `reference_id`. Worth adding if disputes need a hard trace.

### 4.9 Settlement payout / unidentified credit — ❌ NOT BUILT

See §6 and §5.

---

## 5. Fund Request Flow — ❌ NOT BUILT

Neither path from the target design exists.

| Path | Status |
|---|---|
| A. VAN auto-credit (bank webhook) | ❌ no `virtual_accounts`, no webhook ingest |
| B. Fund request + matching engine | ❌ no `fund_requests`, no `bank_statement_lines`, no `bank_accounts` |

Today the only way money enters is an **admin manually calling `POST /wallet/fund`**
after checking the bank account by hand. There is:

* no receipt upload, no SHA-256 image dedup
* no `(bank_account_id, reference_number)` unique constraint
* no state machine (`SUBMITTED → AUTO_MATCHED → CREDITED …`)
* no bank statement import, no matching tiers, no auto-credit ceiling
* no retailer-facing fund request dashboard or status chips

`wallet_idempotency (user_id, idempotency_key) → ledger_group_id` is what currently
prevents a double-submit of the same admin fund or downline transfer. That is the one
piece of §5 that does exist, and it is the right primitive to build the rest on.

**This is the largest gap in the system.** §5 of the target design is a full module
(submission, statement import, matching engine, admin review, fraud controls) and is
still entirely on the roadmap. See `docs/TASKS/13-fund-management.md`.

---

## 6. Settlement & Payout — ❌ NOT BUILT

### 6.1 Two balances — ❌

The target design's `usable` vs `settleable` split does not exist. `wallets` has
`balance` and `hold_balance`, and **`hold_balance` is not the settleable column** — it
is a reporting mirror of in-flight debits, explicitly documented as holding no money.

Consequence: an AePS agent's wallet grows with every withdrawal they service and there
is no way for them to withdraw those earnings. Nothing distinguishes money the agent
deposited from money the agent earned.

If built, the target derivation is:

```sql
settleable = SUM(credit entries WHERE reference_type IN ('service_txn' /* AePS credits */, 'commission'))
           - SUM(debit entries  WHERE reference_type = 'settlement_payout')
usable     = wallets.balance - settleable
```

materialised as a third `numeric(14,2)` column on `wallets`, written in the same
transaction, with `CHECK (settleable >= 0 AND settleable <= balance)`.

### 6.2–6.4 Settlement requests, agent bank account, granular blocks — ❌

No `settlement_requests`, no `agent_settlement_accounts`, no penny-drop verification,
no "One Operator, One Bank" enforcement, no payout batches.

Blocking today is coarse: `users.is_active` (boolean) plus AePS-specific
`aeps_blocked` / `aeps_block_reason` / `aeps_edd_required`. There is **no**
`block_services` / `block_topup` / `block_settlement` / `block_login` split. Since
settlement does not exist, a blocked agent's earned balance is currently unreachable by
design — exactly the failure mode §6.4 of the target design exists to prevent. Fix the
flags in the same change that adds settlement, not after.

### 6.5 Receipts — 🟡

`pdfkit` is a dependency and `aeps_cash_receipts` exists for AePS cash deposits.
There is no 58 mm ESC/POS thermal payload endpoint and no `RECEIPT_REPRINT` audit action.

---

## 7. Reconciliation Engine — ❌ NOT BUILT

No `reconciliation_exceptions` table, no scheduled checks, no exception queue.
`alert_logs` (with `alert_type` / `severity` / `resolved_at`) is the closest existing
structure and is the natural place to land recon output.

The two checks worth building first, because they need no new tables:

| Job | Frequency | Check |
|---|---|---|
| Ledger vs cached balance | 15 min | `SUM(credit) - SUM(debit)` over `wallet_ledger_entries` per wallet `== wallets.balance` |
| Trial balance | daily | Σ debit == Σ credit across all groups **excluding `external_funding`** (single-sided by design) |

Solvency, bank-statement match, aggregator settlement and stale-transit checks all
depend on modules that do not exist yet.

---

## 8. Concurrency, Idempotency, Failure — ✅ mostly

* One ledger group = one DB transaction. ✅ `db.transaction()`, with `existingTx`
  pass-through so a transaction-status compare-and-swap and the money it authorizes
  commit or roll back together.
* Lock order: wallet ids **sorted ascending**, direction-independent. ✅
* Optimistic guard: `wallets.version` incremented on every balance write, alongside
  the row lock. ✅
* Idempotency: `wallet_idempotency (user_id, idempotency_key)` PK for wallet ops;
  `transactions.idempotency_key` + unique `txn_ref` for service transactions. ✅
* Balance floor: CHECK constraint + in-code guard. ✅
* **Never call a provider API inside a DB transaction** — reserve → call → confirm.
  🟡 the `hold_balance` mirror exists for this, verify each provider adapter
  (`modules/providers`, `modules/aeps`) actually keeps the HTTP call outside the tx.
* Provider timeouts are unknown state, not failure. 🟡 `transaction_status` enum
  carries the intermediate states — confirm no path auto-reverses on timeout.
* Drizzle notes: row locking is `.for("update")` on a select builder (no raw SQL
  needed). Money is `numeric` → returned as a **string**; never parse it to a JS
  `number`, always go through `toPaise()` / `fromPaise()`.

---

## 9. Security & Fraud Controls

### 9.1 Database-level protection — ❌

No `protect_system_accounts()` trigger, no append-only trigger on
`wallet_ledger_entries`, no restricted `GRANT`s. The app DB user can `UPDATE` and
`DELETE` ledger rows today. Immutability is convention only.

Cheapest high-value fix in this doc:

```sql
CREATE OR REPLACE FUNCTION raise_immutable() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'wallet_ledger_entries is append-only'; END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_immutable
BEFORE UPDATE OR DELETE ON wallet_ledger_entries
FOR EACH ROW EXECUTE FUNCTION raise_immutable();
```

Plus: revoke `DELETE` on `wallet_ledger_entries` and `wallet_ledger_groups` from the
application role.

### 9.2 Maker-checker — ❌

Not implemented anywhere. No `maker_id <> checker_id` constraint. Admin funding of any
size is a single-actor action.

### 9.3 Compliance framing — 🟡

(Not legal advice — verify with a fintech lawyer.)

| Requirement | Status |
|---|---|
| No agent-to-agent (peer) transfers | ✅ — only `admin → aggregator`, `SD → D`, `D → R`, and OTP-gated upline pull. No sibling route exists |
| Money moves downward along the hierarchy, outward only to the agent's own bank | 🟡 — downward ✅; outward path does not exist at all |
| Deposited advance not cash-withdrawable | 🟡 — true by omission, not by design (§6.1) |
| Label the balance "Balance"/"Advance", never "Wallet" | ❌ — code, routes and UI all say *wallet* throughout. Cosmetic to change in UI copy, invasive to change in schema |
| Per-agent statement for any date range | ✅ — `GET /wallet/ledger`, indexed on `(wallet_id, created_at)` |

### 9.4 Fund request fraud controls — ❌

All of them. See §5.

### 9.5 What does exist — ✅

`audit_logs` (actor, action, entity_type, entity_id, ip_address, created_at),
`provider_logs`, `alert_logs`, `devices` + `biometric_replay_guard`,
`aeps_bio_mismatch_counters`, `refresh_tokens` with revocation, `api_clients` +
`api_ip_whitelist`, txn-PIN with lockout (`txn_pin_failed_attempts`,
`txn_pin_locked_until`), rate limiters on every money route
(`walletTxnLimiter`, `otpRequestLimiter`), encrypted PAN/Aadhaar at rest.

---

## 10. Data Model — actual tables

```
users · user_hierarchy · refresh_tokens · devices · otp_requests
wallets · wallet_ledger_groups · wallet_ledger_entries · wallet_idempotency
transactions
commission_rules · user_commission_rates · commission_ledger
service_categories · services · providers · provider_services
aeps_cash_receipts · aeps_bio_mismatch_counters · biometric_replay_guard
audit_logs · provider_logs · alert_logs
support_tickets · api_clients · api_ip_whitelist
```

**Absent** (target design only): `accounts`, `account_balances`, `journals`,
`ledger_entries`, `bank_accounts`, `virtual_accounts`, `bank_statement_lines`,
`fund_requests`, `fund_request_events`, `settlement_requests`,
`agent_settlement_accounts`, `float_routes`, `float_transfers`,
`reconciliation_exceptions`.

Migrations live in `apps/backend/src/db/postgres/migrations` (Drizzle,
`0000` … `0021`), schema in `apps/backend/src/db/postgres/schema`.

---

## 11. Module Layout — actual

```
apps/backend/src/
├── db/postgres/
│   ├── schema/          drizzle table definitions
│   ├── migrations/      generated SQL + meta snapshots
│   └── repositories/    auditLog, device, otpRequest, providerLog
├── modules/
│   ├── wallet/          ledger (wallet.ledger.ts), service, controller, routes, decimal
│   ├── transactions/    service txn lifecycle
│   ├── aeps/            AePS + compliance
│   ├── commission/      rules, rates, payout
│   ├── providers/       InstantPay / PaySprint adapters
│   ├── kyc/ · onboarding/ · users/ · auth/
│   ├── admin/ · dashboard/ · catalog/ · support/ · notifications/
├── middleware/          auth, rbac, rateLimiter
├── cache/ · config/ · utils/
```

**Not built** as modules: `bootstrap`, `banking`, `fund-requests`, `settlements`,
`receipts`, `float-management`, `limits`, `reconciliation`, `reversal` (reversal is
inline in transactions), `reports`, `rbac` (middleware only, no module).

No lint boundary rule enforces that only `modules/wallet` touches the ledger tables.
Adding one is cheap and prevents the worst class of future bug:

```js
// eslint.config.js — no-restricted-imports on schema/wallets outside modules/wallet
```

---

## 12. Build Order — remaining

Done: ledger core, wallets, hierarchy transfer, upline pull, idempotency,
transactions, commission, AePS, providers, KYC, audit.

Next, in dependency order:

1. **Append-only trigger + revoked grants** on ledger tables (§9.1) — one migration, highest value/effort ratio
2. **Single-aggregator unique index** + boot verifier (§3)
3. **Ledger-vs-balance recon job** (§7) — no new tables needed, catches drift immediately
4. **Flow matrix** inside `transferBetweenWallets()` (§2.2) — close the "any wallet pair" hole
5. `bank_accounts` + `bank_statement_lines` + statement import (§5.4)
6. `fund_requests` + matching engine + admin review (§5.1–5.6)
7. VAN + webhook auto-credit (§5, path A)
8. **Settleable/usable split** on `wallets` (§6.1)
9. `settlement_requests` + `agent_settlement_accounts` + granular block flags (§6.2–6.4)
10. Thermal receipt payload (§6.5)
11. Maker-checker on admin funding + settlement approval (§9.2)
12. Full reconciliation suite + exception queue (§7)
13. Trial balance / solvency reports
14. Load test: 500 concurrent transfers, then verify every §13 invariant

---

## 13. Acceptance Criteria

### Should pass today — verify

- [ ] `SUM(credit) - SUM(debit)` per wallet equals `wallets.balance`, for every wallet
- [ ] Trial balance nets to zero across all groups excluding `external_funding`
- [ ] Two concurrent transfers between the same wallet pair, opposite directions, do not deadlock
- [ ] A wallet balance can never go negative — no code path allows it
- [ ] Replaying the same `(user_id, idempotency_key)` credits the wallet once
- [ ] Replaying the same `txn_ref` settles the transaction once
- [ ] Killing the process mid-transfer leaves no partial ledger group
- [ ] A retailer cannot call `POST /wallet/fund` (403)
- [ ] A retailer cannot transfer to a sibling retailer — no route exists
- [ ] `numeric` money is never parsed into a JS `number` anywhere in the money path

### Blocked on unbuilt work

- [ ] `UPDATE wallet_ledger_entries` fails at the database level — §9.1
- [ ] Exactly one `wallet_kind = 'aggregator'` row can exist — §3
- [ ] An invalid wallet-pair flow is rejected by the flow matrix — §2.2
- [ ] The same UTR cannot be claimed twice — §5
- [ ] An AePS credit increases the agent's settleable balance — §6.1
- [ ] An agent cannot settle more than their settleable balance — §6.1
- [ ] Deposited advance can be spent on services but never withdrawn to bank — §6.1
- [ ] Blocking services does not block settlement of already-earned money — §6.4
- [ ] A failed payout returns the exact amount via a reversal journal — §6.2
- [ ] Every rupee traceable Bank → Company → SD → Dist → Retailer — needs §5
