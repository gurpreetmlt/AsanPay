# Ledger Engine — Handoff (3 Aug 2026)

> **SUPERSEDED — do not plan from this file.** The cut-over shipped, and so did everything in
> its "Then, in order" queue except the load test. The "Blocked" section below is resolved.
> Current state: [`post-cutover-next.md`](post-cutover-next.md).


## Done, deployed, verified in production

| Piece | Evidence |
|---|---|
| Chart of accounts — `tenants`, `accounts`, `account_balances` | 9 system accounts live under tenant `ASANPAY` |
| Ledger — `journals`, `ledger_entries`, `postJournal()`, flow matrix, `reverseJournal()` | `verify:ledger` 10/10 |
| DB guards — append-only triggers, no-overdraft, protected accounts | `DELETE FROM accounts WHERE code='COMPANY_001'` errors in prod |
| Bootstrap seeder + fail-fast boot verifier | `Ledger system accounts verified` in boot log |
| Hierarchy transfer + allocation with maker-checker (DB CHECK) | service layer only |
| Banking — `bank_accounts`, `virtual_accounts`, `bank_statement_lines`, import, suspense parking | tables live |
| Fund requests — tables, 4-tier matching, admin review, two-journal credit | tables live |
| Reconciliation — 5 checks + exception queue | `checkSettleable` scoped to liability |
| `OPENING_BALANCE` backfill | applied; trial balance, float control, settleable, ledger-vs-legacy all PASS |

Migrations `0022`–`0026`. Money is `BIGINT` paise via `src/core/money.ts`.
Two bugs were caught by running it, after passing typecheck + lint + 28 unit tests:
the `settleable <= balance` constraint and the same wrong assumption in the recon query
(both assumed every balance is non-negative; treasury accounts legitimately are not).

## Blocked — needs a decision before any more journals are posted

1. **`upline_pull` is not in the flow matrix.** The live product lets an upline pull
   balance back from a downline (OTP-gated). Spec §9.3 says money only moves downward,
   and `distributor -> sd` is currently rejected with a test asserting it. Either add an
   `UPLINE_PULL` txn type, or the feature is a compliance problem. Needs a human call.
2. **Service transactions have no float account to net against.** The backfill put the
   aggregator wallet's ₹1,00,000 into `COMPANY_001` (internal), but the matrix routes DMT
   as `retailer -> float`, not `retailer -> company`. Needs a real
   `TREASURY_FLOAT_<provider>` account per active provider, and one journal moving that
   balance out of `COMPANY_001`.

## Next: the cut-over (one release, never gradual)

Design already settled — change the internals of `modules/wallet/wallet.ledger.ts`, not
its signatures, so all 15 call sites across `wallet.service.ts`, `txn.service.ts` and
`commission.service.ts` switch at once with no call-site edits.

`wallets.balance` stops being the source of truth and becomes a mirror:

* `wallet_type = 'main'` ← `balance - settleable` (usable)
* `wallet_type = 'aeps'` ← `settleable`

That keeps every existing read (dashboards, mobile, admin) working unchanged while there
is exactly one writer. Reference-type mapping:

| legacy `referenceType` | new `txnType` |
|---|---|
| `downline_transfer` | `WALLET_TRANSFER` |
| `upline_pull` | `UPLINE_PULL` (blocker 1) |
| `service_txn` debit | `DMT` / `BBPS` / `RECHARGE` / `AEPS_DEPOSIT` |
| `service_txn` credit | `AEPS_WITHDRAWAL` / `MICRO_ATM` / `AADHAAR_PAY` |
| `commission` | `COMMISSION_PAYOUT` |
| `reversal` | `REVERSAL` |
| `external_funding` | `ALLOCATION` |

## Then, in order

3. **No HTTP routes exist for any new service.** Fund requests, banking, allocation and
   ledger balances are all service-layer only. Nothing is reachable over HTTP yet.
4. **Reconciliation is never run.** The checks exist; no cron or interval calls them.
   Wire into `server.ts` alongside the existing sweeps.
5. Step 8 — VAN + bank webhook auto-credit (path A, should carry >90% of top-up volume)
6. Step 10 — settlements: payout requests, `agent_settlement_accounts`, granular
   `block_services` / `block_topup` / `block_settlement` / `block_login` flags
7. Step 11 — receipts: PDF + 58 mm ESC/POS thermal payload
8. Step 12 — float management: routes, transfers, transit, stale-transit + burn-rate alerts
9. Step 15 — reports: trial balance, solvency, float coverage, daily fund request summary
10. Step 16 — load test: 500 concurrent transfers + 200 concurrent fund approvals, then
    re-check every invariant

## Known gaps worth remembering

* Maker-checker exists only on allocation. Spec §9.2 also wants it on fund approval above
  a threshold, beneficiary changes, provider activation and any `RECON_ADJUSTMENT`.
* Grants cannot protect the ledger: the app connects as `asanpay`, which owns the tables,
  and Postgres `REVOKE` does not apply to an owner. Triggers are the real enforcement. A
  separate non-owner app role would be needed for defence in depth.
* Legacy tables are still single-tenant. The white-label retrofit is separate work, and
  `users.mobile` / `email` / `uid` are globally unique — so today the same person cannot
  be an agent at two tenants. See `White Label Plan/`.
* `vitest` cannot run in the production image (`npm install --omit=optional` strips
  rolldown's native binding). Integration checks are tsx scripts instead:
  `npm run verify:ledger`, `npm run backfill:opening`.

## Environment

No local dev. No Postgres, Docker or psql on the Mac; `DATABASE_URL` points at the
Coolify container `t34dlg5h566yiw2wh1kpms1b`, which only resolves inside EC2.

* Git commands run on the **Mac**; everything else in the **SSH** session.
* `git push` triggers a Coolify deploy. Rebuilds take several minutes (full `npm install`),
  so poll for the change to land rather than checking once.
* Migrations run automatically at container start (`apps/backend/Dockerfile` CMD).
