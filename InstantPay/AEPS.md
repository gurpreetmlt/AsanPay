# InstantMart — AEPS Implementation (InstantPay)

> Ek jagah full picture: AEPS kaise bana hai, kya done hai, kya pending hai, aur API provider (InstantPay) se kya-kya chahiye. Kisi bhi agent/chat me kaam shuru karne se pehle YE padho.

**Provider:** InstantPay (Financial Inclusion — AEPS)
**Rail status:** AEPS live-ready (dummy + InstantPay dono). DMT / BBPS / Recharge abhi InstantPay pe wired nahi.
**Last updated:** 2026-07-18

---

## 1. Architecture (ek line me)

Ek hi UI/API contract, peeche **provider adapter** swap hota hai. `AEPS_PROVIDER_MODE` env se decide hota hai ki request dummy (mock) adapter pe jaaye ya real InstantPay pe. **Silent fallback nahi** — sandbox/live me creds missing ho to server startup pe fail (fail-closed).

```
Client (mobile/web)
      │  same REST contract
      ▼
Backend txn/auth controllers
      │  resolveProvidersForService()  ── AEPS_PROVIDER_MODE ──►  eko (mock)  |  instantpay
      ▼
ProviderAdapter  (aeps* methods)
      ▼
InstantPay HTTP  (/fi/aeps/*)   ← sirf instantpay_sandbox / instantpay_live me
```

### Modes (`AEPS_PROVIDER_MODE`)
| Mode | Adapter | InstantPay HTTP? | Kab use |
|------|---------|------------------|---------|
| `dummy` | eko mock | Nahi | Testing — real RD PID + KYC phir bhi enforce hote hain |
| `instantpay_sandbox` | InstantPay | Haan (sandbox creds) | UAT |
| `instantpay_live` | InstantPay | Haan (prod creds) | Production |

---

## 2. Service-wise status

Har row: humara backend endpoint → InstantPay endpoint. Sab AEPS services `AEPS_PROVIDER_MODE` follow karte hain.

| # | Service | Backend endpoint | InstantPay endpoint | Status |
|---|---------|------------------|---------------------|--------|
| 1 | Daily 2FA (Outlet Login) | `POST /api/auth/agent-auth` | `POST /fi/aeps/outletLogin` | ✅ Done |
| 2 | 2FA status check | `GET /api/auth/agent-auth/status` | `POST /fi/aeps/outletLoginStatus` | ✅ Done |
| 3 | Bank List | `GET /api/txn/aeps/banks` | `GET /fi/aeps/banks` | ✅ Done |
| 4 | Balance Enquiry | `POST /api/txn/aeps/balance-enquiry` | `POST /fi/aeps/balanceEnquiry` | ✅ Done |
| 5 | Mini Statement | `POST /api/txn/aeps/mini-statement` | `POST /fi/aeps/miniStatement` | ✅ Done |
| 6 | Transaction OTP (₹5k+ withdraw) | `POST /api/txn/aeps/withdraw/otp` | `POST /fi/aeps/transactionOtp` | ✅ Done |
| 7 | Cash Withdrawal | `POST /api/txn/aeps/withdraw` | `POST /fi/aeps/cashWithdrawal` | ✅ Done |
| 8 | Cash Deposit | `POST /api/txn/aeps/deposit` | `POST /fi/aeps/cashDeposit` | ✅ Done |
| 9 | Aadhaar Pay | `POST /api/txn/aeps/aadhaar-pay` | `POST /fi/aeps/aadhaarPay` | ✅ Backend done (UI adhura) |
| 10 | Txn status recheck | `POST /api/txn/:txnRef/recheck` | `POST /reports/txnStatus` | ✅ Done (client-level reports API) |

### Details per service

**1. Daily 2FA (Outlet Login)**
Retailer din me ek baar Aadhaar + fingerprint se verify karta hai, tabhi AEPS/Aadhaar Pay allow. InstantPay `actcode` semantics: sirf `LOGGEDIN` = success. `LOGINREQUIRED` (statuscode TXN hote hue bhi) = biometric mismatch/retry, **chargeable** — kabhi unlock mat karo ispe. Mobile + agent-web dono me daily 2FA screen hai.

