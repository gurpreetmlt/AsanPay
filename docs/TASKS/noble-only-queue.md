# Noble-only queue — remove InstantPay + PaySprint, finish Noble

> Size: XL — **one phase per chat**. Read only this file + `AGENTS.md` + the paths listed in the CURRENT phase.
> Owner decision (25 Oct 2026): delete InstantPay + PaySprint code entirely. Nepal remittance → **Coming soon** (it only ran on InstantPay).
> Provider docs: `NobleWebStudio/*.md` (internal vendor map — never copy the brand into UI copy or commits).

## Rules for every phase
- Backend + web + mobile parity in the same phase when UI changes.
- `npx tsc --noEmit -p .` clean in each touched app (mobile: only the 7 pre-existing errors in `AepsScreen.tsx` / `SignupScreen.tsx`).
- No competitor or provider brand names in UI copy, comments or commit messages.
- Ops (seed / switch / migrate) = EC2 SSH, one command at a time. Never print secrets.
- When a phase is done: mark it `done`, promote the next row to `CURRENT`.

## Queue

| # | Phase | Status |
|---|-------|--------|
| P1 | Route AEPS + DMT to Noble in DB (ops only) | done (25 Oct) — owner to confirm What-if margins |
| P2a | Aadhaar Pay setup + Cash Deposit status — backend | done (25 Oct) |
| P2b | Aadhaar Pay tab on web `/aeps` + mobile `AepsScreen` (AP load → KYC → 2FA → OTP → txn) | done (25 Oct) |
| P3 | Recharge operator / circle mapping → switch recharge | done (25 Oct) — switch applied on EC2; ₹10 live test recharge still pending |
| P4 | DMT `bene/get` + admin Noble wallet balance | done (26 Oct) |
| P5 | Delete PaySprint | done (25 Oct) |
| P6 | Delete InstantPay backend (adapter, client, onboarding, env, tests) | done (25 Oct) |
| P7 | Delete InstantPay UI (outlet / bio-KYC pages + mobile modals) + Nepal → Coming soon | done (26 Oct) |
| P8 | DB cleanup migration (`instantpay_outlet_id`, provider rows) | done (26 Oct) — `0071` runs on EC2 after redeploy |
| P9 | UPI QR collections → transactions + recon `QR` | done (26 Oct) — `0072` runs on EC2 after redeploy |
| P10 | Callback handler → settle txns (needs provider sample payload) | on hold (owner, 27 Oct): after app work. URL verified: provider test callback 23 Oct (`test`, `status`, `clientRefId`); no live txn callback yet |
| P11 | Token: reuse one token until 23:59:59 IST, no early refresh (all tokens of a day share that expiry) | done (31 Oct) — `noble/client.ts`, `test/nobleTokenShare.test.ts` |
| P12 | Recharge status: only `tranStatus` decides; missing `tranStatus` → `recharge_status`; never auto-fail / refund an unknown txn until the provider names its "not found" code | **CURRENT** |
| P13 | "No records" rule: `AG0003` (AEPS, UPI QR) and `DB0042` (DMT) are never final by time; no status check in the first 15 min; replaces UPI QR "15 min then failed" | |
| P14 | Airtel DMT: eKYC field `merchantMobileNo`; `RS_OB_009` → stop with a clear message; send a correct `bankName` (IFSC lookup) | |
| P15 | Cash Deposit bank list (62 banks, own list) separate from AEPS (136 banks) — web + mobile | |
| P16 | CMS: check flow = provider wallet debit → our retailer-debit callback → bank; commission from the posting webhook | |
| P17 | Daily recon: after 23:00 IST, max 500 per call, CW / MT / QR / CD, from the first production txn — check `reconJob.ts` | |

---

### P1 — Route AEPS + DMT to Noble (ops only, no code)
Code already shipped: `scripts/seedProviders.ts` (adds Noble rows, inactive), `scripts/switchRailProvider.ts` (dry run default).
EC2 SSH, inside the backend container, one at a time:
1. `npm run seed:providers`
2. `npx tsx scripts/switchRailProvider.ts --to noble --scope aeps,dmt` (dry run — check every line says `-> noble`)
3. same with `--apply`
4. Admin → Tax & Commission → What-if: check margins for CW / DMT before agents transact.
Do **not** switch `recharge` until P3.

