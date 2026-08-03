# Treasury & Wallet System — Session Prompts

Copy-paste one block per Claude Code session. **One session = one task.**
Do not merge two sessions. Each block already contains the file list, the
constraints, and the test.

---

## Non-negotiable constraints (already inside every prompt below)

- **No technology change.** Express 5 + Drizzle ORM + PostgreSQL + Redis stay.
  No NestJS, no Prisma, no queue, no microservice.
- **Money stays `numeric(14,2)` rupees.** Do NOT migrate to BIGINT paise.
  Arithmetic goes through `toPaise()` / `fromPaise()` in
  `apps/backend/src/modules/wallet/decimal.ts`. Never a JS `number`.
- **Single tenant.** No `tenant_id` column, anywhere.
- **Table names stay.** `wallets`, `wallet_ledger_groups`, `wallet_ledger_entries`.
  Treasury accounts are rows in `wallets`, not a new ledger.
- **`transferBetweenWallets()` stays the only write path.** Extend it, never bypass it.
- **No overdraft.** No `credit_limit`, no negative balance, no hooks for it.
- Migrations only via `npx drizzle-kit generate`. Never hand-edit a generated file
  under `migrations/meta`.

---

## Architecture decision (fixed — do not re-litigate in a session)

A treasury account is a **row in `wallets`** with:

- `code` — new nullable unique varchar, e.g. `COMPANY_MAIN`, `TREASURY_BANK_ICICI`
- `account_class` — new enum: `asset | liability | internal | income | expense`
- `user_id` — nullable (system accounts belong to no user)
- `wallet_kind = 'system'` — new enum value

Why: existing double-entry code already moves money between two `wallets` UUIDs
with sorted-id locking. Giving some wallets a code and a class turns it into a real
chart of accounts with **zero change to the ledger engine**.

Account tree:

```
COMPANY_MAIN              internal   ← the ONLY account that credits a hierarchy wallet
TREASURY_BANK_<slug>      asset      ← one per company bank account
TREASURY_TRANSIT_<prov>   asset      ← left bank, provider not confirmed
TREASURY_FLOAT_<prov>     asset      ← confirmed balance at provider
TREASURY_SUSPENSE         liability  ← money in, owner unknown
TREASURY_SETTLE_PAYABLE   liability  ← agent payout in flight
COMMISSION_INCOME         income
BANK_CHARGES              expense
```

Existing `wallet_kind = 'aggregator'` wallet becomes `TREASURY_FLOAT_<provider>`.
Migrate it, do not delete it, do not break live transactions.

---

# Session 1 — Chart of accounts on `wallets`

```
@apps/backend/src/db/postgres/schema/wallets.ts
@apps/backend/src/db/postgres/schema/enums.ts
@apps/backend/src/modules/wallet/wallet.ledger.ts

Goal: turn `wallets` into a chart of accounts without changing the ledger engine.

No explore. No MCP. Only the 3 files above + one new file + one migration.
No technology change: Express + Drizzle + Postgres, money stays numeric(14,2) rupees,
single tenant, no tenant_id.

Do:
1. enums.ts — add `accountClassEnum` = asset | liability | internal | income | expense.
   Add 'system' to `walletKindEnum` (keep 'ledger' and 'aggregator', do not remove).
2. wallets.ts — add columns:
   - code varchar(40) NULL, unique index WHERE code IS NOT NULL
   - account_class accountClassEnum NOT NULL DEFAULT 'liability'
   - make user_id NULLABLE
   Add CHECK: (user_id IS NOT NULL AND code IS NULL) OR (user_id IS NULL AND code IS NOT NULL)
   Add partial unique index: only one row may have wallet_kind = 'aggregator'.
   Keep every existing column, index and CHECK untouched.
3. New file apps/backend/src/modules/wallet/accounts.ts:
   - SYSTEM_ACCOUNTS const array (code, name, account_class) for:
     COMPANY_MAIN internal, TREASURY_SUSPENSE liability,
     TREASURY_SETTLE_PAYABLE liability, COMMISSION_INCOME income,
     BANK_CHARGES expense
   - seedSystemAccounts(): idempotent INSERT ... ON CONFLICT (code) DO NOTHING,
     wrapped in pg_advisory_xact_lock so two pods cannot race
   - verifySystemAccounts(): throws if any code is missing or has the wrong class
   - resolveAccount(code): code -> wallet id, cached in Redis (existing cache module),
     throws on unknown code
4. Call seedSystemAccounts() then verifySystemAccounts() at boot in server.ts.
   If verify throws, the process must exit non-zero. A half-initialised financial
   system is worse than a stopped one.

Do NOT touch wallet.ledger.ts logic in this session — only confirm it still compiles.
Do NOT migrate the existing aggregator wallet yet (Session 3).

Mac Terminal cmds in reply.
```

