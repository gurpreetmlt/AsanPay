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
| P3 | Recharge operator / circle mapping → switch recharge | **CURRENT** |
| P4 | DMT `bene/get` + admin Noble wallet balance | todo |
| P5 | Delete PaySprint | todo |
| P6 | Delete InstantPay backend (adapter, client, onboarding, env, tests) | todo |
| P7 | Delete InstantPay UI (outlet / bio-KYC pages + mobile modals) + Nepal → Coming soon | todo |
| P8 | DB cleanup migration (`instantpay_outlet_id`, provider rows) | todo |
| P9 | UPI QR collections → transactions + recon `QR` | todo |
| P10 | Callback handler → settle txns (needs provider sample payload) | todo |

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

### P4 — Beneficiary list + admin balance
- `bene/get` → DMT beneficiary list (web `app/dmt`, mobile `DmtScreen`).
- `GET /api/v1.0/common/balance_check` (GET, Bearer) → admin dashboard tile "Provider wallet".

### P5 — Delete PaySprint
Files: `providers/paysprint/`, `adapters/paysprint.adapter.ts`, `provider.registry.ts`, `aepsMode.ts`, `config/env.ts` (PAYSPRINT_*, `assertPaySprintProviderConfig`, `paysprint_*` modes), `jobs/index.ts`, `server.ts`, `scripts/seedProviders.ts`, tests, `packages/config`, admin `lib/providerBrand.ts`.
Grep `-i paysprint` must return only migrations afterwards.

### P6 — Delete InstantPay backend
Files (largest first): `adapters/instantpay.adapter.ts`, `onboarding/onboarding.service.ts` + routes/controller/validators (InstantPay outlet + bio-KYC + mobile change + merchant list), `providers/instantpay/`, `config/env.ts`, `providers/types.ts` (Nepal types), `auth/agentAuth.ts`, `transactions/txn.validators.ts` + controller, `aeps/compliance.ts`, `users.service.ts`, `admin.service.ts`, tests `aepsProviderMode.test.ts` / `aepsCompliance.test.ts`.
Nepal API routes → return 503 `Nepal remittance is coming soon` (keep route so old apps get a clear message).
`AEPS_PROVIDER_MODE` → only `off | noble`.

### P7 — Delete InstantPay UI + Nepal Coming soon
Web: `app/onboarding/outlet`, `app/onboarding/bio-kyc`, `app/settings` (outlet / bio-KYC buttons), `app/nepal` → Coming soon page, `app/dmt`, `lib/rdServiceFingerprint.ts`.
Mobile: `RegisterOutletModal.tsx`, `BioKycModal.tsx`, `AccountScreen.tsx` entries, `NepalScreen.tsx` → Coming soon, `DmtScreen.tsx`, `AepsScreen.tsx`, `lib/rdServiceFingerprint.ts`.
Admin: `developer-options/providers` brand list.
`AuthUser.hasInstantpayOutlet` → remove from `packages/shared-types`.

### P8 — DB cleanup
New migration (register in `meta/_journal.json`!): drop `users.instantpay_outlet_id`; mark `providers` rows `instantpay` / `paysprint` inactive (keep rows — old txns reference them).

### P9 — UPI QR collections
Read: `providers/noble/upiQr.service.ts`, `noble.routes.ts`, `reconJob.ts`.
Record generated QR + status as a `transactions` row (credit to AEPS wallet on success), then add `QR` to `RECON_SERVICES`.

### P10 — Callback → settle
Needs a real callback sample from the provider. Map payload → `settleTxnFromProviderCallback` (same pattern as `providers/vyaparapi/webhook.routes.ts`). Add a shared-secret query token.

## Open questions for the provider (owner emails)
- Recon `reconData` format (`status~transactionId~rrn`?)
- Commission chart per service
- Which services are assigned (Fino / Jio DMT, Verification, OCR)
- Callback sample payload per service