Done 25 Oct 2026: seed created 20 AEPS/DMT + 2 recharge `provider_services`; switch applied 19 services `none -> noble`.
Jobs worker (`api-asanpay-in-jobs`) needed the same env as the API: `AEPS_PROVIDER_MODE=noble`, `NOBLE_API_KEY`, `NOBLE_API_VALUE`.
Commission rules must have provider = Noble or All providers, or Noble txns pay no commission.

### P2 — Aadhaar Pay setup + Cash Deposit status
Read: `apps/backend/src/modules/providers/adapters/noble.adapter.ts` (`aadhaarPay`, `aepsCashDeposit`, `checkStatus`), `apps/backend/src/modules/onboarding/nobleAepsSession.service.ts`, `NobleWebStudio/AEPS.md` (endpoints 7–14).
- Add `ap_load_agent`, `ap_kyc`, `ap_daily_2fa`, `ap_generate_otp` mirroring the AEPS session flow.
- `checkStatus` for `aeps_cash_deposit` → `/v2.0/aeps/cd_transaction_status`.
- UI: Aadhaar Pay screen runs AP 2FA before txn (web `/aeps?tab=…` + mobile `AepsScreen`).

**P2a done (backend):**
- `POST /api/onboarding/noble/ap/load` `{channel}` → `{kycRequired, daily2faRequired, kycWadhValue, amountForOtp, tranTypeForOtp}`
- `POST /api/onboarding/noble/ap/kyc` `{biometricPayload, dob?(DD/MM/YYYY, default = KYC dob), latitude, longitude, channel}` — PID captured with `kycWadhValue`
- `POST /api/onboarding/noble/ap/2fa` `{biometricPayload, latitude, longitude, channel}`
- `POST /api/txn/aeps/aadhaar-pay/otp` (same body as `/aeps/withdraw/otp`) → `{otpRequired, otpReference, otpTransactionId, otpTransactionToken}` — call only when `tranTypeForOtp === "MT"` and amount ≥ `amountForOtp`
- `POST /api/txn/aeps/aadhaar-pay` now also accepts `otpReferenceKey`, `otpTransactionId`, `otpTransactionToken`
- Recheck of `aeps_cash_deposit` uses `/v2.0/aeps/cd_transaction_status`

**P2b (UI) — read:** `apps/agent-portal/app/aeps/page.tsx` (+ `components/aeps/AepsLayout3.tsx`), `apps/asanpay-mobile-app/src/screens/retailer/AepsScreen.tsx`.
Today the `AADHAAR_PAY` tile opens the Withdraw tab and no client calls `/txn/aeps/aadhaar-pay` — add an "Aadhaar Pay" tab on both. The txn still also requires the normal AEPS daily 2FA (`assertAgentAuthFresh`).

**P2b done (UI):**
- `AADHAAR_PAY` tile → `/aeps?tab=Aadhaar Pay` (web) / `Aadhaar Pay` tab (mobile).
- Tab calls AP load; "Activate Aadhaar Pay" card runs KYC (PID with `kycWadhValue`) then daily AP 2FA until both are clear.
- OTP only when `tranTypeForOtp=MT`, amount ≥ `amountForOtp`, bank ≠ Airtel `990320`; OTP rides in the PID capture.
- Web: `components/aeps/AadhaarPayFlow.tsx` (session hook, setup card, confirm modal with TPIN). Web bank list now carries IINs (+ live `/txn/aeps/banks` override).
- AP session + txn calls send no `channel` (API defaults `APP`) so the AP session and `ap_transaction` use the same channel. Other web AePS tabs still only capture the fingerprint — not wired to txn APIs yet.

### P3 — Recharge operator / circle mapping
Read: `noble.adapter.ts` `recharge()`, `NobleWebStudio/RECHARGE.md`, web `app/recharge/page.tsx`, mobile `RechargeScreen.tsx`.
- Call `operator_and_circle` (cache in memory/redis) → map our operator code + circle to provider `operatorCodeB2B` + `circleCode`. Remove hard-coded `circleCode: "50"`.
- Then ops: `switchRailProvider.ts --to noble --scope recharge`.

