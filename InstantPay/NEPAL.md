# InstantPay — Remittance (Nepal)

> Nepal Money Transfer (cross-border remittance) InstantPay pe kaise banega. Architecture DMT/AEPS jaisi. Onboarding: [`ONBOARDING.md`](ONBOARDING.md). Domestic DMT: [`DMT.md`](DMT.md).

**Provider:** InstantPay (Remittance — Nepal)
**Status:** ✅ Backend APIs done · ✅ Agent Web portal (`/nepal`). Remaining: remitter count limits + mobile.
**Last updated:** 2026-07-20

### Service overview (InstantPay)
BC (Business Correspondent) agent-assisted **Nepal** money transfer, physical outlet pe.

**Limits (hard — enforce karna hai):**
| Limit | Value |
|-------|-------|
| Per transaction | ₹50,000 |
| Per remitter / day | **3** transactions |
| Per remitter / month | **5** transactions |
| Per remitter / year | **6** transactions |

> Day / month / year caps InstantPay + backend dono pe enforce; client pe pre-check UX ke liye.

---

## 1. Architecture (ek line me)

Same provider-adapter pattern as DMT. Shared InstantPay creds + outlet headers. `AEPS_PROVIDER_MODE` (ya shared remittance mode) se dummy vs InstantPay.

```
Retailer (web / mobile)
      │  REST contract
      ▼
Backend  /api/txn/nepal/*   (proposed)
      │  provider mode ──►  mock  |  instantpay
      ▼
ProviderAdapter  (nepal* methods)
      ▼
InstantPay HTTP  (/fi/remit/... nepal paths — TBD from docs)
```

### Shared headers (all Nepal remittance APIs)