Test: boot the server, then

```sql
SELECT code, account_class, user_id FROM wallets WHERE code IS NOT NULL ORDER BY code;
```

---

# Session 2 — Ledger hardening

```
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/db/postgres/schema/wallets.ts

Goal: make the ledger tamper-proof and self-checking.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Do:
1. New raw-SQL migration (drizzle-kit custom):
   - raise_immutable() trigger function
   - BEFORE UPDATE OR DELETE trigger on wallet_ledger_entries
   - BEFORE UPDATE OR DELETE trigger on wallet_ledger_groups
   - REVOKE DELETE, UPDATE ON wallet_ledger_entries, wallet_ledger_groups
     FROM the application role
2. wallet.ledger.ts — add a postGroup() internal helper that all three public
   functions route through. It must, in order:
   a. assert every entry amount > 0
   b. assert SUM(credit) == SUM(debit) in paise, EXCEPT when
      referenceType === 'external_funding' (documented single-sided exception)
   c. sort wallet ids ascending, SELECT ... FOR UPDATE each exactly once
      (today two locks are taken even when a caller passes the same wallet twice)
   d. insert group, then entries with balance_after
   Keep transferBetweenWallets / fundWallet / adjustWalletHold signatures unchanged
   so no caller breaks.
3. Add vitest cases in apps/backend/test:
   - unbalanced entries throw
   - negative balance throws INSUFFICIENT_BALANCE
   - UPDATE on wallet_ledger_entries raises at DB level
   - two concurrent opposite transfers on the same pair do not deadlock

Mac Terminal cmds in reply.
```

---

# Session 3 — Treasury accounts + balanced admin funding

```
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/modules/wallet/wallet.service.ts
@apps/backend/src/modules/wallet/wallet.controller.ts
@apps/backend/src/modules/wallet/accounts.ts

Goal: money enters through ONE door — COMPANY_MAIN — and every group balances.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Do:
1. Migrate the existing wallet_kind='aggregator' row: set code =
   'TREASURY_FLOAT_<provider_code>', account_class='asset', wallet_kind='system'.
   Data migration must be reversible and must not break in-flight transactions.
2. Replace the single-sided fundWallet() flow. POST /wallet/fund now posts TWO
   balanced groups in ONE db.transaction():
     deposit_receive:  Dr TREASURY_BANK_<slug>   Cr COMPANY_MAIN
     deposit_credit:   Dr COMPANY_MAIN           Cr <target wallet>
   Keep the reference_type 'external_funding' path only for a documented
   opening-balance case, and gate it behind an explicit flag.
3. Idempotency keys derived from the request id, so a retry can never double-credit.
4. Deprecate fundWallet() single-sided export once nothing calls it.

Do NOT build the flow matrix here (Session 4).
Do NOT build bank_accounts here — hardcode ONE bank account code for now and mark
it with a TODO pointing at Session 5.

Mac Terminal cmds in reply.
```

---

# Session 4 — Flow matrix

```
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/modules/wallet/accounts.ts
@apps/backend/src/db/postgres/schema/enums.ts

Goal: an invalid wallet pair must be impossible, not just unrouted.

No explore. No MCP. No technology change.

Do:
1. New file apps/backend/src/modules/wallet/flowMatrix.ts — a TABLE, not if/else.
   Rows keyed on (fromClass|fromCode, toClass|toRole, referenceType). Allowed:
     bank    -> transit  : float_transfer_init
     transit -> float    : float_transfer_confirm
     bank    -> company  : deposit_receive
     company -> sd|distributor|retailer : deposit_credit, downline_transfer
     sd      -> distributor : downline_transfer
     distributor -> retailer : downline_transfer
     retailer|distributor -> upline : upline_pull
     retailer -> float   : service_txn (debit direction)
     float    -> retailer : service_txn (credit direction, AePS)
     income   -> any agent : commission
     agent    -> settle_payable : settlement_debit
     settle_payable -> bank : settlement_payout
     bank     -> suspense : unidentified_credit
     suspense -> company  : suspense_resolve
     any      -> any      : reversal (only when reverses an existing group)
2. Call validateFlow() inside postGroup(). Anything not in the table throws.
3. Unit test: assert NO allowed row credits a hierarchy wallet from a treasury
   account other than COMPANY_MAIN. If someone later adds such a row, this fails.
4. Unit test: retailer -> retailer (peer transfer) throws. This is a compliance
   requirement, not a preference.

Mac Terminal cmds in reply.
```

---

