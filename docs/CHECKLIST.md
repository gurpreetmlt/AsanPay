# Project Checklist

> Update jab task complete ho — agent ko poora history padhne ki zaroorat nahi.

## Infrastructure
- [x] Postgres + Mongo local
- [x] Backend :4000
- [x] Admin :3000, Agent web :3001
- [x] Portal login guard
- [x] LOGIN.md + task system
- [ ] VPS live API
- [ ] Production env

## Web
- [x] Admin login + dashboard (basic)
- [x] Agent single login + role dashboard
- [x] Admin full stats dashboard
- [x] KYC queue UI
- [x] Commission scheme builder (role defaults)
- [x] Per-agent service commission overrides (admin agent detail)
- [x] Commission page: AEPS sub-services collapsed to one shared-rate row (Task 25)
- [x] Wallet page shows Pending balance (Wallet 1 / Wallet 2)
- [x] §9.3 compliance wording: product UI never says "Wallet" — Balance / Service Balance / Earnings (agent + admin + mobile; emails/receipts/errors)

## Mobile
- [x] RN Android shell + login (OTP flow)
- [x] Role-based home screen
- [x] Bottom tab navigation (Retailer 4 tabs, Partner 3 tabs)
- [ ] Service flows (AEPS, DMT, BBPS)
- [ ] Biometric SDK
- [x] Txn PIN modal + wallet transfer PIN
- [x] Wallet screen Pending balance line

## Backend API
- [x] Auth, wallet, catalog, txn stubs
- [x] Txn PIN on wallet transfer
- [x] Wallet `pendingBalance` on `/wallet/me` (from pending/initiated txns)
- [x] AEPS dummy↔live switch (`AEPS_PROVIDER_MODE`) + InstantPay adapter skeleton
- [x] AEPS compliance gates (geofence, bio-mismatch/EDD, dormancy, cash receipt)
- [x] Email verification OTP (`/auth/email/otp/*`) + web Verify UI (KYC, outlet, settings)
- [x] Fund request approve flow (admin `/fund-requests` UI + `GET /api/fund-requests` list)
- [x] Fund request + banking HTTP (`/api/fund-requests`, `/api/banking`, Idempotency-Key on money POSTs)
- [x] Settlements module (`/api/settlements` — debit at request, payout/reversal journals, one active bank)
- [x] VAN webhook auto-credit (`POST /api/banking/van/webhook` — DEPOSIT_RECEIVE+CREDIT / suspense)
- [x] SD/D direct-child Active/Inactive (`PATCH /users/:id/active`)
- [x] Admin network tree move (`POST /admin/users/:id/reassign`) + hierarchy rebuild
- [x] Admin removed from `POST /wallet/transfer` (fund mint only)
- [x] Transfer role pair (SD→D, D→R) + inactive target blocked
- [x] Wallet pull/Collect (`/wallet/pull/request` + `/confirm`) child OTP + parent PIN
- [x] Network table: Party + wallets + Top-Up / Receiving / Debit / History icon tooltips (English UI)
- [x] Product UI English-only rule (`.cursor/rules/ui-english-only.mdc`)
- [x] Distributor retailer activity: txn-based Transacted/No Activity + 6-month history; Quick Actions raised; wallet **Reverse** label
- [x] InstantPay Register Outlet = retailer web onboarding (`/onboarding/outlet`); `hasInstantpayOutlet` gate
- [x] Agent flow docs folder [`flow/`](../flow/INDEX.md)
- [x] KYC CRUD routes (queue list + decide shipped; deep doc CRUD deferred)
- [x] Commission payout report
- [x] Settlements UI wired (agent web + admin + mobile)
- [x] Admin banking ops UI (`/banking` — accounts, statement import, suspense)
- [x] Float management (`/float` + `/api/float`)
- [x] VAN assign (admin Banking tab + `POST /banking/van/assign`)
- [x] Ledger reports (`/ledger-reports`)
- [x] Tenant settings: fund dual-approve + settlement charge (Site Control)
- [x] Settlement bank OTP on change + penny-drop stub + charges + returned path
- [x] VAN bank adapters (`X-Van-Bank`: generic|icici|hdfc)
- [x] Mobile partner Reverse / pull-collect on Network
- [x] InstantPay merchant outlet Min-KYC + Bio-KYC (web + mobile, RD `wadh`)
- [ ] InstantPay DMT mobile full parity + BBPS / recharge rails

