# InstantPay — Merchant Onboarding Implementation

> Ek jagah full picture: merchant (retailer outlet) InstantPay pe kaise onboard hota hai, kya done hai, kya pending hai, aur provider se kya-kya chahiye. Kisi bhi agent/chat me onboarding pe kaam shuru karne se pehle YE padho. AEPS rails ke liye alag doc: [`AEPS.md`](AEPS.md).

**Provider:** InstantPay (Customer/Outlet Onboarding — eKYC)
**Status:** Backend wired. **Product decision (2026-07-20):** retailer primary onboarding = InstantPay Register Outlet (not Adhikari `/kyc`). Web Min-KYC UI: `/onboarding/outlet`. Web Bio-KYC: `/onboarding/bio-kyc` (RD capture with `wadh`). Mobile: Account → Register outlet + Biometric KYC modals.
**Last updated:** 2026-08-04

---

## 1. Architecture (ek line me)

Ek hi backend module (`modules/onboarding`), peeche `AEPS_PROVIDER_MODE` env se decide hota hai ki call dummy (mock) response de ya real InstantPay HTTP pe jaaye. Success pe retailer ka `instantpay_outlet_id` + outlet lat/long `users` row me save hota hai — wahi AEPS/DMT rails aage use karte hain. **Silent fallback nahi** — sandbox/live me creds missing ho to server startup pe fail (fail-closed, AEPS jaisa hi).

```
Retailer (mobile/web)
      │  same REST contract
      ▼
Backend  /api/onboarding/*  (onboarding.controller → onboarding.service)
      │  isInstantPayAepsMode()  ──►  dummy (mock outletId)  |  InstantPay HTTP
      ▼
InstantPay HTTP  (/user/outlet/*)   ← sirf instantpay_sandbox / instantpay_live me
      │
      ▼
users.instantpay_outlet_id + outlet_latitude + outlet_longitude  (save)
```

### Modes (`AEPS_PROVIDER_MODE`) — AEPS ke saath shared
| Mode | Behaviour | Kab use |
|------|-----------|---------|
| `dummy` | Mock `MOCK…` outletId, koi InstantPay call nahi | Testing — outlet id save hoke AEPS flow testable |
| `instantpay_sandbox` | Real InstantPay (sandbox creds) | UAT |
| `instantpay_live` | Real InstantPay (prod creds) | Production |

---

## 2. Service-wise status

Har row: humara backend endpoint → InstantPay endpoint. Sab `AEPS_PROVIDER_MODE` follow karte hain.

| # | Service | Backend endpoint | InstantPay endpoint | Role | Status |
|---|---------|------------------|---------------------|------|--------|
| 1 | Signup Min-KYC | `POST /api/onboarding/instantpay` | `POST /user/outlet/signup/minKyc` | retailer | ✅ Done |
| 2 | Onboarding status (local) | `GET /api/onboarding/instantpay/status` | — (local DB) | retailer | ✅ Done |
| 3 | Biometric eKYC status | `POST /api/onboarding/instantpay/bio-kyc-status` | `POST /user/outlet/signup/biometricKycStatus` | retailer | ✅ Done |
| 4 | Biometric KYC submit | `POST /api/onboarding/instantpay/bio-kyc` | `POST /user/outlet/signup/biometricKyc` | retailer | ✅ Web + mobile UI (RD `wadh`) |
| 5 | Mobile change initiate | `POST /api/onboarding/instantpay/mobile-change` | `POST /user/outlet/v2/mobileUpdate` | retailer | ✅ Done |
| 6 | Mobile change verify | `POST /api/onboarding/instantpay/mobile-change/verify` | `POST /user/outlet/v2/mobileUpdateVerify` | retailer | ✅ Done |
| 7 | Merchant list | `POST /api/onboarding/instantpay/merchants` | `POST /user/outlet/list` | admin | ✅ Done |

### Details per service