# Session 5 — Bank accounts + statement import

```
@apps/backend/src/db/postgres/schema/wallets.ts
@apps/backend/src/modules/wallet/accounts.ts
@apps/backend/src/db/postgres/schema/index.ts

Goal: the company's real bank accounts exist as data, and their statements land in DB.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Do:
1. New schema file bank.ts:
   - bank_accounts (id, ledger_wallet_id -> wallets.id, bank_name,
     account_number_encrypted, ifsc, purpose collection|payout|ops,
     supports_van bool, is_active bool)
     Registering a bank account auto-creates its TREASURY_BANK_<slug> wallet row.
   - bank_statement_lines (id, bank_account_id, bank_txn_id, txn_date,
     value_datetime, direction, amount numeric(14,2), utr, narration, sender_name,
     match_status unmatched|matched|suspense|ignored, matched_to_type,
     matched_to_id, imported_at)
     UNIQUE (bank_account_id, bank_txn_id)
     UNIQUE (matched_to_type, matched_to_id)   -- one line, one claim
     INDEX (bank_account_id, utr)
     partial INDEX (bank_account_id, txn_date, amount) WHERE match_status='unmatched'
2. CSV import endpoint, admin-only, idempotent per (bank_account_id, bank_txn_id).
   Never overwrite an existing line.
3. Reuse the existing PAN/Aadhaar encryption util for account_number_encrypted.
   Do not invent a second crypto path.

Mac Terminal cmds in reply.
```

---

# Session 6 — Fund requests + matching engine

```
@apps/backend/src/db/postgres/schema/bank.ts
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/modules/wallet/accounts.ts
@apps/backend/src/middleware/rateLimiter.ts

Goal: retailer raises a top-up request, system matches it to a bank line, admin approves.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Do:
1. Schema fundRequests.ts:
   - fund_requests (requester_user_id, bank_account_id, amount, credited_amount,
     payment_mode, reference_number, reference_norm, deposit_datetime, sender_name,
     receipt_url, receipt_sha256, remarks, status, match_confidence,
     matched_line_id, reviewed_by, reviewed_at, reject_reason_code, reject_remarks,
     receive_group_id, credit_group_id, submitted_at, credited_at)
     UNIQUE (bank_account_id, reference_norm)   -- hard constraint, not app check
     INDEX (receipt_sha256)
   - fund_request_events (append-only state trail: from_status, to_status,
     actor_id, actor_type retailer|admin|system, note, metadata jsonb)
2. States: submitted -> auto_matched | pending_match | amount_mismatch | suspect
           -> under_review -> approved | partially_approved | rejected -> credited
   Terminal: credited, rejected, cancelled. Retailer may cancel only while
   submitted or pending_match.
3. Matching tiers — ONLY tier 1 may auto-credit:
   T1 exact UTR + exact amount            -> auto_matched
   T2 exact UTR, amount differs           -> amount_mismatch (human)
   T3 no UTR, amount+date+name fuzzy >0.8 -> under_review (never auto-credit)
   T4 nothing                             -> pending_match, retry 5 min up to 24 h
   Auto-credit also requires amount <= configurable ceiling AND kyc_status='verified'.
4. Approval posts the Session 3 two-group flow, crediting the amount from the BANK
   STATEMENT, never the amount the retailer typed. Idempotency key = FR:<id>:CREDIT.
5. Fraud controls: receipt SHA-256 dedup across ALL retailers, max 10 open requests
   per retailer, max 20 submissions/day (reuse rateLimiter), 5x-vs-30-day-average
   velocity rule forces manual review. Every action into audit_logs.
6. Retailer-facing status labels only. Never expose 'suspect' or fraud wording.

Mac Terminal cmds in reply.
```

---

# Session 7 — Settleable vs usable balance

```
@apps/backend/src/db/postgres/schema/wallets.ts
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/modules/wallet/wallet.service.ts

Goal: an agent can withdraw what they EARNED, never what they DEPOSITED.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Why this matters: money the agent deposited is a prepaid advance against services and
must not be cash-withdrawable. Money earned via AePS/commission is theirs. Mixing the
two makes the platform look like a stored-value wallet. This is a compliance boundary.

Do:
1. wallets — add settleable numeric(14,2) NOT NULL DEFAULT '0'
   CHECK (settleable >= 0 AND settleable <= balance)
2. postGroup() maintains it in the SAME transaction:
   settleable += credit legs where reference_type IN ('commission') or
                 reference_type='service_txn' AND the txn is an AePS/microATM credit
   settleable -= debit legs where reference_type='settlement_debit'
   Never recompute with an aggregate query at read time.
3. Backfill migration: derive settleable for every existing wallet from
   wallet_ledger_entries history, in one transaction, and log the totals.
4. GET /wallet/me returns balance, settleable, usable (= balance - settleable),
   hold_balance. Do NOT rename hold_balance — it is a different thing.
5. Test: an AePS credit raises settleable; a downline_transfer credit does not.

Mac Terminal cmds in reply.
```