**P3 done (backend only — clients already send `AT|BL|JIO|VI` / `ATV|DTV|TTV|STV|VTV`, no UI change):**
- `providers/noble/rechargeOperators.ts` → `resolveRechargeRoute()`; `operator_and_circle` cached 6h per number (Redis if `REDIS_URL`, else memory).
- Mobile: detected `operatorCodeB2B` + `circleCode` are sent. If the number is on another operator → txn fails before the provider call with `This number is on Jio, not Airtel. Select Jio and try again.` (wallet reversed). Lookup down → static code + circle `50` (provider default).
- DTH: static map, circle `50`. Only `AIRTELTV_B2B` / `DISHTV_B2B` are in the docs — `TATASKY_B2B`, `SUNTV_B2B`, `VIDEOCON_B2B`, and mobile fallbacks `JIO_B2B` / `VI_B2B` / `BSNL_B2B` are unconfirmed (see open questions).
- `RechargeParams.serviceCode` added; txn data now carries `providerOperatorCode`, `providerCircleCode`, `routeSource`.
- Test: `test/nobleRechargeOperators.test.ts`.

### P4 — Beneficiary list + admin balance
- `bene/get` → DMT beneficiary list (web `app/dmt`, mobile `DmtScreen`).
- `GET /api/v1.0/common/balance_check` (GET, Bearer) → admin dashboard tile "Provider wallet".

**P4 done:**
- `noble/client.ts` → `nobleGet()` (shared request with `noblePost`). `airtelDmt.ts` → `nobleBeneList()`.
- Remitter profile fills `beneficiaries` from `bene/get` (id = account number). List failure never blocks lookup (empty list).
- Delete uses the real IFSC from the list (was hard-coded); 404 `Beneficiary not found for this remitter…` if missing. Transfer sends real bene name / bank / mobile when found.
- Web `/dmt` + mobile `DmtScreen`: add / delete with empty `referenceKey` = done (no OTP step); delete now asks for confirmation first; OTP panel only when an OTP was sent.
- Balance: `providerLiveBalance.ts` `noble` fetcher (Treasury provider card now shows live balance + mismatch). `GET /api/admin/provider-wallet` → `{status, balance, message, checkedAt}`; admin dashboard "Provider wallet" tile → `/treasury`.
- Platform exception: admin tile = admin web only.

### P5 — Delete PaySprint
Files: `providers/paysprint/`, `adapters/paysprint.adapter.ts`, `provider.registry.ts`, `aepsMode.ts`, `config/env.ts` (PAYSPRINT_*, `assertPaySprintProviderConfig`, `paysprint_*` modes), `jobs/index.ts`, `server.ts`, `scripts/seedProviders.ts`, tests, `packages/config`, admin `lib/providerBrand.ts`.
Grep `-i paysprint` must return only migrations afterwards.

**P5 done:** adapter + client deleted; env keys / modes / assert gone; admin PaySprint-DMT confirm modal + brand removed; `packages/config` defaults → `noble`. Old `paysprint_*` mode values boot as `off`. Leftover `provider_services` rows for PaySprint are skipped by the router (no adapter registered) until P8 marks them inactive. Vendor docs (`PaySprint/`, old task notes) left as history.

### P6 — Delete InstantPay backend
Files (largest first): `adapters/instantpay.adapter.ts`, `onboarding/onboarding.service.ts` + routes/controller/validators (InstantPay outlet + bio-KYC + mobile change + merchant list), `providers/instantpay/`, `config/env.ts`, `providers/types.ts` (Nepal types), `auth/agentAuth.ts`, `transactions/txn.validators.ts` + controller, `aeps/compliance.ts`, `users.service.ts`, `admin.service.ts`, tests `aepsProviderMode.test.ts` / `aepsCompliance.test.ts`.
Nepal API routes → return 503 `Nepal remittance is coming soon` (keep route so old apps get a clear message).
`AEPS_PROVIDER_MODE` → only `off | noble`.