**2. 2FA status**
InstantPay mode me `outletLoginStatus` check hota hai; `LOGGEDIN` ho to local `lastAgentAuthAt` sync ho jata hai. `isFaceAuthAvailable`, `aadhaarLastFour`, `isTxnBioLoginRequired` bhi read hote hain.

**3. Bank List**
Real NPCI IINs. Dummy me 12 major banks hardcoded (real IINs). Live me `GET /fi/aeps/banks` se aata hai. Mobile static list ke IINs live list se name-match karke override hote hain.

**4/5. Balance Enquiry / Mini Statement**
Money move nahi (`direction: none`). Mini statement `miniStatement[]` (date/txnType/amount/narration) parse hoke mobile pe list dikhti hai.

**6. Transaction OTP**
Sirf **₹5,000 se upar** cash withdrawal ke liye. Flow: OTP request → `referenceKey` milta hai → customer ke mobile pe OTP → **OTP RD service ke PID ke andar jaata hai** (`PidOptions Opts otp="..."`), JSON body me nahi. `referenceKey` withdraw body me jaata hai. Dummy me mock OTP (koi bhi 4-8 digit chalega).

**7. Cash Withdrawal**
`direction: credit` — retailer cash deta hai, success ke baad AEPS wallet me reimbursement. Success pe auto cash receipt (chargeback evidence). Note: 2FA ke 3 min ke andar hona chahiye (InstantPay rule).

**8. Cash Deposit**
`direction: debit` — retailer customer se cash leta hai, uska AEPS wallet up-front debit hota hai; provider fail ho to auto-reversal. Max ₹50,000.

**9. Aadhaar Pay**
Backend + adapter done, `direction: credit`. Mobile/web UI abhi adhura.

**10. Recheck**
Pending txns ke liye status check — InstantPay `POST /reports/txnStatus` (client-level, koi outlet header nahi). Request: `transactionDate` (IST YYYY-MM-DD) + `externalRef` (= humara txnRef, ab har money call me bheja jaata hai) + `source: ORDER` (sirf AEPS). Two-level status: outer `statuscode` = query ka result; asli txn state `transactionStatusCode` me (TXN success / TUP pending / baaki failed; outer non-TXN = pending treat karo, settle mat karo). Provider rules: txn ke ≥30 min baad, same txn pe ≥4 ghante gap, sirf last 30 days, roz 11:30 PM–00:30 AM API maintenance.

---

## 3. Compliance & security (done)

- **Geofence:** merchant registered lat/long se `AEPS_GEOFENCE_KM` (default 3km) ke bahar txn block.
- **Biometric mismatch → EDD:** `AEPS_BIO_MISMATCH_LIMIT` (default 2) consecutive mismatch pe merchant soft-block + Extended Due Diligence flag.
- **Dormancy:** `AEPS_DORMANCY_DAYS` (default 180) tak koi AEPS activity nahi → dormant treat.
- **Biometric replay guard:** ek hi finger scan dobara use nahi ho sakta (testing me `ALLOW_BIOMETRIC_REPLAY=true` se bypass).
- **Cash receipt register:** har successful withdrawal auto-record (audit/chargeback defense).
- **Aadhaar encryption:** AES-256-CBC (`INSTANTPAY_AES_KEY`) se `encryptedAadhaar` banta hai.
- **KYC gate:** retailer KYC complete hona zaroori AEPS se pehle.

---

## 4. Environment variables

### Testing (current)
```env
AEPS_PROVIDER_MODE=dummy
ALLOW_STUB_PROVIDERS=true
ALLOW_BIOMETRIC_REPLAY=true   # LAUNCH se pehle false karo
```

### InstantPay sandbox
```env
AEPS_PROVIDER_MODE=instantpay_sandbox
ALLOW_STUB_PROVIDERS=false
ALLOW_BIOMETRIC_REPLAY=false
INSTANTPAY_CLIENT_ID=...
INSTANTPAY_CLIENT_SECRET=...
INSTANTPAY_AES_KEY=...          # 32 utf8 chars OR base64 of 32 bytes
INSTANTPAY_AUTH_CODE=1
# INSTANTPAY_BASE_URL=https://api.instantpay.in   # optional override
```

