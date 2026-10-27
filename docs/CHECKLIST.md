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
- [x] Role rename: `master_distributor` → `super_distributor` (enum + UI code; migration `0032`)

## Mobile
- [x] RN Android shell + login (OTP flow)
- [x] Role-based home screen
- [x] Bottom tab navigation (Retailer 4 tabs, Partner 3 tabs)
- [x] My Earnings shell (TC07–08): Home Today’s Earnings / Report → `MyEarnings`; `/api/earnings` summary + by-product; SD/Dist web `/earnings`
- [x] My Earnings TC09–12: downline + product tabs, expand Gross/TDS/Net, nav wiring (web SD/Dist + mobile all agent roles)
- [x] Admin tax registers (TC13): TDS by agent/month + DMT fee GST + CSV on Commercials
- [x] Commission preview underwater warn (TC14) when provider pool is below scheme gross
- [x] Mobile monthly TDS + PAN banner (TC16) on Account
- [x] Tax commission TC15 raw ingest + TC18 clawback (migrate `0067`) + TC21 retailer web earnings + TC22 Est. earn lines
- [ ] Tax commission still blocked: TC17 Noble 33A (Task 33 paths/CA) · TC15 parse mapping needs Vyapar sample
- [x] Admin Tax & Commission IA (TCA01–06): sidebar group + SectionTabs + overview + schemes/tax/registers/payouts + overrides; `/commission` redirects
- [x] Tax & Commission rich TCR01–14 (TCR15/16 blocked): CSV schemes, overrides inbox, CA pack, PAN gaps, what-if, underwater, rate audit, recon, month lock; agent home/passbook Gross·TDS + PAN banner (web+mobile). Migrate `0068_tax_commission_rich` on EC2.
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
- [x] Compliance C1 — KYC files not public (`/uploads/promos` only; owner `GET /api/kyc/documents/:docKey`), Aadhaar last-4 only in agent-auth status + identity reveal, pino redact + redacted query tokens in access log, AePS customer consent unchecked by default (web + mobile), production refuses `EXPOSE_OTP_IN_RESPONSE` / wildcard test OTPs
- [x] Email verification OTP (`/auth/email/otp/*`) + web Verify UI (KYC, outlet, settings)
- [x] Aadhaar KYC OTP via BestAPI (`/kyc/aadhaar/otp/*`) — web + mobile signup Aadhaar step
- [x] PAN verify via BestAPI (`POST /kyc/pan/verify`) — web + mobile signup PAN step
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
- [x] Admin Treasury page (`/treasury`): total bank / total API wallets / total treasury cards, per-bank + per-provider drill-down, VyaparAPI live balance vs ledger, per-provider low-balance limit (`providers.low_balance_threshold`, migration 0047)
- [x] Admin Bank entries register (`/treasury/bank-entries`): owner capital / loan / interest / charges / provider top-up from the statement, maker-checker → `BANK_ENTRY` journal (self-approve allowed only while a single active admin exists, migration 0050), UTR unique, optional proof (stored in DB), CSV export for CA (`bank_entries`, migration 0049; system accounts `OWNER_CAPITAL`, `LOAN_PAYABLE`, `BANK_INTEREST_INCOME`)
- [x] Eko (dummy AEPS) removed: adapter, `dummy` AEPS_PROVIDER_MODE (now `off` = AePS 503 until real provider keys; old `dummy` env reads as `off`), seeds, config, brand, `EkoIndia/` docs; tests use `test_mock`. DB rows via `npm run cleanup:eko -- --apply` (float account closed, not deleted)
- [x] Admin **Bank & deposits** (`/treasury/bank`): one page, tabs Fund requests · Reconciliation · Bank entries · Bank accounts · Virtual accounts + 4 summary cards (`GET /banking/summary`). Old `/fund-requests`, `/banking`, `/treasury/bank-entries`, `/treasury/bank-reconciliation` redirect to the tab. Fund request "Link bank line" (`GET /fund-requests/:id/line-candidates`, `POST /fund-requests/:id/link-line`) replaces the dead-end approve error. Bank entry form opens as a centered modal.
- [x] Bank entries **Bank statement** column (Matched / Not in statement / Statement not uploaded / Pending approval) + "Bank statement" filter + export column; badge opens Reconciliation on that line (`?tab=reconciliation&bank=&from=&to=&line=`). Coverage = upload periods, legacy lines cover their own date. Reconciliation **Upload history** (`bank_statement_imports`, `bank_statement_lines.import_id`, migration `0052`, `GET /banking/statement-imports`) with live matched counts and View. Proof required on every bank entry.
- [x] Statement **bank verification** on upload: parser reads account last 4 / IFSC / opening balance from the CSV header; `POST /banking/statements/verify` checks account, IFSC, known UTRs (lines, bank entries, fund requests) and balance continuity → verified / blocked (with "Switch to" suggestion) / unverified (admin must tick confirm). Import route enforces the same on the first batch (`STATEMENT_BANK_MISMATCH`, `STATEMENT_BANK_UNCONFIRMED`). Stored in `bank_statement_imports.account_last4` + `verification` (migration `0053`), shown in Upload history.
- [x] **Void fund request** (test / mistaken credit): Bank entries row → red Void + reason → `POST /fund-requests/:id/void` posts REVERSAL of both deposit journals (blocked with a clear message if the agent already spent it), frees the statement line and UTR, status `voided` (migration `0054`, `voided_at/by`, `void_reason`). Hidden from Bank entries and recon; Fund requests → Voided tab; agent sees "Reversed by team".
- [x] **Test entry → Delete**: Bank entries row → "Mark test" (`POST /fund-requests/:id/test`, migration `0056` `test_marked_at/by`) → Test badge (click to unmark) + red Delete. Delete = the void above, and the API refuses it unless the row is marked test. Fund requests tab renamed Voided → Deleted.
- [x] **Reverse / move bank entry**: approved bank entry → red Reverse → REVERSAL journal (`BE:{id}:REV`), statement line back to unmatched, row stays as "Reversed" (migration `0058`: `reversed_at/by`, `reversal_journal_id`, `reverse_reason`; UTR unique index ignores reversed). Optional "Re-enter on another bank" creates a copy (same amount/date/UTR/proof) as a new request. Recon hides reversed pairs. **15 Oct 2026:** Reverse button shows only when Developer → Safety → Enable row delete is on (emergency fix; normal fix = Reject before approve; agent money via Admin Transfer / Reverse or test Delete). Reversed rows hidden from the Bank entries list. Recon "Only in bank" → Remove line (`DELETE /banking/statements/lines/:id`, unmatched only).
- [x] **Strong agent confirm** (`AgentConfirmModal`: server-loaded identity + red warning + type/paste UID with Copy): Load float (Wallet → FundForm), Assign VAN (Banking → Virtual accounts), Move agent / Change upline (MoveAgentModal; agent page now uses it instead of a typed parent UID). Fund request permission popup now allows paste + Copy.
- [x] **Full bank details copy**: company bank accounts store account name, type (current/savings), branch name, branch code (migration `0057`; admin Register/Edit bank form). Copy (admin Treasury popup, agent web + mobile bank cards, settlement banks) = passbook block: Account Type / Account Number / Account Name / Bank Name / Bank IFSC / Branch Code / Branch Name.
- [x] **Bank City / District**: `bank_accounts.city` (migration `0059`). Admin bank form: Bank name, Branch, City / District editable (IFSC fills empty fields only — IFSC data can be wrong). Shown in review / view / delete / Treasury popups; copy adds `City:` on admin, agent web and mobile.
- [x] **Fund request receipt upload**: receipt file stored in `fund_request_receipts` (migration `0060`); SHA-256 computed server-side. Agent web + mobile send the file; admin Receipt buttons open it via `GET /fund-requests/:id/receipt`. Old requests (dead `receipts.asanpay.app` link) show "Receipt file was not uploaded".
- [x] **Self-signup is Retailer only**: login (web + mobile) has no role picker — role comes from the account; only "Sign up as Retailer" link. Signup role list = Retailer / Direct Retailer. `signup/complete` rejects Distributor / Super Distributor (admin creates them).
- [x] **Upline invites**: Super Distributor invites Distributors, Distributor invites Retailers (web Network page + mobile Network tab). Name + mobile + email → emailed single-use link `AGENT_PORTAL_URL/signup?invite=…` (7 days, bound to that mobile, hash-only in `signup_invites`). Signup locks role + upline from the invite; Resend rotates the link, Cancel revokes. Platform exception: the invite link opens web signup (no app deep link).
- [x] **Mobile fund request history**: Add Money → History → "My fund requests" (amount, credited, mode/UTR, status pill, pull to refresh) — parity with agent web History tab. "Reversed by team" shows red on web + mobile.
- [x] **Bulk bank entries from statement**: Reconciliation → tick "Only in bank" lines (same direction) → "Create entries for N selected" → one category (+ provider) for all, receipt slot per row. Rows without a receipt are created as "Receipt missing"; Bank entries tab → "Add receipt"; approve is locked (UI + API `RECEIPT_MISSING`) until uploaded. Single "Create bank entry" unchanged (proof still required). API: `POST /admin/bank-entries/bulk`, `POST /admin/bank-entries/:id/receipt`.
- [x] **Admin Transfer / Reverse** on Distributor + Retailer rows (All Agents / Distributors / Retailers): icon buttons → popup (From → To with balances, amount, reason). Transfer = upline wallet → agent; Reverse = agent → upline (same journals as agent Fund / Reverse, no new money). At/above `fundApproveDualRupees` → second admin approves in the yellow strip on the agents page. Table `admin_wallet_moves` (migration `0055`), `GET /admin/agents/:id/wallet-move-context`, `POST /admin/agents/:id/wallet-move`, `GET /admin/wallet-moves`, `POST /admin/wallet-moves/:id/approve|reject`. Admin only — Super Distributors have no upline wallet.
- [x] **Fund request permission switch** opens a confirm popup with agent details (UID, mobile, KYC, account, upline, credited history). Allow = red warning + type the agent's UID (paste blocked); server also requires `confirmUid`, KYC verified and active account (`GET /admin/users/:id/fund-request-context`). Turn off = simple confirm.
- [x] **Multiple accounts per bank**: second+ account of the same bank/purpose gets its own ledger `TREASURY_BANK_<BANK>_<PURPOSE>_<LAST4>` (then `_<IFSC>`); only the exact same account (last 4 + IFSC) is rejected as a duplicate. No migration.
- [x] Admin Treasury sidebar = 4 items: **Treasury overview** (tabs Overview `/treasury` · Company balance `/wallet` · Float `/float`), **Bank & deposits**, **Reports & recon** (tabs Ledger reports · Balance statement `/passbook` · Txn reconciliation · Recon adjustments), **Treasury settings**. Shared `components/layout/SectionTabs.tsx`; URLs unchanged. Settlements / banks moved under Agents. Txn reconciliation API fixed (`provider_logs.status <> transactions.status::text`).
- [x] Bank reconciliation (admin → Bank & deposits → Reconciliation): upload statement CSV / paste from Excel per bank → auto-match by UTR + amount (persisted as `bank_statement_lines.matched_to_type='journal'`) → report highlights Possible match / Amount mismatch / Only in bank / Only in our records / Suspense + closing balance check; Confirm / Undo match; "Create bank entry" prefills Bank entries; PDF/Excel export. No migration.
- [x] **Cash picture** (TB01): Bank & deposits top strip — Bank (latest statement `balance_after`) / Books (ledger for those banks) / Difference / Pending (unmatched credit amount). `GET /banking/summary` `cashPicture`. No reconcile run, no migration.
- [x] **Recon status labels** (TB02): plain English — Needs review / Likely match / Amount differs / In bank only / In books only + tip strip for old codes (`suspense`, `possible`, …). Admin recon UI only; API kinds unchanged.
- [x] **Explain this line** (TB03): recon attention rows show Why + Next under the status pill; CTAs link to Confirm / Create bank entry / Bank entries / Fund requests / Check period. Admin recon UI only.
- [x] **Activity feed** (TB04): Bank & deposits → Activity tab — filters All / Bank / Agent / API. `GET /banking/activity` merges statement lines, bank entries, fund requests, provider journals. Admin only; no migration.
- [x] **Open in Reconcile** (TB05): Fund requests with a linked bank line show “Linked to bank” + Open in Reconcile jump; bank entries statement cell shows agent + Open in Reconcile. Admin only; no migration.
- [x] **Provider ledger strip** (TB06): Treasury overview — In / Out / Fees / Wallet impact for API float (Today·Week·Month). `GET /admin/treasury/provider-ledger`. Separate from bank statement CR/DR. No migration.
- [x] **Daily close wizard** (TB07): Bank & deposits → Daily close — Upload → Reconcile → Resolve → Close. `GET/POST /banking/daily-close`, reopen. Table `treasury_daily_closes` (migration `0063`).
- [x] **Balance lock + mid-day drift** (TB15): Per bank per day opening/closing on Daily close. Close → `bank_daily_balance_locks` (migration `0064`). Drift live until lock; import/match blocked when locked. `GET /banking/balance-drift`.
- [x] **Category rules** (TB16): UTR prefix → bank entry category. Tab under Bank & deposits. Bulk create Auto. Table `bank_entry_category_rules` (migration `0065`).
- [x] **Treasury search** (TB17): Bank & deposits search box — UTR / amount / agent / mobile. `GET /banking/search`.
- [x] **Mobile-friendly recon** (TB18): Admin-web phone layout for Reconciliation (sticky bulk, touch targets, tile tips). Exception: no native admin app.
- [x] **Test entries visual** (TB19): Amber row + Test badge on Bank entries / Fund requests / Activity. Admin list exposes `isTest`.
- [x] **Treasury health score** (TB20): Bank & deposits top strip 0–100 (match / gap / freshness). `GET /banking/health-score`.
- [x] **Daily summary export** (TB08): Daily close → PDF/CSV/XLS + email/WhatsApp send. `GET /banking/daily-summary`, `POST /banking/daily-summary/send`. Activity feed API rows titled `Provider · Service` (e.g. VyaparAPI · Recharge).
- [x] **Duplicate / double-credit guard** (TB09): Statement verify returns soft `duplicateWarnings` (UTR already credited / amount+date); Import requires `confirmDuplicates`. Fund-request approve returns `DUPLICATE_CREDIT_CONFIRM` until `confirmDuplicate`. Admin UI checkboxes. No migration.
- [x] **Wrong-bank detector** (TB10): Import blocked when statement points at another company bank (account/IFSC mismatch, more UTRs on other bank, opening continues other bank, or balance gap with no soft match). Soft continuity alone cannot override wrong-bank evidence unless account/IFSC hard-match. UI shows “Import is blocked” + Switch bank. No migration.
- [x] **Likely match + Confirm** (TB11): Recon `possible` = same amount/side within 3 days when UTR missing on one/both sides (or same UTR); exactly one candidate. Row hint + Confirm match; Confirm all likely. No migration.
- [x] **Bulk resolve unmatched** (TB12): Select In bank only + Likely match → Ignore / Confirm matches / Create entries. Per-row Ignore + Restore. `POST /banking/reconciliation/ignore`, `unignore`. No migration.
- [x] **Role views** (TB13): Admin Bank & deposits = full tenant fund requests. Agents = own deposits only (API already scoped; hardened collection-only bank list). Agent web/mobile “My deposits” + status filters. No migration.
- [x] **Banking audit trail** (TB14): Bank & deposits → Audit trail timeline (who / when / why for match, undo, ignore, delete, day close). `GET /banking/audit`. Statement delete audited with optional reason. No migration.
- [x] Fund request rules: SD / Distributor on by default, Retailer off until admin enables per user (`users.fund_request_enabled`, migration 0051; switch in Retailers list + agent detail). Cash deposit only (web + mobile), bank + receipt required. Admin list shows agent, bank, deposit date; credited requests appear read-only in Bank entries + CA export
- [x] Fund requests (company collection bank deposit) open to all agent roles — SD / Distributor / Retailer (API + web `/fund-request` + mobile Add Money / Request Funds); admin list shows requester role
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
- [x] Android Keystore for bio refresh token — `apps/asanpay-mobile-app/src/lib/secureStorage.ts` uses `react-native-keychain` (Android Keystore / iOS Keychain); `bioUnlock.ts` stores the refresh token there. `storeRefreshToken()` already fails closed in production (`!__DEV__`): if Keychain is unavailable it returns `false` and biometric unlock gets disabled rather than falling back to plain storage — the fallback-to-app-storage path only exists behind `__DEV__`, by design, for pre-rebuild dev builds.
- [x] History purge for any secrets ever pushed to remote — not needed. `git log --all -- LOGIN.md` is empty (never committed) and no `.env` file has ever been added, only `.env.example` — confirmed via `git log --all --diff-filter=A -- '*.env'` (empty). `.gitignore` covers `LOGIN.md`.
- [x] Cert pinning (Android) — `android/app/src/main/res/xml/network_security_config.xml`, wired via `android:networkSecurityConfig` in `AndroidManifest.xml`. Pins the Let's Encrypt intermediate (not the leaf, which LE rotates ~90 days) with the root as backup pin. **Pins expire 2027-07-17 — renew before then or Android silently drops back to normal CA trust (fails open).** No iOS project exists yet, so nothing to pin there.
- [x] httpOnly cookie BFF (web) — `apps/agent-portal` + `apps/admin-portal` proxy (`app/api/proxy/[...path]/route.ts`) already set httpOnly/secure/sameSite=lax cookies and never return real tokens to client JS (just a `"cookie"` placeholder); confirmed 2026-08-08. Fixed the one real gap found: agent-portal's biometric "Welcome-back" flow was storing a raw refresh token in browser `localStorage` (`lib/webauthn.ts`) and had been dead since the cookie cutover (settings/onboarding both hard-blocked it once `refreshToken` became the placeholder). Reworked biometric to a pure local WebAuthn unlock gate + `GET /auth/me` over the cookie session — no token ever touches client JS now. Also widened the proxy's silent refresh-on-401 retry to cover `GET /auth/*` calls (was POST-only), needed for `/auth/me` to self-heal an expired access cookie. Mobile app is untouched — separate token flow by design. No iOS project yet either, so no iOS-side pinning to do until one exists.
- [ ] `blockServices`/`blockLogin` were declared-but-dead flags until 2026-08-07 (task #14) — now enforced; watch for any other declared-but-unread security flag in `accounts`/`users` schemas.
- [ ] AePS block/dormancy were one-way doors until 2026-08-07 (task #9) — a blocked or dormant merchant had no path back. Fixed; watch for the same pattern (a flag that's only ever set, never cleared) elsewhere.

## Last updated
2026-10-27 — KYC photo check speed-ups (PL-22, web + mobile + backend): photos sent at ≤ 1600 px / JPEG 0.8 (web canvas, mobile gallery + camera resize), server OCR / alignment / auto-crop detection on a ≤ 1280 px copy (quality 600 px rule + QR on the received image), OpenCV warmed at boot, Aadhaar QR + OCR in parallel (signed QR wins, OCR stops early), photo shows at once with a "Checking…" pill and Continue waits for a running check ("Checking photo…"). `KYC doc check` log adds `cropMs` / `qualityMs` / `qrMs` / `ocrMs`. Mobile: npm install (`@bam.tech/react-native-image-resizer`) + APK pending
2026-10-27 — PL-17 step 2 one home per setting (admin): Tax → Tax settings is the only tax editor (default card + per-service table, edit popup, "Use default tax instead", reason + Rate audit via `/admin/rate-card/tax`); Rate card shows default + per-service tax read-only with "Edit in Tax"; Customer fees page Add / Edit / End through `/admin/rate-card/customer-fee` (reason + Rate audit, Live / Scheduled / Ended filter). Old `POST/PATCH/DELETE /admin/service-charges` + `PATCH /admin/commission/tax-config/:id` → 410. What-if + Underwater retired (redirect to Rate card / "Loss & missing" view `?view=loss`, dashboard loss tiles link there). KYC queue badge refresh fixed (body inside AdminShell)
2026-10-27 — Admin → Platform settings → Location limits (PL-18): shop radius (1–50 km), home radius (1–20 km), location check on/off with red confirm when turning off. Stored in `tenants.settings.geofence` (no migration); gate uses admin value → env (`SHOP_GEOFENCE_KM` / `HOME_GEOFENCE_KM` / `AEPS_GEOFENCE_KM`) → 15 / 5, 30 s cache cleared on save. Audit `admin.geofence_settings_update`. Admin only — agent web / mobile unchanged
2026-10-27 — Signup v2 Part 2 (PL-18): home location (step 5) + shop location (step 6), required in UI — mobile "Fetch location" (high-accuracy GPS, mock + jail-monkey check), web phone-camera QR to public `/geo/<token>` (no app / login, `/api/geo-link/public/*`, 10 min, ±150 m). `submitKyc` saves shop → `outlet_*`, home → `users.home_*` (migration `0080`). Geofence = 15 km from shop OR 5 km from home (`SHOP_GEOFENCE_KM`, `HOME_GEOFENCE_KM`) on AePS / Aadhaar Pay / DMT. Risk alerts: shop far from pincode, possible VPN, rooted phone. Step-1 location gate removed
2026-10-27 — Daily 2FA gate is back after onboarding Skip (web `/aeps`, `/dmt`): same `DailyVerifyCard` with "Complete AEPS onboarding" CTA instead of Scan (provider 2FA needs the onboarding agent id). Aadhaar Pay provider KYC + daily scan (`AadhaarPaySetupCard`) now render `DailyVerifyCard` (Step 1 of 2 / Step 2 of 2)
2026-10-27 — Daily 2FA redesign D1 (PL-13, web): shared `DailyVerifyCard` (Aadhaar-style card + verify column + steps/tips) on `/aeps` (AePS + Aadhaar Pay) and `/dmt`. States: idle, no device, scanning, verifying, success (stamp + Continue), failed (Try again / Use face instead), Aadhaar missing (Complete KYC). DMT gate now discovers the RD device before unlock (was stuck on "Scanner still connecting"). Mobile (D2) pending
2026-10-26 — AEPS 2FA status follows the provider: `/auth/agent-auth/status` calls `load_agent`; if `daily2faRequired` is YES while our record says done, the record is cleared (2FA screen shows, money endpoints block). Provider error keeps our record
2026-10-26 — Onboarding before 2FA: AePS / Aadhaar Pay / Cash Deposit / UPI Cash Point / DMT open the AEPS onboarding form (not the 2FA screen) while onboarding is pending — provider daily 2FA needs the onboarding agent id. Skip opens the service's normal screen without the 2FA gate, with an "AEPS onboarding pending" banner; Scan / Send money open onboarding (web + mobile)
2026-10-26 — Web location via phone QR (PL-03): web onboarding "Fetch Location" + AePS "Verify location" show a QR; mobile home Scan QR sends phone GPS (`/api/geo-link`, migration `0074`). Onboarding Submit disabled until location captured (web + mobile); web onboarding uses server-verified coordinates only
2026-10-26 — Cash Management page (PL-02, web + mobile): provider cards (Airtel CMS now, config-driven list) with Initiate; no merchant id input (backend sends the retailer's registered mobile); CMS opens inside the app (mobile WebView, branded status / nav bars) and inside the portal (iframe overlay + "Open in new window"); every collection saved in `cms_transactions` (migration 0073) with status check + date-range list + Export PDF / Excel / CSV
2026-10-26 — Face authentication (UIDAI Aadhaar FaceRD, mobile): AEPS daily 2FA, Aadhaar Pay KYC + daily 2FA, Aadhaar Pay customer txn send `bioType 2`; Fingerprint / Face picker on mobile, web shows "Mobile app only". Fixed Aadhaar Pay KYC sending the whole `finger~iris~face` wadh (web + mobile) — fingerprint now uses the finger part only. Other AEPS txns (CW / BE / MS / CD) stay fingerprint
2026-10-26 — UPI Cash Point QR is now a real txn (`UPI_CASH_POINT`, pending until paid, AEPS wallet credit + commission on success); web + mobile watch payment status and show paid / failed; daily recon sends `QR`. Ledger type map fixed for `aadhaar_pay` + `aeps_cash_deposit` rail codes. Ops script `failUnsubmittedTxn.ts` settles stuck never-submitted txns via the txn service: auto-reversal (ledger debit), close against an approved recon adjustment (pre-ledger debit), or `--never-charged` close (no money on record). LKP20260801F7A0A83F closed as never charged (no ledger, wallet-book or hold entry)
2026-10-26 — DMT beneficiary list now loads from the provider on remitter lookup (web + mobile); add/delete finish in one step with a delete confirmation; delete uses the real IFSC. Admin dashboard "Provider wallet" tile + live provider balance on Treasury
2026-10-26 — Old outlet / bio-KYC UI removed (web + mobile), Nepal → Coming soon on both; migration 0071 drops `instantpay_outlet_id` and deactivates old provider rows
2026-10-25 — Removed PaySprint + InstantPay backend code (adapters, clients, onboarding, env, Nepal handlers). Old onboarding routes → 410, Nepal routes → 503 Coming soon; AEPS mode only `off | noble`. UI cleanup (P7) + DB migration (P8) still pending
2026-10-27 — PL-17 step 3 admin dashboard: "Needs action" tiles (fund requests, KYC, agent banks, tickets, open disputes, stuck txns 30 min+, PAN gaps, services losing money, services with a role on ₹0), "Today" money vs same time yesterday IST (txns, success volume, fee income, commission paid net/gross/TDS, GST on fees), real System health (DB ping + latency, Redis ping / off), provider wallet, agents, recent activity; `GET /admin/dashboard`; removed duplicate quick links + fake "operational" health
2026-10-27 — PL-17 regroup A: admin sidebar under Daily work / Money / Setup; Transactions group (All · Stuck & recovery · Disputes); Support (Tickets · WhatsApp · Device repairs · Risk alerts · Support contacts); Services (Services & badges · Providers & routing); Agent messages; System (Audit log · Safety); page titles renamed; header search de-duplicated
2026-10-27 — PL-17 step 1 admin sidebar split: Commission · Tax · Support & Risk · Platform settings groups (was Tax & Commission + Platform Control); Service charges → Commission "Customer fees"; renames Agent bank accounts / Commission check / Rate history / Agent custom rates; `/tax-commission`, `/commission`, `/commissions` → Rate card; in-page tabs split; header search keywords updated
2026-10-27 — PL-14 RC2 admin Rate card (`/tax-commission/rate-card`, first in Tax & Commission): table per service with slab rows (provider pays · Retailer · Distributor · SD · company keeps), inline edit of provider income / customer fee (same `service_charges` rows as Platform Control) / share % / per-service tax, confirm popup with required reason, live preview (customer pays, provider GST − TDS = net receivable, role gross/TDS/net, red "Company loses", provider cost lines); default tax card incl. provider-side output GST / TDS; GST on fee "Added on top" (default) vs "Included in fee" — migration 0079, live debit stores base fee + GST so totals stay right; "Suggested" chips from the provider sheet (fill the form only); `POST /admin/rate-card/tax`, `DELETE /admin/rate-card/tax/:serviceId`; Rate audit shows share / provider income / tax changes; 21 unit tests
2026-10-27 — PL-14 RC1 rate card backend: `provider_payout_rules` + `commission_shares` (migration 0078, seeds 60/10/5 per active service); payout order override → share of provider income → fixed rule; `GET /admin/rate-card`, `POST /admin/rate-card/preview`, share + provider-income writes with reason, month lock, rate audit; 17 unit tests
2026-10-25 — Recharge operator/circle mapping: provider number lookup (cached 6h) picks operator + circle; wrong-operator recharges fail before the provider call with a clear message; DTH static codes; no UI change
2026-10-25 — Aadhaar Pay tab (web `/aeps` + mobile AePS): AP load → one-time KYC → daily AP 2FA → optional customer OTP → `/txn/aeps/aadhaar-pay`; AADHAAR_PAY tile opens it
2026-08-08 — httpOnly cookie BFF ticked done: web portals already used cookie-based sessions; fixed the one real gap (biometric login storing a raw refresh token in localStorage, already dead post-cutover) and widened proxy refresh-retry to cover GET /auth/* (needed for /auth/me self-heal)
2026-08-07 — Security list corrected: Keystore + history-purge were already done, ticked. Cert pinning still open. Added: fallback-to-app-storage bio path should fail closed; graded restrictions (blockServices/blockLogin) now enforced (task #14); AePS block/dormancy one-way-door fixed (task #9)
2026-08-04 — Role rename master_distributor → super_distributor (migration 0032 RENAME VALUE; UI Super Distributor same)
2026-08-04 — §9.3 product copy: no user-facing "Wallet" — Main / AEPS (agent, admin, mobile, emails, PDF, API errors)
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
2026-09-21 — Agent UIDs: remap script `npm run remap:uids` → ASPRT/ASPD/ASPSD/ASPAD; hard-delete resyncs uid_counters
2026-09-20 — Txn refs: new `ASP`+`YYMMDD`+agent last6+6hex (e.g. ASP260920100001A1B2C3); legacy `LKP…` unchanged
2026-09-20 — Agent public UIDs: new accounts get `ASPRT`/`ASPD`/`ASPSD`/`ASPAD` + 6-digit seq from 100001 (migration `0046_uid_counters`); legacy RT/DS/MD unchanged
2026-10-26 — KYC photo check admin (PL-05 chat 3): KYC queue + agent page show per-doc labels from `kyc.submit` → `docChecks` (✓ PAN photo matched / ✓ Aadhaar QR verified / ⚠ Name mismatch (72%) / ✗ Wrong document …); queue filter "Flagged photos" (`GET /admin/kyc?flagged=1` → any flag/fail)
2026-10-26 — Signup PAN / Aadhaar photos required + crop & rotate before upload (web popup, mobile native crop screen); screenshots allowed in app (`ENABLE_SECURE_SCREEN=false`)
2026-10-26 — KYC photo check UX (PL-05 chat 2): web signup + mobile signup call `/kyc/documents/check` after PAN / Aadhaar photo pick — "Checking photo…", red fail (photo cleared, Continue blocked), amber flag, green pass; shared copy in `@asanpay/shared-types`
2026-10-26 — KYC photo check engine (PL-05 chat 1, backend only): `POST /api/kyc/documents/check` — quality (size/dark/blur), Aadhaar Secure QR + UIDAI signature, tesseract OCR (eng+hin, bundled data), PAN / Aadhaar data match; result saved in `kyc.submit` → `docChecks`. Web/mobile UX + admin labels pending (chats 2–3)
2026-09-16 — PAN KYC verify: BestAPI pan-verify on signup PAN step (web + mobile)
2026-09-16 — Aadhaar KYC OTP: BestAPI send/verify on signup Aadhaar step (web + mobile); no full Aadhaar in logs
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
