# Task 21 — InstantPay provider adapter

## Size: L (split per rail across chats)
## Depends: 09 (AEPS), 10 (DMT), 14 (BBPS)

## Goal (1 line)
Real InstantPay adapter behind the existing `ProviderAdapter` contract so AEPS / DMT / BBPS stop using stubs.

## Done (AEPS dummy↔live switch — this chat)

- [x] `AEPS_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live` + fail-closed creds check
- [x] `InstantPayAdapter` registered (`agentAuth`, balance, withdraw, mini statement, aadhaar pay, checkStatus)
- [x] AEPS services resolve by mode (instantpay_* → InstantPay, paysprint_* → PaySprint; no silent fallback — Eko stub and dummy mode removed 15 Oct 2026)
- [x] Daily agent 2FA routes through provider `agentAuth`
- [x] InstantPay `outletLoginStatus` wired into `GET /auth/agent-auth/status` (LOGGEDIN / LOGINREQUIRED)
- [x] Compliance gates: KYC, geofence, bio-mismatch/EDD, dormancy, cash receipt register
- [x] Migration `0013_aeps_compliance.sql`
- [x] Transaction OTP (₹5,000+ withdrawal): `POST /txn/aeps/withdraw/otp` → `referenceKey`; OTP rides in PID (`Opts otp=""`); mobile UI OTP step
- [x] Cash Deposit: `POST /txn/aeps/deposit` (debit AEPS wallet) → InstantPay `/fi/aeps/cashDeposit`; mobile Deposit tab live; migration `0014` seeds hidden AEPS rail service rows
- [x] Mini Statement: backend already mapped `miniStatement[]` (date/txnType/amount/narration); mobile now renders the recent-txn list instead of a generic alert
- [x] Bank List: `GET /txn/aeps/banks` → InstantPay `GET /fi/aeps/banks` (dummy has real IINs); mobile static IINs replaced with real NPCI IINs + live override by name
- [x] Merchant Onboarding (Signup Min-KYC): `POST /api/onboarding/instantpay` → InstantPay `POST /user/outlet/signup/minKyc`; saves `instantpay_outlet_id` + outlet lat/long; `GET /api/onboarding/instantpay/status`; dummy mode → mock outletId
- [x] Biometric eKYC Status: `POST /api/onboarding/instantpay/bio-kyc-status` (spKey DMI/WAP) → InstantPay `/user/outlet/signup/biometricKycStatus`; returns action + status (poll till APPROVED) + `pidOptionWadh`/`referenceKey` for the bio-KYC capture
- [x] Biometric KYC submit: `POST /api/onboarding/instantpay/bio-kyc` (referenceKey + PID XML, optional aadhaarNumber) → InstantPay `/user/outlet/signup/biometricKyc`; capture needs PidOptions `wadh` from status API (client wadh support pending with onboarding UI)
- [x] Mobile change: `POST /api/onboarding/instantpay/mobile-change` (initiate → OTPs to both numbers + `otpReferenceID`/`hash`) + `POST .../mobile-change/verify` (otp + otpReferenceID + hash) → InstantPay `/user/outlet/v2/mobileUpdate[Verify]`
- [x] Merchant List (admin): `POST /api/onboarding/instantpay/merchants` (pagination + filters) → InstantPay `/user/outlet/list`; `wapStatus` = bank AePS enablement; dummy mode lists locally-onboarded retailers
- [x] Transaction Status: recheck now hits `POST /reports/txnStatus` (client-level — outlet placeholder removed); externalRef = our txnRef on every AEPS money call; status from `transactionStatusCode` (TXN/TUP/other), outer non-TXN treated as pending

## Remaining (next chats)

- [ ] InstantPay DMT rails (remitter profile/registration → beneficiary → transfer → status)
- [ ] InstantPay BBPS / recharge rails
- [ ] Onboarding UI (mobile/web) — backend API ready
- [ ] Customer photo / CCTV object storage for cash evidence
- [ ] Seed `provider_services` for non-mode-routed rails

## Cross-platform rule

- InstantPay feature ko **done** tab hi mark karo jab:
  - backend contract wired ho,
  - `apps/agent-portal` entrypoint + usable flow ho,
  - `apps/mobile` entrypoint + usable flow ho,
  - ya missing platform doc mein explicit exception ke saath marked ho.
- Audit source of truth: `InstantPay/PARITY.md`

## Deploy env

### Testing (current)

```env
AEPS_PROVIDER_MODE=dummy
ALLOW_STUB_PROVIDERS=true
ALLOW_BIOMETRIC_REPLAY=false
```

### InstantPay sandbox

```env
AEPS_PROVIDER_MODE=instantpay_sandbox
ALLOW_STUB_PROVIDERS=false
ALLOW_BIOMETRIC_REPLAY=false
INSTANTPAY_CLIENT_ID=...
INSTANTPAY_CLIENT_SECRET=...
INSTANTPAY_AES_KEY=...   # 32 utf8 chars OR base64 of 32 bytes
INSTANTPAY_AUTH_CODE=1
# optional:
# INSTANTPAY_BASE_URL=https://api.instantpay.in
```

### Production live

```env
AEPS_PROVIDER_MODE=instantpay_live
ALLOW_STUB_PROVIDERS=false
ALLOW_BIOMETRIC_REPLAY=false
INSTANTPAY_CLIENT_ID=...
INSTANTPAY_CLIENT_SECRET=...
INSTANTPAY_AES_KEY=...
INSTANTPAY_AUTH_CODE=1
```

Retailer rows need `instantpay_outlet_id`, `outlet_latitude`, `outlet_longitude` before live AEPS.

## Read ONLY these files
| Path | Why |
|------|-----|
| `apps/backend/src/modules/providers/types.ts` | Adapter contract |
| `apps/backend/src/modules/providers/provider.registry.ts` | Register `instantpay` |
| `apps/backend/src/modules/providers/adapters/instantpay.adapter.ts` | HTTP adapter |
| `apps/backend/src/modules/providers/provider.router.ts` | Mode routing + stub guard |
| `apps/backend/src/config/env.ts` | AEPS_PROVIDER_MODE + INSTANTPAY_* |

## Docs
- https://developers.instantpay.in/reference/overview
- https://developers.instantpay.in/reference/financial-inclusion-aeps-outlet-login