| Name | Type | Description | M/O | By InstantPay |
|------|------|-------------|-----|---------------|
| `X-Ipay-Auth-Code` | String | Auth Code — `1` (fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client ID | M | Y |
| `X-Ipay-Client-Secret` | String | Unique secret key | M | Y |
| `X-Ipay-Outlet-Id` | String | Merchant unique ID | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP | M | N (client/outlet IP) |

Ye headers pehle se InstantPay client (`instantPayPost` / outlet context) mein wired hain — Nepal APIs same client reuse karengi.

### Modes — AEPS/DMT ke saath shared
| Mode | Behaviour |
|------|-----------|
| `dummy` | Mock success, no InstantPay call |
| `instantpay_sandbox` | Real InstantPay sandbox |
| `instantpay_live` | Production |

---

## 2. Remittance flow

```
1. Merchant onboarded     (bio-KYC — spKey for Nepal TBD; DMT uses DMI)
      ▼
2. Static Data            (dropdowns: Gender, IDType, PaymentMode, …) ✅
      ▼
3. Payment Location List  (CASHPAY / ACCOUNTPAY pickup points) ✅
      ▼
4. State & District       (India / Nepal address dropdowns) ✅
      ▼
5. Outlet Status          (register / eKYC / OTP gate) ✅
      ▼
6. Outlet Registration    (OTP + CSP profile form) ✅
      ▼
7. Outlet eKYC Initiate   (bank redirectUrl) ✅
      ▼
8. Outlet eKYC Status     (poll after redirect) ✅
      ▼
9. Outlet eKYC Process    (RD biometric submit) ✅
      ▼
10. Remitter Profile       (lookup by mobile) ✅
      ▼
11. Send OTP               (Agent / Remitter / FundTransfer) ✅
      ▼
12. Remitter Registration  (create sender + OTP) ✅
      ▼
13. Remitter eKYC Initiate (bank redirectUrl) ✅
      ▼
14. Remitter eKYC Status   (poll after redirect) ✅
      ▼
15. Remitter eKYC Process  (RD biometric submit) ✅
      ▼
16. Remitter Update        (income / occupation codes) ✅
      ▼
17. Beneficiary Registration ✅
      ▼
18. Service Charge         (INR↔NPR quote) ✅
      ▼
19. Fund Transfer          (OTP + wallet debit) ✅
      ▼
20. Fetch Txn Status       (by ipayId) ✅
```

> **No Nepal refund APIs** in InstantPay Remittance (Nepal) docs. Domestic DMT refund (`/domestic/v2/transactionRefund*`) is separate — see [`DMT.md`](DMT.md).

---

## 3. Service-wise status

| # | Service | Backend endpoint | InstantPay endpoint | Status |
|---|---------|------------------|---------------------|--------|
| 0 | Headers / client reuse | — | shared InstantPay client | ✅ Ready (shared) |
| 1 | Static Data | `POST /api/txn/nepal/static-data` | `GET /fi/remit/out/nepal/staticData` | ✅ Done |
| 2 | Payment Location List | `POST /api/txn/nepal/payment-locations` | `GET /fi/remit/out/nepal/paymentLocationList` | ✅ Done |
| 3 | State & District | `POST /api/txn/nepal/state-district` | `GET /fi/remit/out/nepal/stateDistrict` | ✅ Done |
| 4 | Outlet Status | `POST /api/txn/nepal/outlet-status` | `GET /fi/remit/out/nepal/outletStatus` | ✅ Done |
| 5 | Outlet Registration | `POST /api/txn/nepal/outlet-registration` | `POST /fi/remit/out/nepal/outletRegistration` | ✅ Done |
| 6 | Outlet eKYC Initiate | `POST /api/txn/nepal/outlet-ekyc/initiate` | `GET /fi/remit/out/nepal/outletEkycInitiate` | ✅ Done |
| 7 | Outlet eKYC Status | `POST /api/txn/nepal/outlet-ekyc/status` | `GET /fi/remit/out/nepal/outletEkycInitiateStatus` | ✅ Done |
| 8 | Outlet eKYC Process | `POST /api/txn/nepal/outlet-ekyc/process` | `POST /fi/remit/out/nepal/outletEkycProcess` | ✅ Done |
| 9 | Remitter Details | `POST /api/txn/nepal/remitter/profile` | `GET /fi/remit/out/nepal/remitterProfile` | ✅ Done |
| 10 | Send OTP | `POST /api/txn/nepal/otp` | `POST /fi/remit/out/nepal/otpRequest` | ✅ Done |
| 11 | Remitter Registration | `POST /api/txn/nepal/remitter/register` | `POST /fi/remit/out/nepal/remitterRegistration` | ✅ Done |
| 12 | Remitter eKYC Initiate | `POST /api/txn/nepal/remitter/ekyc/initiate` | `GET /fi/remit/out/nepal/remitterEkycInitiate` | ✅ Done |
| 13 | Remitter eKYC Status | `POST /api/txn/nepal/remitter/ekyc/status` | `GET /fi/remit/out/nepal/remitterEkycInitiateStatus` | ✅ Done |
| 14 | Remitter eKYC Process | `POST /api/txn/nepal/remitter/ekyc/process` | `POST /fi/remit/out/nepal/remitterEkycProcess` | ✅ Done |
| 15 | Remitter Update | `POST /api/txn/nepal/remitter/update` | `POST /fi/remit/out/nepal/remitterUpdate` | ✅ Done |
| 16 | Beneficiary Registration | `POST /api/txn/nepal/beneficiary/register` | `POST /fi/remit/out/nepal/beneficiaryRegistration` | ✅ Done |
| 17 | Service Charge | `POST /api/txn/nepal/service-charge` | `GET /fi/remit/out/nepal/serviceCharge` | ✅ Done |
| 18 | Fund Transfer | `POST /api/txn/nepal/fund-transfer` | `POST /fi/remit/out/nepal/fundTransfer` | ✅ Done |
| 19 | Fetch Txn Status | `POST /api/txn/nepal/txn-status` | `POST /fi/remit/out/nepal/fetchTransactionStatus` | ✅ Done |
| — | Refund | — | — | ❌ N/A — not in InstantPay Nepal sidebar (use DMT domestic refund if needed) |

### 1. Static Data — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/staticData` with JSON body `{ type }` (unusual GET+body — client supports it).
- `type` enum: `Gender` | `Nationality` | `IDType` | `IncomeSource` | `Relationship` | `PaymentMode` | `RemittanceReason`.
- Backend: `POST /api/txn/nepal/static-data` `{ type }` → `{ items: [{ label, value }], type }`.
- Success = `statuscode: "TXN"`; `data` = array of `{ label, value }` (sample IDType: Aadhaar, Driving License, Nepalese Citizenship/Passport).
- Service gate skipped (`nepal_static_data`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: mock lists per type (IDType matches InstantPay sample).

### 2. Payment Location List — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/paymentLocationList` with JSON body `{ type, country, state?, district? }`.
- `type`: `ACCOUNTPAY` | `CASHPAY`. `country` default `NEPAL` (sample casing). `state` / `district` optional filters (empty string = all).
- Backend: `POST /api/txn/nepal/payment-locations` `{ type, country?, state?, district? }` → `{ locations: NepalPaymentLocation[] }`.
- Location fields: `locationId`, `locationName`, `bankBranchId`, `bankName`, `branchName`, `branchCode`, `routingCode`, `country`, `address`, `state`, `district`, `city`, `phoneNumber`.
- Service gate skipped (`nepal_payment_locations`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: CASHPAY → Prabhu-style cash pickup; ACCOUNTPAY → mock bank branch.

### 3. State & District — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/stateDistrict` with JSON body `{ country }` (sample: `"India"`).
- Backend: `POST /api/txn/nepal/state-district` `{ country }` → `{ items: [{ state, district, stateCode }] }`.
- Flat list (one row per district); UI groups by `state` / `stateCode` for cascading dropdowns.
- Service gate skipped (`nepal_state_district`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: small India set (HR/DL/UP/MH/KA) or Nepal set if country contains `nepal`.

### 4. Outlet Status — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/outletStatus` (headers only). Optional body `{ checkOtpStatus: 1 }` when previous `actcode` was `OTPVERFCTN`.
- Backend: `POST /api/txn/nepal/outlet-status` `{ checkOtpStatus? }` → `{ outlet: { statuscode, actcode, message, cspStatus, cspCode, ready } }`.
- **actcode flow:**
  - `OUTLETREGISTER` → call Outlet Registration
  - `OUTLETEKYC` → Outlet eKYC Initiate → Status → Biometric
  - `OTPVERFCTN` → call Outlet Status again with `checkOtpStatus: true`
  - `TXN` + `cspStatus: APPROVED` → `ready: true` (can remittance)
- Blocking actcodes map to `status: "pending"` (not hard fail) so UI can branch.
- Service gate skipped (`nepal_outlet_status`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always `ready: true` + mock `cspCode`.

### 5. Outlet Registration — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/outletRegistration`. Body: OTP (`otpReference`, `otp`) + CSP profile (gender, category, education, shop hours, device, connectivity, bank account, …).
- Backend: `POST /api/txn/nepal/outlet-registration` (same fields) → `{ registration: { statuscode, actcode, message, needsEkyc } }`.
- Sample success: `statuscode: TUP`, `actcode: OUTLETEKYC` → `needsEkyc: true` (next: eKYC Initiate → Status → Biometric).
- `alternateOccupationDescription` required when `alternateOccupationType === "Other"`.
- If InstantPay says *re-onboard the outlet* → Merchant Onboarding API pehle (see [`ONBOARDING.md`](ONBOARDING.md)).
- Service gate skipped (`nepal_outlet_registration`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always `needsEkyc: true`.
- **Note:** `otpReference` from **Send OTP** (`operation: AgentRegistration`) — see §10.

### 6. Outlet eKYC Initiate — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/outletEkycInitiate` (headers only).
- Backend: `POST /api/txn/nepal/outlet-ekyc/initiate` (no body) → `{ ekyc: { statuscode, actcode, message, redirectUrl } }`.
- UI: `redirectUrl` bank/UIDAI portal pe open karo (browser / WebView). Complete hone ke baad eKYC Status / Biometric steps (docs pending).
- Success = `statuscode: "TXN"` + non-empty `redirectUrl`.
- Service gate skipped (`nepal_outlet_ekyc_initiate`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: mock `https://example.com/mock-nepal-ekyc?ref=MOCK`.

### 7. Outlet eKYC Initiate Status — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/outletEkycInitiateStatus?referenceKey=…` (`referenceKey` optional).
- Backend: `POST /api/txn/nepal/outlet-ekyc/status` `{ referenceKey? }` → `{ ekycStatus: { statuscode, actcode, message, ready, data } }`.
- Sample success: `statuscode: "TXN"`, `data: null` → `ready: true`. Poll after retailer completes bank redirect.
- Docs note: `referenceKey` “from Initiate KYC for Remitter API” — confirm if outlet flow needs it or can call without.
- Service gate skipped (`nepal_outlet_ekyc_status`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always `ready: true`.

### 8. Outlet eKYC Process — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/outletEkycProcess` body `{ biometricData: { rdsId, rdsVer, ci, dc, dpId, hmac, mc, mi, pidData, sessionKey } }`.
- Backend: `POST /api/txn/nepal/outlet-ekyc/process` — prefer `{ biometricPayload }` (PidData XML); adapter parses via `parsePidDataXml` and maps to InstantPay shape (`sessionKey`, not DMT’s `Skey`). Or pass structured `biometricData`.
- Success = `statuscode: "TXN"`. Then re-check Outlet Status for `ready` / `OTPVERFCTN`.
- **Wadh (capture):** docs give `TF/lfPuh1n4ZY1xizYpqikIBm+gv65r51MFNek4uwNw=` — use in RD PidOptions `wadh` when capturing for this step.
- Service gate skipped (`nepal_outlet_ekyc_process`); routed via `AEPS_PROVIDER_MODE`. Biometric not logged in provider context.
- Dummy: always success.

### 9. Remitter Details — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/remitterProfile` with JSON body `{ mobile }` (GET+body).
- Backend: `POST /api/txn/nepal/remitter/profile` `{ customerMobile }` → `{ profile: NepalRemitterProfile | null }`.
- Profile fields: id, mobile, name/address, KYC flags (`status`, `eKycStatus`, `onboardingStatus`), `ids[]`, `transactionCount` (day/month/year — for limit UI), `beneficiaries[]`.
- TXN + data = profile; RNF/SNR / “not found” → `profile: null` (start registration). Other codes map via InstantPay status.
- Service gate skipped (`nepal_remitter_profile`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: sample Verified remitter; mobile ending `0000` → `null`.

### 10. Send OTP — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/otpRequest`.
- Backend: `POST /api/txn/nepal/otp` → `{ otpReference }`.
- `operation`: `FundTransfer` | `RemitterRegistration` | `AgentRegistration`.
- Conditional body:
  - **FundTransfer** — `mobile`, `beneficiaryId`, `paymentMode` required; if `Account Deposit` → `bankBranchId` + `accountNumber`; `transferAmount` optional.
  - **RemitterRegistration** — `mobile` required; `paymentMode` optional.
  - **AgentRegistration** — `paymentMode` required (outlet onboarding OTP → feeds Outlet Registration `otpReference`).
- Sample paymentMode labels: `Cash Payment` | `Account Deposit` (also from Static Data `PaymentMode`).
- Success = `TXN` + `data.otpReference`.
- Service gate skipped (`nepal_otp_request`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: random UUID `otpReference`.

### 11. Remitter Registration — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/remitterRegistration`.
- Backend: `POST /api/txn/nepal/remitter/register` → `{ profile: NepalRemitterProfile }`.
- Flow: Remitter Profile null → Send OTP (`RemitterRegistration`) → this API with `otpReference` + `otp`.
- Body: name, gender, dob (`YYYY-MM-DD`), address/city/state/district, nationality, email (sample may be `""`), employer, idType/idNumber (+ optional expiry/place), incomeSource, remitterType (1–4), incomeSourceType (1–6), annualIncome (1–4), otpReference, otp, **mobile** (in InstantPay sample).
- Static Data: `Gender`, `IDType`, `IncomeSource`, `Nationality`; state/district from State & District.
- Success = `TXN` + remitter `data` (often `status: Unverified`, `approveComment` e.g. ID copy pending).
- Service gate skipped (`nepal_remitter_registration`); routed via `AEPS_PROVIDER_MODE`. OTP/idNumber not logged in provider context.
- Dummy: returns Unverified profile echoing request fields.

### 12. Remitter eKYC Initiate — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/remitterEkycInitiate?remitterId=…`.
- Backend: `POST /api/txn/nepal/remitter/ekyc/initiate` `{ remitterId }` → `{ ekyc: { statuscode, actcode, message, referenceKey, redirectUrl } }`.
- `remitterId` = profile/registration `id`. InstantPay `data.url` mapped to `redirectUrl` (also accepts `redirectUrl` if present).
- Success = `TXN` + non-empty `redirectUrl`. Save `referenceKey` for status / next eKYC steps.
- Service gate skipped (`nepal_remitter_ekyc_initiate`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: mock `referenceKey` + example redirect URL.

### 13. Remitter eKYC Initiate Status — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/remitterEkycInitiateStatus?remitterId=…&referenceKey=…` (both mandatory).
- Backend: `POST /api/txn/nepal/remitter/ekyc/status` `{ remitterId, referenceKey }` → `{ ekycStatus: { statuscode, actcode, message, ready, data } }`.
- Sample success: `statuscode: "TXN"`, `data: null` → `ready: true`. Poll after remitter completes bank redirect.
- Service gate skipped (`nepal_remitter_ekyc_status`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always `ready: true`.

### 14. Remitter eKYC Process — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/remitterEkycProcess` body `{ referenceKey, remitterId, biometricData: { rdsId, rdsVer, ci, dc, dpId, hmac, mc, mi, pidData, sessionKey } }`.
- Backend: `POST /api/txn/nepal/remitter/ekyc/process` — `{ remitterId, referenceKey }` + prefer `{ biometricPayload }` (PidData XML) or structured `biometricData` (`sessionKey`, not DMT `Skey`).
- Success = `statuscode: "TXN"`. Then re-fetch Remitter Profile for `eKycStatus` / approval.
- Curl sample sometimes shows `authenticationKey` — not in param table / OpenAPI; not sent unless InstantPay confirms.
- Service gate skipped (`nepal_remitter_ekyc_process`); routed via `AEPS_PROVIDER_MODE`. Biometric not logged in provider context.
- Dummy: always success.

### 15. Remitter Update — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/remitterUpdate` body `{ remitterId, remitterType, incomeSourceType, annualIncome }`.
- Backend: `POST /api/txn/nepal/remitter/update` → `{ update: { statuscode, actcode, message, success } }`.
- Codes same as registration: remitterType 1–4, incomeSourceType 1–6, annualIncome 1–4.
- Success = `TXN` (`data` often null).
- Service gate skipped (`nepal_remitter_update`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always success.

### 16. Beneficiary Registration — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/beneficiaryRegistration`.
- Backend: `POST /api/txn/nepal/beneficiary/register` → `{ profile, beneficiaryId }`.
- Body: `remitterMobile`, `name`, `gender`, `mobile` (Nepal, 8–15 digits), `relationship`, `address`, `paymentMode` (`Cash Payment` | `Account Deposit`); Account Deposit → `bankBranchId` + `accountNumber`.
- Static Data: `Gender`, `Relationship`, `PaymentMode`; branches from Payment Location List (`ACCOUNTPAY`).
- Success = `TXN` + remitter `data` including `beneficiaries[]`. `beneficiaryId` picked from matching new beneficiary (mobile/name) or last list item.
- Profile `beneficiaries` now typed as `NepalBeneficiary` (id, name, gender, relationship, address, mobile, paymentMode, bank*).
- Service gate skipped (`nepal_beneficiary_registration`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: returns sample remitter + one beneficiary.

### 17. Service Charge — ✅ Done
- InstantPay: `GET /fi/remit/out/nepal/serviceCharge` with JSON body (GET+body).
- Backend: `POST /api/txn/nepal/service-charge` → `{ quote: NepalServiceChargeQuote }`.
- Body: `country` (default `Nepal`), `paymentMode`, `remitterMobile`; `transferAmount` (INR) **or** `payoutAmount` (NPR) — InstantPay sample uses empty `transferAmount` + NPR payout; Account Deposit → `bankBranchId` + `beneficiaryId`.
- Quote fields: `transferAmount`, `serviceCharge`, `collectionAmount`, `collectionCurrency` (INR), `exchangeRate`, `payoutAmount`, `payoutCurrency` (NPR).
- Success = `TXN` + quote amounts.
- Service gate skipped (`nepal_service_charge`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: ≈1.6 FX + ₹40 charge.

### 18. Fund Transfer — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/fundTransfer`.
- Backend: `POST /api/txn/nepal/fund-transfer` — **money move** via `executeServiceTxn` (`serviceCode: MONEY_TRANSFER`, main wallet **debit**).
- Flow: Service Charge quote → Send OTP (`FundTransfer`) → this API with `otpReference` + `otp`.
- Body: `remitterMobile`, `beneficiaryId`, `transferAmount` (INR, max ₹50k), `remittanceReason` (Static Data), `otpReference`, `otp`, `latitude`, `longitude`, plus `idempotencyKey` + txn PIN/`txnAuth`.
- `externalRef` = our `txnRef` (InstantPay recheck); client Unique Id = idempotency key.
- Response: `{ txn, provider }` — provider data includes poolReferenceId, payout NPR, exchangeRate, beneficiaryName.
- Agent daily 2FA (`assertAgentAuthFresh`) + txn auth required. Rate-limited (`walletTxnLimiter`).
- Routed via `AEPS_PROVIDER_MODE` (`MONEY_TRANSFER` + `nepal_fund_transfer` in AEPS set). OTP redacted in provider logs.
- Day/month/year remitter count caps — still TODO (InstantPay + local counters).
- Dummy: mock FX 1.6 + success/fail via amount decimals (`.99` / `.98`).

### 19. Fetch Transaction Status — ✅ Done
- InstantPay: `POST /fi/remit/out/nepal/fetchTransactionStatus` body `{ ipayId, latitude, longitude }` (OpenAPI says GET; samples use POST+body).
- Backend: `POST /api/txn/nepal/txn-status` → `{ txnStatus: { statuscode, actcode, message, ready, data } }`.
- `ipayId` = Fund Transfer `orderid` / `poolReferenceId`. `TXN` → `ready: true`; `TUP` → pending.
- Also: ledger recheck `POST /api/txn/:txnRef/recheck` still uses InstantPay `/reports/txnStatus` via `externalRef` (= our txnRef).
- Service gate skipped (`nepal_fetch_txn_status`); routed via `AEPS_PROVIDER_MODE`.
- Dummy: always `ready: true`.

---

## 4. Wallet & accounting (plan)

- Transfer = **debit** retailer main wallet via `executeServiceTxn` (`MONEY_TRANSFER`) — ✅ wired on Fund Transfer.
- `externalRef` = hamara `txnRef` — recheck via `/reports/txnStatus`.
- Limit enforcement: ₹50k/txn ✅ validator; count caps (3/day, 5/month, 6/year) per remitter — still pending.
- Charges / FX: Service Charge quote before transfer; InstantPay pool debit may include charges beyond `transferAmount`.

---

## 5. Environment variables

AEPS/DMT ke saath **shared** — naya env expected nahi (confirm on first API wire).
Reference: `INSTANTPAY_CLIENT_ID/SECRET/AES_KEY/AUTH_CODE`, `AEPS_PROVIDER_MODE`.

---

## 6. Provider se kya chahiye / open questions

- [x] Full API list — InstantPay Nepal sidebar (19 APIs); **no refund** in Nepal docs
- [x] InstantPay path prefix — `/fi/remit/out/nepal/…` (no `/v2`)
- [ ] Onboarding `spKey` for Nepal rail (DMI alag hai ya naya key?)
- [x] Currency / FX — Service Charge quote (INR↔NPR) before transfer
- [x] Beneficiary = bank (`ACCOUNTPAY`) vs cash pickup (`CASHPAY`) via payment locations
- [x] OTP — `otpRequest` with `AgentRegistration` / `RemitterRegistration` / `FundTransfer`
- [ ] Webhooks / async confirmation (if InstantPay adds later)

---

## 7. Implementation checklist

- [x] Static Data (`/fi/remit/out/nepal/staticData`) — wired
- [x] Payment Location List (`/fi/remit/out/nepal/paymentLocationList`) — wired
- [x] State & District (`/fi/remit/out/nepal/stateDistrict`) — wired
- [x] Outlet Status (`/fi/remit/out/nepal/outletStatus`) — wired
- [x] Outlet Registration (`/fi/remit/out/nepal/outletRegistration`) — wired
- [x] Outlet eKYC Initiate (`/fi/remit/out/nepal/outletEkycInitiate`) — wired
- [x] Outlet eKYC Status (`/fi/remit/out/nepal/outletEkycInitiateStatus`) — wired
- [x] Outlet eKYC Process (`/fi/remit/out/nepal/outletEkycProcess`) — wired
- [x] Remitter Details (`/fi/remit/out/nepal/remitterProfile`) — wired
- [x] Send OTP (`/fi/remit/out/nepal/otpRequest`) — wired
- [x] Remitter Registration (`/fi/remit/out/nepal/remitterRegistration`) — wired
- [x] Remitter eKYC Initiate (`/fi/remit/out/nepal/remitterEkycInitiate`) — wired
- [x] Remitter eKYC Status (`/fi/remit/out/nepal/remitterEkycInitiateStatus`) — wired
- [x] Remitter eKYC Process (`/fi/remit/out/nepal/remitterEkycProcess`) — wired
- [x] Remitter Update (`/fi/remit/out/nepal/remitterUpdate`) — wired
- [x] Beneficiary Registration (`/fi/remit/out/nepal/beneficiaryRegistration`) — wired
- [x] Service Charge (`/fi/remit/out/nepal/serviceCharge`) — wired
- [x] Fund Transfer (`/fi/remit/out/nepal/fundTransfer`) — wired (wallet debit)
- [x] Fetch Transaction Status (`/fi/remit/out/nepal/fetchTransactionStatus`) — wired
- [x] Docs: InstantPay Nepal sidebar complete (no refund APIs)
- [x] Types + InstantPay adapter + mock (all Nepal ops)
- [x] Routes `/api/txn/nepal/*` + validators + controllers
- [x] Service gate skipped + `AEPS_PROVIDER_MODE` routing
- [x] Limit enforcement (txn amount ₹50k) — validator; day/month/year counts pending
- [x] Agent Web portal (`apps/web/app/nepal/page.tsx` — Outlet / Transfer / Status tabs, daily 2FA)
- [x] Mobile Nepal remittance screen (`apps/asanpay-mobile-app/src/screens/retailer/NepalScreen.tsx` — Outlet / Transfer / Status, OTP, quote, txn status)
- [x] Dashboard card `NEPAL_REMITTANCE` (Nepal Transfer) + AppShell sidebar link
- [ ] Coolify redeploy (backend/web) — no new env unless confirmed; run `seed:catalog` after deploy

---

## 8. Next step (user)

1. **Remitter count caps** — 3/day, 5/month, 6/year (backend enforce + UX from `transactionCount`)
2. Coolify backend + web redeploy + live smoke test
3. Merchant onboarding `spKey` confirm for Nepal rail