## Ledger engine (double-entry)
- [x] Chart of accounts (`tenants`, `accounts`, `account_balances`) + 9 system accounts
- [x] `postJournal()` + flow matrix + `reverseJournal()` — the only writer of money
- [x] DB guards: append-only triggers, no-overdraft, protected accounts
- [x] Bootstrap seeder + fail-fast boot verifier (`Ledger system accounts verified`)
- [x] `UPLINE_PULL` txn type; debit floored at the downline's settleable (spec §9.3)
- [x] `TREASURY_FLOAT_<provider>` per active provider (`provision:float`, self-heals at post time)
- [x] `OPENING_BALANCE` backfill (`backfill:opening`) — every pre-ledger rupee has an origin
- [x] **Cut-over**: `wallet.ledger.ts` posts journals; `wallets.balance` is a mirror
      (`main` = balance − settleable, `aeps` = settleable). Signatures unchanged, 15 call sites
- [x] `verify:ledger` 10/10 — engine only, does NOT cover `wallet.ledger.ts`
- [x] `verify:shim` full paths — hierarchy + service_txn debit/credit (+ customer_fee 3-leg) +
      `resolveCustomerFee` / `service_charges` + reversal + fundWallet + commission under LEDGERTEST —
      **21/21 PASS** on Coolify (2026-08-04)
- [ ] **Live proof of the shim** — optional ASANPAY production money movement still product QA
- [x] **DB-backed test suite repaired for cut-over** — `setBalance` via journals + `mirrorBalances`;
  `destroy` soft-retires users (accounts.user_id RESTRICT); `LEDGER_TENANT_CODE` / LEDGERTEST isolation
- [x] Backend `tsc` build gate fixes (commission rule create; fund-request `paramId` for Express 5)
- [x] Step 16 load harness — `npm run verify:load` (500 concurrent service_txn journals +
      200 fundWallet on LEDGERTEST; no stub/provider hop)
- [x] Step 16 load on EC2 — **4/4 PASS** Coolify (2026-08-04): half/all concurrent debits +
      concurrent fundWallet + LEDGERTEST recon clean
- [x] `COMMISSION_INCOME` service fee — service debit books `customer_fee` as Cr COMMISSION_INCOME
      (principal → float); `executeServiceTxn` accepts `customerFee` and debits principal+fee
- [x] `service_charges` schedule + `resolveCustomerFee` + debit paths resolve fee server-side
      (never from client); `GET /admin/service-charges` read API; migration `0030_service_charges`
- [x] Admin UI to edit service_charges (CRUD + list/edit page)
- [x] Maker-checker for RECON_ADJUSTMENT (request → different admin approve; migration `0031`)
- [ ] Maker-checker remaining: beneficiary changes, provider activation
- [x] InstantPay DMT mobile full parity (remitter, beneficiaries, transfer OTP, refund)
- [x] `cleanup:shim` — remove SHIM% harness debris from global catalog (dry-run default, `--apply`);
      `verify:shim` reuses fixed inactive `SHIM_BANK` / `SHIM_OTH` / `SHIM_UNMAPPED` and scrubs
      run txns + wallet passbook (never journals); agent catalog filter exact codes only
- [x] Legacy `partner-web` / `retailer-web` removed (restore: tag `legacy-webapps-before-delete`)
- [x] Dead exports dropped: `deriveBalance`, unexported `serviceChargeTotal` (knip report only next)
- [ ] InstantPay BBPS / recharge rails (product)