**1. Signup Min-KYC**
Retailer khud ko outlet ke roop me register/update karta hai. Body: `mobile` (10-digit, Aadhaar-linked — **required**), `name` (PAN-matching), `gender` (M/F/T), `pan`, `email`, `address {full, city, pincode}`, `aadhaarNumber` (12 digit — AES-256-CBC encrypt hoke `aadhaar` field me jaata hai), `dateOfBirth` (YYYY-MM-DD, PAN-matching), `latitude`/`longitude` (4-decimal degrees). Success pe response ka `outletId` → `users.instantpay_outlet_id`, aur lat/long → `outlet_latitude`/`outlet_longitude` save. InstantPay side idempotent (already registered ho to profile update). Dummy mode `MOCK…` outletId deta hai.

**2. Onboarding status**
Local DB read — `{ onboarded, outletId, latitude, longitude, mode }`. Koi InstantPay call nahi. UI is se decide kar sakti hai ki onboarding form dikhana hai ya nahi.

**3. Biometric eKYC status**
`spKey`: `WAP` (AePS rail) ya `DMI` (DMT rail). Signup pehle zaroori (outlet id na ho to 422). Response normalize: `action` (`ACTION-REQUIRED` = bio-KYC capture karna; `NO-ACTION-REQUIRED` = ho chuka), `status` + `approved` flag (`PENDING`/`APPROVAL_PENDING` = bank approval pending → 30-min interval pe poll; `APPROVED` = rail transact-ready), `outletAadhaarNumber` (masked; **empty ho to bio-KYC submit me `aadhaarNumber` mandatory**), `pidOptionWadh` + `referenceKey` (dono agle bio-KYC submit step me lagte hain), `isFaceAuthAvailable`, `isBiometricKycMandatory`. Dummy mode direct `APPROVED` + `NO-ACTION-REQUIRED`.

**4. Biometric KYC submit**
Merchant apna Aadhaar fingerprint UIDAI se verify karke outlet activate karta hai. Body: `referenceKey` (status API se), `biometricPayload` (RD-service PID XML — wahi `parsePidDataXml` reuse hota hai jo AEPS me), optional `aadhaarNumber` (sirf tab jab status ka `outletAadhaarNumber` empty tha), optional lat/long (default saved outlet geo). **Capture RD-service se `pidOptionWadh` (PidOptions `wadh` attribute) ke saath hona chahiye** — client-side `wadh` support onboarding UI ke saath aayega (abhi `rdServiceFingerprint` me sirf `otp` support hai). Success ke baad status API dobara poll karke `APPROVED` confirm karo. Dummy mode direct success.

**5. Mobile change initiate**
Outlet ka registered mobile change karne ke liye. Body: `newMobileNumber`, `aadhaarNumber` (AES encrypt), optional `existingMobileNumber` (default user mobile), optional lat/long. OTP **dono** numbers (existing + new) pe jaata hai. Response me `otpReferenceID` + `hash` — verify step me chahiye. **Sirf InstantPay outlet profile ka mobile** change hota hai; humara `users.mobile` untouched. Same number diya to 400. Dummy mode masked mock + `MOCKREF`/`MOCKHASH`.

**6. Mobile change verify**
Body: `otpReferenceID`, `otp` (4-8 digit), `hash` (dono initiate response se). Success = "Mobile Number successfully changed". Dummy mode koi bhi OTP accept.

**7. Merchant list (admin only)**
Partner-wide onboarded outlets ki directory. Body: `pageNumber`, `recordsPerPage`, optional filters `outletId`/`mobile`/`pan`. Client-level call (koi outlet header nahi). Response: `meta` (pagination) + `records[]` — `outletId`, name, mobile, email, pan, `kycStatus`, `isActive`, lat/long, aur **`wapStatus`** (`true` = outlet bank-side AEPS-enabled; `false`/`null` = bank end pe pending). Dummy mode locally onboarded retailers ki list. Retailer role ko allow nahi (poori list expose na ho).