---

# Session 8 — Settlement payout + granular blocks

```
@apps/backend/src/db/postgres/schema/wallets.ts
@apps/backend/src/db/postgres/schema/users.ts
@apps/backend/src/modules/wallet/wallet.ledger.ts
@apps/backend/src/modules/wallet/accounts.ts

Goal: agent withdraws earnings to their own verified bank account.

No explore. No MCP. No technology change. Money stays numeric(14,2).

Do:
1. Schema settlement.ts:
   - agent_settlement_accounts (user_id, account_number_encrypted, ifsc,
     holder_name, verified_at, verification_ref, is_active, effective_from,
     created_by, approved_by, CHECK created_by <> approved_by)
     partial UNIQUE (user_id) WHERE is_active   -- NPCI "One Operator, One Bank"
   - settlement_requests (user_id, settlement_account_id, amount, charges,
     net_amount, mode imps|neft|rtgs, status requested|queued|processing|success|
     failed|returned, batch_id, bank_utr, failure_reason, debit_group_id,
     payout_group_id, reversal_group_id, requested_at, completed_at)
2. Flow — debit at REQUEST time, not payout time, otherwise the agent spends the
   same money on a DMT while the payout is in flight:
     request : Dr <agent wallet>  Cr TREASURY_SETTLE_PAYABLE   (settlement_debit)
     success : Dr TREASURY_SETTLE_PAYABLE  Cr TREASURY_BANK_<payout>  (settlement_payout)
     failed  : reversal group referencing the debit group, wallet re-credited
   Validate: amount <= settleable AND amount <= balance AND kyc verified AND
   settlement account penny-drop verified.
3. users — replace the coarse block with four flags:
   block_services, block_topup, block_settlement, block_login (+ block_reason,
   blocked_by, blocked_at). Keep is_active for the login path, migrate aeps_blocked
   into block_services.
   Default on suspicion = block_services ONLY. block_settlement requires a named
   approver and a written reason. Never trap an agent's earned money.
4. Changing the settlement bank account: OTP + 24 h cooling period during which
   payouts are blocked, and a before/after row in audit_logs. Account-change fraud
   is the most common attack on this surface.
5. Test: block_services does NOT prevent settlement of already-earned money.

Mac Terminal cmds in reply.
```

---

# Session 9 — Reconciliation + treasury dashboard

```
@apps/backend/src/db/postgres/schema/logs.ts
@apps/backend/src/modules/wallet/accounts.ts
@apps/backend/src/modules/admin

Goal: the system detects its own drift before a customer does.

No explore. No MCP. No technology change.

Do:
1. Schema: reconciliation_exceptions (check_name, severity info|warn|critical,
   details jsonb, status open|closed, closed_by, close_note, detected_at, closed_at).
2. Scheduled checks (node-cron or setInterval in server.ts — no new queue tech):
   ledger vs cached balance   15 min  SUM(entries) per wallet == wallets.balance
   trial balance              daily   SUM(Dr) == SUM(Cr) across all groups
   solvency                   hourly  bank+transit+float >= SUM(agent wallets)
   settleable integrity       hourly  wallets.settleable == derived from history
   bank statement match       daily   every credit line resolved
   stale transit              hourly  any transit balance older than 4 h
   stale fund request         hourly  anything unresolved > 24 h
3. AUTO-FIX IS FORBIDDEN. Every failure opens an exception a human closes with a
   reason. Corrections go through postGroup() as reference_type='recon_adjustment'.
4. Admin dashboard tiles: unmatched credit lines count (best fraud indicator in the
   system), open exceptions by severity, float coverage, today's issued balance.

Mac Terminal cmds in reply.
```

---

## Order and sizing

| Session | Size | Depends |
|---|---|---|
| 1 Chart of accounts | M | — |
| 2 Ledger hardening | M | 1 |
| 3 Treasury + balanced funding | L | 1, 2 |
| 4 Flow matrix | M | 3 |
| 5 Bank accounts + statements | M | 3 |
| 6 Fund requests + matching | L | 5 |
| 7 Settleable split | M | 4 |
| 8 Settlement payout | L | 7 |
| 9 Reconciliation | M | 6, 8 |

Sessions 1, 2, 4 are the ones that make the existing system safe. Do them first even
if fund requests feel more urgent — every later session writes through that engine.