## Security (2026-07-17)
- [x] Default MPIN / OTP-in-prod / hardcoded admin seed removed
- [x] JWT `requireAuth` revalidates `isActive` + role from DB
- [x] Txn PIN lockout + AEPS withdraw requires PIN
- [x] Per-user txn idempotency + wallet fund/transfer idempotency
- [x] `apps/login.text` untracked; Dependabot added
- [x] Real logout (revoke all refresh tokens; device trust kept for Welcome-back MPIN); refresh reuse → kill family + devices
- [x] OTP role oracle closed; OTP keyed by mobile; old OTPs invalidated
- [x] txnAuth ticket (PIN not echoed); RD package allowlist; KYC docs + transfer KYC
- [x] Flat commission cap; amount max fail-closed; JWT algorithms pinned
- [x] Double-debit: advisory lock on claim+debit / wallet idempotency; stable client attempt keys (DMT, fund, AEPS wd)
- [x] Recheck-on-initiated race guard (90s grace) — no reverse while submit in-flight
- [x] Pending txn auto-reconcile worker (`TXN_RECONCILE_INTERVAL_MS`)
- [x] Ledger recon cron (`LEDGER_RECON_INTERVAL_MS`) — exceptions only, no auto-fix
- [x] Credit settle prefers provider amount; recheck uses stored `txn.walletType`
- [x] Ledger `(reference_type, reference_id)` unique (partial) — migration `0012`
- [ ] Android Keystore for bio refresh token (still AsyncStorage)
- [ ] Cert pinning + httpOnly cookie BFF
- [ ] History purge for any secrets ever pushed to remote