---

## 3. Onboarding flow (end-to-end)

```
1. Signup Min-KYC          POST /api/onboarding/instantpay
      │  outletId + geo save
      ▼
2. Bio-KYC status          POST /api/onboarding/instantpay/bio-kyc-status  {spKey: WAP}
      │  action ACTION-REQUIRED → wadh + referenceKey milta hai
      ▼
3. Fingerprint capture      (RD service, PidOptions wadh="…")
      │
      ▼
4. Bio-KYC submit          POST /api/onboarding/instantpay/bio-kyc  {referenceKey, biometricPayload, …}
      │
      ▼
5. Poll bio-KYC status     (step 2 dobara, har 30 min) → APPROVED
      │
      ▼
   Outlet AePS/DMT ke liye ready ✅
```

Mobile change (optional, kabhi bhi): initiate → OTP (dono numbers) → verify.

---

## 4. Compliance & security

- **Aadhaar encryption:** AES-256-CBC (`INSTANTPAY_AES_KEY`) — signup, bio-KYC (jab aadhaar bheja jaaye), mobile change sab me.
- **PAN/Aadhaar matching:** `name` + `dateOfBirth` PAN se exact match; `mobile` + `address` Aadhaar se — mismatch pe InstantPay reject.
- **Fail-closed creds:** sandbox/live me InstantPay creds missing → server startup fail (`assertAepsProviderConfig`).
- **Role guard:** signup/bio-KYC/mobile-change = retailer only; merchant list = admin only.
- **Geo:** signup me diya lat/long hi outlet geofence anchor banta hai (AEPS geofence isi se check karta hai).
- **Provider-only mobile change:** InstantPay outlet mobile change karta hai, platform `users.mobile` nahi — do systems ki identity alag rehti hai (jaan-boojh ke).

---

## 5. Environment variables

AEPS ke saath **shared** — koi extra onboarding-specific env nahi. Reference:

### Testing (current)
```env
AEPS_PROVIDER_MODE=dummy
ALLOW_STUB_PROVIDERS=true
```

### InstantPay sandbox / live
```env
AEPS_PROVIDER_MODE=instantpay_sandbox   # ya instantpay_live
ALLOW_STUB_PROVIDERS=false
INSTANTPAY_CLIENT_ID=...
INSTANTPAY_CLIENT_SECRET=...
INSTANTPAY_AES_KEY=...          # 32 utf8 chars OR base64 of 32 bytes
INSTANTPAY_AUTH_CODE=1
# INSTANTPAY_BASE_URL=https://api.instantpay.in   # optional override
```

Onboarding ke liye DB me pehle se kuch chahiye nahi — signup hi `instantpay_outlet_id` + geo populate karta hai (isi ke baad AEPS live/sandbox chalega).

---

## 6. API provider (InstantPay) se kya chahiye

### One-time (account level) — AEPS ke saath shared
- [ ] **Client ID / Client Secret / Auth Code (fixed 1)**
- [ ] **AES key** (Aadhaar encryption)
- [ ] **Sandbox + Production credentials**
- [ ] **Base URL** confirm (`https://api.instantpay.in`)
- [ ] **Server IP whitelisting** (Coolify/prod outbound IP)
- [ ] **Endpoint IP rule** — `X-Ipay-Endpoint-Ip` = end customer IP

### Onboarding-specific clarifications chahiye
- [ ] **Bio-KYC `wadh`** — `pidOptionWadh` exactly PidOptions ke `wadh` attribute me jaata hai, confirm karo (RD capture side)
- [ ] **`spKey` casing** — docs me `spKey` + `spkey` dono dikhe; abhi dono bhej rahe hain, sahi konsa hai confirm karo
- [ ] **Bank approval SLA** — bio-KYC APPROVAL_PENDING → APPROVED me kitna time (poll interval 30 min doc me)
- [ ] **Mobile change** — `otpReferenceID` + `hash` initiate response me aate hain (doc sample me nahi the) — confirm exact field names
- [ ] **Merchant list `filters`** — doc body me kabhi top-level `outletId/mobile/pan`, kabhi `filters{}` object; abhi `filters{}` bhej rahe hain, confirm
- [ ] **eKYC / EDD** — full KYC (min-KYC ke aage) ya EDD upgrade ka koi API hai?
- [ ] **Bank account add** — merchant list me `bankAccounts[]` dikhta hai; add/update ka koi onboarding API hai?