**P6 done:**
- Deleted: `adapters/instantpay.adapter.ts`, `providers/instantpay/` (client, crypto, pidXml), `onboarding/onboarding.service.ts` + `onboarding.validators.ts`.
- `AEPS_PROVIDER_MODE`: any value other than `noble` boots as `off`. `INSTANTPAY_*` env + `assertAepsProviderConfig` / `isInstantPayAepsMode` removed.
- `/api/onboarding/instantpay*` → 410 `Outlet registration is no longer required. Complete AEPS onboarding from the AEPS screen instead.`
- `/api/txn/nepal/*` → 503 `Nepal remittance is coming soon`. Nepal handlers, validators, adapter methods and types removed. `AEPS_ROUTED_SERVICE_CODES` = `agent_auth` only.
- `agentAuth`: provider outlet-login check removed; status `outlet` is always `null` (it was already null on the current provider).
- Compliance: certified-device check (only ran on the old rail) removed; dormancy anchor unchanged on the current provider.
- **Kept for P7 / P8:** `users.instantpay_outlet_id` column + reads (`auth.service`, `kyc.service`, `users.service` `hasOutlet`), `AuthUser.hasInstantpayOutlet`. Drop them together with the P8 migration.
- Tests: `aepsProviderMode.test.ts` rewritten for `off | noble`; InstantPay cases removed from `aepsCompliance.test.ts`.

### P7 — Delete InstantPay UI + Nepal Coming soon
Web: `app/onboarding/outlet`, `app/onboarding/bio-kyc`, `app/settings` (outlet / bio-KYC buttons), `app/nepal` → Coming soon page, `app/dmt`, `lib/rdServiceFingerprint.ts`.
Mobile: `RegisterOutletModal.tsx`, `BioKycModal.tsx`, `AccountScreen.tsx` entries, `NepalScreen.tsx` → Coming soon, `DmtScreen.tsx`, `AepsScreen.tsx`, `lib/rdServiceFingerprint.ts`.
Admin: `developer-options/providers` brand list.
`AuthUser.hasInstantpayOutlet` → remove from `packages/shared-types`.

**P7 done:**
- Web: deleted `app/onboarding/outlet` + `app/onboarding/bio-kyc`; Settings outlet / bio-KYC rows removed; "Onboard partner" (network page + quick links) → `/signup`; `app/nepal` → Coming soon page with "Open Money Transfer".
- Mobile: deleted `RegisterOutletModal` + `BioKycModal`; Account screen rows removed; `NepalScreen` → Coming soon with "Open Money Transfer" (→ DMT).
- DMT refund copy: "Provider order ID" on web + mobile. KYC assistant "Outlet registration" → "AEPS onboarding" (backend `hasOutlet` = usable AEPS agent id). Web only screen.
- `AuthUser.hasInstantpayOutlet` removed (shared-types, auth, kyc).
- Platform exception: none — Nepal, Account/Settings, DMT copy changed on both.

**P8 done:** `0071_retire_old_providers.sql` (journal idx 71) drops `users.instantpay_outlet_id`, marks old provider rows + their `provider_services` inactive. Run only **after** backend + jobs redeploy (old code still selects the column).

### P8 — DB cleanup
New migration (register in `meta/_journal.json`!): drop `users.instantpay_outlet_id`; mark `providers` rows `instantpay` / `paysprint` inactive (keep rows — old txns reference them).

### P9 — UPI QR collections
Read: `providers/noble/upiQr.service.ts`, `noble.routes.ts`, `reconJob.ts`.
Record generated QR + status as a `transactions` row (credit to AEPS wallet on success), then add `QR` to `RECON_SERVICES`.