### Production (live)
```env
AEPS_PROVIDER_MODE=instantpay_live
ALLOW_STUB_PROVIDERS=false
ALLOW_BIOMETRIC_REPLAY=false
INSTANTPAY_CLIENT_ID=...
INSTANTPAY_CLIENT_SECRET=...
INSTANTPAY_AES_KEY=...
INSTANTPAY_AUTH_CODE=1
```

### Compliance tuning (optional, defaults sane)
```env
AEPS_GEOFENCE_KM=3
AEPS_DORMANCY_DAYS=180
AEPS_BIO_MISMATCH_LIMIT=2
```

**Zaroori:** live/sandbox se pehle har retailer row me `instantpay_outlet_id`, `outlet_latitude`, `outlet_longitude` set hona chahiye (warna `INSTANTPAY_OUTLET_REQUIRED` / `AEPS_GEO_REQUIRED` error).

---

## 5. API provider (InstantPay) se kya chahiye

### One-time (account level)
- [ ] **Client ID** (`X-Ipay-Client-Id`)
- [ ] **Client Secret** (`X-Ipay-Client-Secret`)
- [ ] **Auth Code** — docs me fixed `1` (`X-Ipay-Auth-Code`)
- [ ] **AES key** Aadhaar encryption ke liye (`biometricData.encryptedAadhaar` — AES-256-CBC)
- [ ] **Sandbox credentials** (UAT ke liye alag set)
- [ ] **Production credentials** (go-live ke liye)
- [ ] **Base URL** confirm (`https://api.instantpay.in`)
- [ ] **Server IP whitelisting** — Coolify/prod server ka outbound IP InstantPay ko dena pad sakta hai
- [ ] **Endpoint IP rule** — `X-Ipay-Endpoint-Ip` = end customer IP (mandatory header). Confirm exact expectation.

### Per-merchant (onboarding)
- [x] **Merchant onboarding API** — Signup Min-KYC wired: `POST /api/onboarding/instantpay` → InstantPay `POST /user/outlet/signup/minKyc`. Success pe `instantpay_outlet_id` + outlet lat/long auto-save. Status: `GET /api/onboarding/instantpay/status`. Dummy mode me mock outletId milta hai.
- [x] **Biometric eKYC status** — `POST /api/onboarding/instantpay/bio-kyc-status` body `{"spKey":"WAP"}` (AePS) ya `"DMI"` (DMT) → InstantPay `/user/outlet/signup/biometricKycStatus`. `action: ACTION-REQUIRED` → bio-KYC capture karna hai (`pidOptionWadh` + `referenceKey` isi response me). Status PENDING/APPROVAL_PENDING → 30-min interval pe poll; APPROVED → rail transact-ready.
- [x] **Biometric KYC submit** — `POST /api/onboarding/instantpay/bio-kyc` body `{referenceKey, biometricPayload (PID XML), aadhaarNumber?, latitude?, longitude?}` → InstantPay `/user/outlet/signup/biometricKyc`. `aadhaarNumber` sirf tab mandatory jab status API ka `outletAadhaarNumber` empty tha. Capture RD-service se `pidOptionWadh` ke saath hona chahiye (PidOptions `wadh` attribute — client support onboarding UI ke saath aayega). Success ke baad status API poll karo till APPROVED.
- [x] **Mobile change initiate** — `POST /api/onboarding/instantpay/mobile-change` body `{newMobileNumber, aadhaarNumber, existingMobileNumber?, latitude?, longitude?}` → InstantPay `/user/outlet/v2/mobileUpdate`. OTP dono numbers (existing + new) pe jaata hai; response me `otpReferenceID` + `hash` milta hai. Sirf InstantPay profile update hota hai — humara `users.mobile` nahi.
- [x] **Mobile change verify** — `POST /api/onboarding/instantpay/mobile-change/verify` body `{otpReferenceID, otp, hash}` → InstantPay `/user/outlet/v2/mobileUpdateVerify`. Success = "Mobile Number successfully changed".
- [x] **Merchant List (admin only)** — `POST /api/onboarding/instantpay/merchants` body `{pageNumber, recordsPerPage, outletId?, mobile?, pan?}` → InstantPay `/user/outlet/list`. `wapStatus: true` = outlet bank-side AEPS-enabled; false/null = bank end pe pending. Dummy mode locally onboarded retailers ki list deta hai.
- [ ] Onboarding ke liye merchant ka PAN-matching name/DOB aur Aadhaar-matching mobile/address chahiye (InstantPay mismatch pe reject karta hai)