---

## 7. Pending (next chats)

- [x] **Onboarding UI — Min-KYC (web)** — `/onboarding/outlet` + gate replaces Adhikari `/kyc` as primary retailer funnel.
- [ ] **Bio-KYC UI** (web + mobile) — status → wadh fingerprint → submit → poll till APPROVED.
- [ ] **Client-side `wadh` capture** — `rdServiceFingerprint.ts` (mobile + web) me PidOptions `wadh` attribute.
- [ ] **Mobile Register Outlet** — same Min-KYC funnel as web.
- [ ] **Admin merchant list UI** — `wapStatus` ke saath onboarded outlets dikhana.
- [ ] **Bank account onboarding** API (agar InstantPay expose karta hai).

> Adhikari `/kyc` page may remain for optional docs / admin queue — it is **not** the InstantPay outlet gate.

---

## 8. Key files (jaha code hai)

| Area | Path |
|------|------|
| Onboarding routes | `apps/backend/src/modules/onboarding/onboarding.routes.ts` |
| Onboarding controller | `apps/backend/src/modules/onboarding/onboarding.controller.ts` |
| Onboarding service (all logic) | `apps/backend/src/modules/onboarding/onboarding.service.ts` |
| Onboarding validators (zod) | `apps/backend/src/modules/onboarding/onboarding.validators.ts` |
| Router mount (`/api/onboarding`) | `apps/backend/src/app.ts` |
| Aadhaar encryption | `apps/backend/src/modules/providers/instantpay/crypto.ts` |
| PID XML parse | `apps/backend/src/modules/providers/instantpay/pidXml.ts` |
| InstantPay HTTP client | `apps/backend/src/modules/providers/instantpay/client.ts` |
| Mode config + fail-closed | `apps/backend/src/config/env.ts` |
| DB: users outlet cols | `apps/backend/src/db/postgres/schema/users.ts` |
| Task tracker | `docs/TASKS/21-instantpay-adapter.md` |

---

## 9. Testing (dummy mode) cheat-sheet

- `AEPS_PROVIDER_MODE=dummy` + `ALLOW_STUB_PROVIDERS=true`. Retailer token chahiye (login se).
- **Signup:**
```bash
curl -X POST http://localhost:4000/api/onboarding/instantpay \
  -H "Authorization: Bearer <RETAILER_TOKEN>" -H 'Content-Type: application/json' \
  -d '{"name":"Retailer One","gender":"M","pan":"ABCDE1234F","email":"r1@test.com","address":{"full":"Shop 1, Main Bazar","city":"Delhi","pincode":"110001"},"aadhaarNumber":"234123412346","dateOfBirth":"1990-04-05","latitude":28.6139,"longitude":77.2090}'
```
- **Status:** `GET /api/onboarding/instantpay/status` → `onboarded: true`, mock `outletId`.
- **Bio-KYC status:** `POST .../bio-kyc-status` `{"spKey":"WAP"}` → `approved: true` (dummy).
- **Bio-KYC submit:** `POST .../bio-kyc` `{referenceKey, biometricPayload}` → `submitted: true` (dummy koi bhi PID accept).
- **Mobile change:** `POST .../mobile-change` → masked OTP + mock ref/hash; `POST .../mobile-change/verify` → changed.
- **Merchant list (admin token):** `POST .../merchants` `{"pageNumber":1,"recordsPerPage":10}` → locally onboarded retailers.