**P9 done:**
- Txn service code = catalog `UPI_CASH_POINT` (history lists already filtered on it). Credit direction, `aeps` wallet; ledger type `AEPS_WITHDRAWAL` (only float → retailer credits allowed by the flow matrix; `DMT` would have been rejected).
- `POST /api/noble/upi-qr/generate` now needs `idempotencyKey`; runs `executeServiceTxn` with provider `transactionId` = our txnRef. QR generated → `pending`; provider rejection → `failed` + 502 with the provider reason. Agent/geo/keys checked before any row is written.
- `POST /api/noble/upi-qr/status` `{txnRef}` → `recheckTxnStatus` (own txns only; no money rate limiter so clients can poll). Adapter `checkStatus` for `UPI_CASH_POINT` → `upiqr_status`: only explicit `tranStatus` SUCCESS / FAILED / EXPIRED is terminal; `AG0003 No Records Found` = pending for 15 min then failed; other errors stay pending. Unpaid-QR failures skip the critical Slack alert.
- Recon: `{ QR, UPI_CASH_POINT }` added; RRN from `metadata.provider.rrn`.
- Migration `0072_upi_cash_point_route.sql`: `UPI_CASH_POINT` min ₹200 / max ₹5,000 (if unset) + Noble primary route (if none).
- Web `/upi-cash-point` + mobile `UpiCashPointScreen`: poll status every 5s (QR timer + 60s), show "Payment received — added to your AEPS wallet, hand over cash" or the failure reason + Regenerate. History "Bank RRN" now reads the real RRN.
- Also fixed: ledger map `aadhaar_pay → AADHAAR_PAY`, `aeps_cash_deposit → AEPS_DEPOSIT` (both rail codes had no valid journal type).
- Commission: add a rule for UPI Cash Point (provider Noble or All) — the "You will earn ₹2" strip is static copy.
- Test: `test/nobleUpiQr.test.ts`.

### P10 — Callback → settle
Needs a real callback sample from the provider. Map payload → `settleTxnFromProviderCallback` (same pattern as `providers/vyaparapi/webhook.routes.ts`). Add a shared-secret query token.

## Provider reply (31 Oct) — follow-ups still open
- Token: what time does the daily login counter reset? Is the 5 / day limit shared by the production and testing IPs? Does a new login invalidate the earlier token of the same day? (dev + production run on the same credentials, each with its own token)
- Recharge: exact "Transaction Not Found" error code (our test got `RE0001` + `tranStatus: Failed` for an unknown id)
- `AG0003` / `DB0042` still returned after 15 min: when can we treat the txn as never received?
- CMS: when is commission credited in the other 0.1% of cases? If we decline the retailer debit, is our wallet re-credited?
- Penny Drop / Pennyless price per hit
- Jio DMT, Fino DMT and CMS are not in the enabled-endpoints list — enable or confirm
- Recon `reconData` format; is Aadhaar Pay recon needed; which DMT rails count as MT
- Cash Deposit list: bank name for IIN `607512`; SBI / ICICI / Kotak not on the list

## Open questions for the provider (owner emails)
- Recon `reconData` format (`status~transactionId~rrn`?)
- Commission chart per service (DMT agent commission set by us — only need the provider's charge per DMT slab)
- Which services are assigned (Fino / Jio DMT, Verification, OCR)

### DMT (Airtel live, Jio pilot, Fino next)
- Charge to us per DMT txn per rail: flat / % / slab, GST inclusive or extra, debited when, refunded on failure
- Jio + Fino DMT enabled on our production account? Separate activation per rail?
- Limits per rail: per txn min/max, per remitter daily / monthly, whole rupees only? (Jio ₹100–₹5,000)
- IMPS / NEFT per rail; NEFT cut-off timings
- Remitter registered on one rail usable on another, or register + eKYC per rail?
- eKYC: biometric needed per rail? wadh value? OTP validity + resend limit
- Beneficiary verification (penny drop) per rail + its charge
- Final status code list per rail (success / failed / pending); max time a txn can stay pending
- Callback per rail: sample payload, retries, source IPs, signature
- Recon report / API per rail + format
- Reversal after success: auto credit to our wallet? Remitter refund OTP needed? Timeline
- Same `transactionId` sent twice — duplicate rejected or processed?
- Recommended timeout + rate limit
- Per-agent onboarding / KYC needed for DMT (like AEPS), or account-level?
- Mandatory receipt fields (UTR / RRN, bank name, beneficiary name)
- Stuck txn / dispute escalation contact + TAT
- UAT test numbers for Jio and Fino
- Callback sample payload per service
- Full recharge operator code list (DTH: Tata Play, Sun, d2h; mobile: Jio, Vi, BSNL B2B codes)