## Last updated
2026-08-04 — §9.3 product copy: no user-facing "Wallet" — Balance / Service Balance / Earnings (agent, admin, mobile, emails, PDF, API errors)
2026-08-04 — Drop partner-web/retailer-web; remove deriveBalance + serviceChargeTotal export
2026-08-04 — cleanup:shim + fixed SHIM_BANK/OTH/UNMAPPED harness; no catalog row growth per run
2026-08-04 — Step 16: verify:load (500 DMT + 200 fundWallet) + concurrency test default 500
2026-08-04 — verify:shim **19/19 PASS** on Coolify (service_txn, reversal, fundWallet, commission)
2026-08-04 — verify:shim expanded: service_txn debit/credit, reversal, fundWallet, commission
2026-08-04 — verify:shim 8/8 PASS on Coolify API (LEDGERTEST; UUID refs + ASN S/D/R UIDs)
2026-08-04 — verify:shim script (wallet.ledger under LEDGERTEST: transfer/pull/fund + mirror + passbook)
2026-08-04 — Post cut-over §1+§3: test world journals/LEDGERTEST + soft destroy; tsc (commission, fund-request paramId)
2026-08-04 — Ledger section added; cut-over verified shipped. Found: DB-backed test suite is broken by the mirror (fixtures write `wallets.balance` directly) — see `docs/PROMPTS/post-cutover-next.md`
2026-08-04 — InstantPay Bio-KYC web/mobile + RD `wadh`; mobile Register Outlet modal
2026-08-03 — Wallet leftovers: tenant settings UI, settlement OTP/charges/returned, VAN adapters, load-test 500, logs schema stub
2026-08-03 — Wallet-engine finish: float mgmt, VAN assign, settlement cooling, FR dual-approve, ledger reports, ESC/POS receipt
2026-08-03 — Admin Commission: Banking Services AEPS collapsed to 1 shared-rate row; save fans out to 4 services (task 25)
2026-08-03 — Mobile partner Reverse (pull/collect): Network DownlineCard → OTP + txn PIN, parity with web
2026-08-03 — Admin banking UI: `/banking` register accounts, statement import, park unmatched suspense
2026-08-03 — Wire settlements + orphan UI: agent/admin `/settlements`, mobile Add Money / Settlements / Support; AppShell Support + partner tools
2026-08-03 — Commission payout report: `GET /admin/commission/payouts` + admin `/commission` Payout report tab
2026-08-03 — Fund request UI: retailer Add Money → `POST /fund-requests`; admin `/fund-requests` approve/reject; `GET /fund-requests` list; proxy forwards Idempotency-Key (task 13)
2026-08-03 — VAN webhook: `POST /api/banking/van/webhook` HMAC → DEPOSIT_RECEIVE+CREDIT or suspense (task 27D; wallet-engine queue complete)
2026-08-03 — Settlements: `/api/settlements` request debit → SETTLE_PAYABLE, payout/fail reversal, one active bank (task 27C)
2026-08-03 — Ledger recon cron: `LEDGER_RECON_INTERVAL_MS` + stale transit/fund-request/unmatched bank credit checks (task 27B)
2026-08-03 — Fund request + banking HTTP: `/api/fund-requests`, `/api/banking`, Idempotency-Key on money POSTs (task 27A)
2026-08-01 — Email notifications: statements job, commission credit, large debit, new device, MPIN change, product-update opt-in
2026-08-01 — Branded emails: verify OTP, welcome (on first email verify), KYC submit/approve/reject
2026-08-01 — Email verify: OTP endpoints + AuthUser email fields + web Verify UI (KYC / outlet / settings)
2026-07-20 — Signup: role select + upline mobile (SD→Admin, Dist→SD, Retailer→Dist)
2026-07-20 — Distributor activity metric (success txns) + monthly history; Quick Actions up; Collect/Debit → Reverse
2026-07-20 — Wallet pull (Wapas): child OTP + parent PIN; `flow/` agent docs; migration `0015_wallet_pull_otp`
2026-07-20 — Signup: `GET /auth/sponsor/:uid` shows Distributor name; retailer maps under that Dist
2026-08-03 — Commission scheme builder: role-default CRUD + preview at admin `/commission`; payout still via `distributeCommissionForTxn`
2026-07-20 — Wallet hierarchy: transfer enforces SD→D / D→R + active target; task doc `wallet-hierarchy.md`
2026-07-20 — Wallet hierarchy gaps: child active toggle (SD/D), admin reassign parent, admin no longer on /wallet/transfer
2026-07-18 — AEPS dummy/sandbox/live provider mode + InstantPay adapter + compliance gates
2026-07-17 — Security hardening: Critical+High remediations (auth, wallet, mobile, web storage, release signing, Dependabot)
2026-07-14 — Wallet pending balance: `GET /api/wallet/me` adds `pendingBalance` per wallet (sum of pending/initiated txns); agent web Wallet + mobile Wallet show Pending
2026-07-14 — Branding: product = AsanPay; npm scopes `@asanpay/*`; folder renamed to `apps/mobile`
2026-07-18 — Pending service icons applied: Cash Deposit, NPS, Education Fees, Municipal Services, Housing Society, Subscription, Landline, Broadband (from Latest-Icons → web public → mobile sync)
2026-07-14 — Empty Retailer txns: migrate 0005 blocked by non-idempotent 0004; seed now funds Wallet 1/2 + logs userId
2026-07-14 — `seed:txns` dummy retailer txns (Wallet 1/2) for agent Transactions page
2026-07-14 — Retailer Wallet 1/2 balances in agent header; txn `wallet_type` column shows which wallet was cut
2026-07-14 — Login MPIN: journaled `0004_login_mpin` so migrate adds `login_mpin_hash` (OTP/MPIN 500s)
2026-07-14 — Per-agent service commission on agent detail + `user_commission_rates`
2026-07-14 — Admin web feature pages (stats, users, KYC, txns, site-control, wallet, passbook)
2026-07-14 — Admin AsanPay-style shell (blue+green); fixed user `admin` / no OTP