### Service-specific clarifications chahiye
- [x] **Transaction status** — `/reports/txnStatus` docs mil gaye aur wired (outlet header ki zaroorat hi nahi)
- [ ] **Face auth** availability + flow (response me `isFaceAuthAvailable` aata hai)
- [ ] **Onus vs Ofus** (`isOnusTxn`) — commission/settlement pe kya farak
- [ ] **DMT / BBPS / Recharge** endpoints + docs (abhi sirf AEPS wired)
- [ ] **Webhooks/callbacks** — async txn confirmation ka koi callback hai?
- [ ] **Settlement / commission** structure per service

---

## 6. Pending (next chats)

- [ ] Aadhaar Pay ka mobile/web UI complete karo (backend ready)
- [x] Merchant onboarding API → `instantpay_outlet_id` + outlet geo auto-populate (`POST /api/onboarding/instantpay`)
- [ ] Onboarding UI (mobile/web) — abhi sirf backend API hai
- [x] Recheck ab `POST /reports/txnStatus` use karta hai (client-level — outlet placeholder khatam)
- [ ] Web AEPS withdraw/deposit backend se wire karo (abhi sirf capture hota hai, submit nahi)
- [ ] InstantPay DMT / BBPS / Recharge rails
- [ ] Customer photo / CCTV object storage (cash evidence — compliance)
- [ ] Face auth flow (agar InstantPay support karta hai)
- [ ] `provider_services` seed non-mode-routed rails ke liye
- [ ] Launch se pehle: `ALLOW_BIOMETRIC_REPLAY=false`, `ALLOW_STUB_PROVIDERS=false`

---

## 7. Key files (jaha code hai)

| Area | Path |
|------|------|
| Mode config + fail-closed | `apps/backend/src/config/env.ts` |
| Mode routing | `apps/backend/src/modules/providers/aepsMode.ts`, `provider.router.ts` |
| InstantPay adapter | `apps/backend/src/modules/providers/adapters/instantpay.adapter.ts` |
| Mock adapter | `apps/backend/src/modules/providers/adapters/mock.base.ts` |
| InstantPay HTTP client | `apps/backend/src/modules/providers/instantpay/client.ts` |
| Aadhaar encryption | `apps/backend/src/modules/providers/instantpay/crypto.ts` |
| PID XML parse | `apps/backend/src/modules/providers/instantpay/pidXml.ts` |
| Adapter contract/types | `apps/backend/src/modules/providers/types.ts` |
| Txn controller/routes | `apps/backend/src/modules/transactions/txn.controller.ts`, `txn.routes.ts` |
| Compliance gates | `apps/backend/src/modules/aeps/compliance.ts` |
| Daily 2FA | `apps/backend/src/modules/auth/agentAuth.ts` |
| Biometric replay guard | `apps/backend/src/modules/transactions/biometricReplay.ts` |
| DB: users AEPS cols | `apps/backend/src/db/postgres/schema/users.ts` |
| DB: compliance tables | `apps/backend/src/db/postgres/schema/aepsCompliance.ts` |
| Migrations | `0013_aeps_compliance.sql`, `0014_aeps_cash_deposit.sql` |
| Mobile AEPS screen | `apps/asanpay-mobile-app/src/screens/retailer/AepsScreen.tsx` |
| Mobile RD capture | `apps/asanpay-mobile-app/src/lib/rdServiceFingerprint.ts` |
| Web AEPS page | `apps/web/app/aeps/page.tsx` |
| Web RD capture | `apps/web/lib/rdServiceFingerprint.ts` |
| Task tracker | `docs/TASKS/21-instantpay-adapter.md` |

---

## 8. Testing (dummy mode) cheat-sheet

- `AEPS_PROVIDER_MODE=dummy` + `ALLOW_STUB_PROVIDERS=true` + `ALLOW_BIOMETRIC_REPLAY=true`.
- Real RD device + real PID capture phir bhi chahiye (KYC + biometric enforce hote hain).
- Mock amount decimals se failure paths test karo:
  - `*.99` → provider declines (failed)
  - `*.98` → timeout (pending, recheck se resolve)
  - baaki → success
- ₹5,000+ withdraw pe OTP step aata hai (mock OTP koi bhi 4-8 digit).
