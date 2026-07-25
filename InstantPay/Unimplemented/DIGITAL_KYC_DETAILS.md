# InstantPay — Digital KYC — Implementation Details

> Compact cheat-sheet. Full pages: [`DIGITAL_KYC.md`](DIGITAL_KYC.md). Auth: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao.
> **Workflow:** har nayi Digital KYC page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON
**Status:** Docs captured — not wired in AsanPay yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Digital KYC** (InstantPay Identity family) |
| APIs so far | Profile Enrichment · Face Liveness · DigiLocker (overview) |
| Profile Enrichment | `POST /identity/fetchProfile` → `preFillData` (+ PAN) |
| Face Liveness | Create session → SDK video selfie → Get session result |
| Create Session | `POST /identity/faceLiveness/createSession` → `sessionId` + `accessToken` |
| Get Session Result | `POST /identity/faceLiveness/getSessionResult` → score 0–100 + images (live schema TBD) |
| DigiLocker | SIGNIN/SIGNUP via `userFlow` → status → Fetch Documents |
| Create URL | `POST /identity/digiLocker` → `referenceId` + `url` + `PENDING` |
| Verification Status | `POST /identity/digiLocker/status` → `AUTHORIZED` + `userDetails` |
| Fetch Document | `POST /identity/digiLocker/document` → `{ referenceId, documentType }` |
| Verify Account | `POST /identity/digiLocker/verifyAccount` → `ACCOUNT_EXISTS` + `digilockerId` |

Sibling Identity docs: [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md), [`BUSINESS_VERIFICATION_DETAILS.md`](BUSINESS_VERIFICATION_DETAILS.md).
Do **not** confuse with MCA Fetch Profile (`/identity/company/lookup`).

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | `"1"` |
| `X-Ipay-Client-Id` / `X-Ipay-Client-Secret` | InstantPay |
| `X-Ipay-Endpoint-Ip` | End-customer IP — provider table Provided=Y; confirm |

JWT alt: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

### Env (proposed)

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
DIGITAL_KYC_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | Profile Enrichment | `POST /identity/fetchProfile` | 📄 |
| 2 | Face Liveness — Overview | SDK `ipayfaceliveness.js` + 3-step flow | 📄 |
| 3 | Face Liveness — Create Session | `POST /identity/faceLiveness/createSession` | 📄 |
| 4 | Face Liveness — Get Session Result | `POST /identity/faceLiveness/getSessionResult` | 📄 |
| 5 | DigiLocker — Overview | Process flow (SIGNIN/SIGNUP → status → fetch) | 📄 |
| 6 | DigiLocker — Create URL | `POST /identity/digiLocker` | 📄 |
| 7 | DigiLocker — Verification Status | `POST /identity/digiLocker/status` | 📄 |
| 8 | DigiLocker — Fetch Document | `POST /identity/digiLocker/document` | 📄 |
| 9 | DigiLocker — Verify Account | `POST /identity/digiLocker/verifyAccount` | 📄 |

---

## 4. Profile Enrichment — implement fields

**URL:** `POST https://api.instantpay.in/identity/fetchProfile`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `name` | M | User name |
| `mobileNumber` | M | Mobile |
| `taxIdNumber` | M | **PAN** |
| `inquiryPurposeCode` | M | Sample `"01"` — **purpose table TBD** |
| `externalRef` | M | Unique txn id |
| `latitude` / `longitude` | M | End customer |

### Response highlights

| Path | Notes |
|------|-------|
| `data.preFillData.*` | Full/partial profile (name, dob, gender, income, PAN, voter, masked Aadhaar, addresses, phones) |
| `data.pool*` | Fee sample ~`4.72` (older sample ~2.36) |
| Legacy | Older OpenAPI showed `result.mobileLinkedName` only — do not prefer |

### Suggested Adhikari route

```
POST /api/digital-kyc/profile-enrichment  → InstantPay POST /identity/fetchProfile
```

---

## 4b. Face Liveness — overview / SDK

| Item | Value |
|------|-------|
| SDK | `https://static.instantpay.in/assets/idv/ipayfaceliveness.js` |
| Step 1 | `POST /identity/faceLiveness/createSession` → `sessionId`, `accessToken` |
| Step 2 | SDK UI in `selectorId` (video selfie + oval) |
| Step 3 | `POST /identity/faceLiveness/getSessionResult` → confidence 0–100 + images |
| Required callbacks | `onErrorCallback`, `onSuccessCallback` |
| After success | Call Get Session Result from backend |

### Create Session — implement fields

**URL:** `POST https://api.instantpay.in/identity/faceLiveness/createSession`

| Param | M/O | Notes |
|-------|-----|-------|
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique **alphanumeric** |
| Headers | | Endpoint-Ip **partner-supplied (N)** |

| Response | Notes |
|----------|-------|
| `data.sessionId` | UUID for SDK |
| `data.accessToken` | Opaque; truncate in logs |
| `data.pool` | Sample fee `0.00` on create |

### Get Session Result — implement fields

**URL:** `POST https://api.instantpay.in/identity/faceLiveness/getSessionResult`

| Param | M/O | Notes |
|-------|-----|-------|
| `sessionId` | M | From Create Session |
| `externalRef` | — | **Not** used (docs note is copy-paste) |

| Response (prose) | Notes |
|------------------|-------|
| Confidence | **0–100** — exact JSON key TBD (sample empty / OpenAPI wrong) |
| Reference image | + face bounding box — key TBD |
| Audit images | + bounding boxes — key TBD |

### Suggested Adhikari routes

```
POST /api/digital-kyc/face-liveness/session  → InstantPay POST /identity/faceLiveness/createSession
POST /api/digital-kyc/face-liveness/result   → InstantPay POST /identity/faceLiveness/getSessionResult
# Frontend loads SDK with sessionId + accessToken from create
```

---

## 4c. DigiLocker — overview + Create URL

| Item | Value |
|------|-------|
| Purpose | Access govt digital docs via DigiLocker |
| Step 0 | **Verify Account** (mobile or encrypted Aadhaar) → exists? |
| Step 1 | Create URL with `userFlow`: `SIGNIN` (exists) \| `SIGNUP` (not) |
| Step 2 | User selects PAN / Aadhaar / APAAR → `redirectionUrl` callback |
| Step 3 | Verification Status → `PENDING` / `AUTHORIZED` / `EXPIRED` / `CONSENT_DENIED` |
| Step 4 | If `AUTHORIZED` → Fetch Document |
| Create URL | `POST /identity/digiLocker` |
| Verify Account | `POST /identity/digiLocker/verifyAccount` |

### Create URL — implement fields

**URL:** `POST https://api.instantpay.in/identity/digiLocker`

| Param | M/O | Notes |
|-------|-----|-------|
| `externalRef` | M | Unique txn id |
| `redirectionUrl` | M | Partner callback after DigiLocker |
| `userFlow` | M | `SIGNUP` \| `SIGNIN` (overview said `user` — wrong) |
| `latitude` / `longitude` | M | End customer |
| Headers | | Endpoint-Ip **N** |

| Response | Notes |
|----------|-------|
| `data.referenceId` | Journey id for status/fetch |
| `data.url` | Open in browser / WebView |
| `data.status` | Often `PENDING` at create |

### Verification Status — implement fields

**URL:** `POST https://api.instantpay.in/identity/digiLocker/status`

| Param | M/O | Notes |
|-------|-----|-------|
| `referenceId` | M | From Create URL |

| Response | Notes |
|----------|-------|
| `data.status` | `PENDING` / `AUTHORIZED` / `EXPIRED` / `CONSENT_DENIED` |
| `data.userDetails` | On AUTHORIZED: name, mobile, dob, gender, `eaadhaar` |
| `data.externalRef` | Partner ref echo |

### Fetch Document — implement fields

**URL:** `POST https://api.instantpay.in/identity/digiLocker/document`

| Param | M/O | Notes |
|-------|-----|-------|
| `referenceId` | M | From Create URL |
| `documentType` | M | Sample `PAN` — confirm `DL` / others |
| Published table | — | **Wrong** (Create URL fields) — ignore |

| Response (PAN) | Notes |
|----------------|-------|
| `pan`, `panType`, `nameOnPan`, `gender`, `dob` | Flat PAN fields |
| `base64File` | PDF base64 |
| DOB | `DD-MM-YYYY` (Status used ISO) |

### Verify Account — implement fields

**URL:** `POST https://api.instantpay.in/identity/digiLocker/verifyAccount`

| Param | M/O | Notes |
|-------|-----|-------|
| `externalRef` | M | Unique txn id |
| `mobile` | O* | Plain mobile |
| `aadhaarNumber` | O* | **AES-256** ciphertext |
| `latitude` / `longitude` | M | End customer |

\* Either mobile **or** aadhaar (not PAN).

| Response | Notes |
|----------|-------|
| `data.status` | Sample `ACCOUNT_EXISTS` — capture non-exist value |
| `data.digilockerId` | UUID when account exists |

### Suggested Adhikari routes

```
POST /api/digital-kyc/digilocker/verify-account → InstantPay POST /identity/digiLocker/verifyAccount
POST /api/digital-kyc/digilocker/create-url     → InstantPay POST /identity/digiLocker
POST /api/digital-kyc/digilocker/status         → InstantPay POST /identity/digiLocker/status
POST /api/digital-kyc/digilocker/document       → InstantPay POST /identity/digiLocker/document
```

---

## 5. API summary

| Op | InstantPay | Notes |
|----|------------|-------|
| Profile Enrichment | `POST /identity/fetchProfile` | `name` + `mobileNumber` + **`taxIdNumber` (PAN)** + `inquiryPurposeCode` + lat/long/`externalRef`. Response **`preFillData`**. Purpose table missing. Fee ~4.72. OpenAPI junk. ≠ MCA company lookup. |
| Face Liveness Overview | SDK `ipayfaceliveness.js` | Create → SDK Start → Get Result. |
| Face Liveness Create Session | `POST /identity/faceLiveness/createSession` | lat/long/`externalRef` → `sessionId` + `accessToken`. Status `Sucesses`. OpenAPI 400 GSTIN junk. |
| Face Liveness Get Session Result | `POST /identity/faceLiveness/getSessionResult` | Body `{ sessionId }` only. Prose: score 0–100 + ref/audit images. **Sample empty; OpenAPI example = Create Session clone — capture live.** |
| DigiLocker Overview | — | SIGNIN/SIGNUP flow; status enum; fetch after `AUTHORIZED`. |
| DigiLocker Verify Account | `POST /identity/digiLocker/verifyAccount` | mobile **or** AES Aadhaar + lat/long/`externalRef`. Sample `ACCOUNT_EXISTS` + `digilockerId`. Drives SIGNIN vs SIGNUP. |
| DigiLocker Create URL | `POST /identity/digiLocker` | `externalRef`, `redirectionUrl`, `userFlow`, lat/long → `referenceId`/`url`/`PENDING`. Overview `user` → actual `userFlow`. |
| DigiLocker Verification Status | `POST /identity/digiLocker/status` | Body `{ referenceId }`. Returns status + `userDetails` when AUTHORIZED. OpenAPI http sample missing `/status`. |
| DigiLocker Fetch Document | `POST /identity/digiLocker/document` | Body `{ referenceId, documentType }`. Param table wrong. PAN sample + `base64File`. Samples/OpenAPI wrong paths. |

### Flow (Profile Enrichment)

1. Collect name, mobile, PAN, purpose code (`01` until table known).
2. Call `fetchProfile` with lat/long/`externalRef`.
3. Prefill UI from `preFillData` (treat as PII).
4. Persist pool / `orderid` / `ipay_uuid`.

### Flow (Face Liveness)

1. `POST …/createSession` → `sessionId` + `accessToken`.
2. Open SDK with those credentials (never ship client secret to browser).
3. On success → `POST …/getSessionResult` `{ sessionId }` → persist score + images.
4. Handle cancel / error / Try Again; define pass threshold on 0–100 score.

### Flow (DigiLocker)

1. `POST …/verifyAccount` (mobile or AES Aadhaar) → if `ACCOUNT_EXISTS` use `SIGNIN`, else `SIGNUP`.
2. `POST /identity/digiLocker` with `userFlow` + `redirectionUrl`.
3. Open `data.url`; store `referenceId`.
4. On callback → `POST …/status` until `AUTHORIZED` (or terminal failure).
5. `POST …/document` with `referenceId` + `documentType` → parse typed `data` + `base64File`.

### Dummy mode

- Profile Enrichment: mock `TXN` + `preFillData` + pool ~4.72.
- Create Session: mock UUID `sessionId` + short `accessToken` + pool `0.00`.
- Get Session Result: mock confidence (e.g. `95`) + placeholder image URLs until live schema known.
- DigiLocker Verify Account: mock `ACCOUNT_EXISTS` + `digilockerId` (and a not-found variant).
- DigiLocker Create URL: mock `referenceId` + journey URL + `status: PENDING`.
- DigiLocker Status: mock `AUTHORIZED` + `userDetails`.
- DigiLocker Fetch: mock PAN fields + short fake `base64File`.

---

## 6. Provider checklist

- [ ] Digital KYC / Profile Enrichment module on staging
- [ ] Face Liveness module + SDK allowlist / CSP for `static.instantpay.in`
- [ ] DigiLocker Verify Account on staging
- [ ] DigiLocker Create URL (`/identity/digiLocker`) on staging
- [ ] DigiLocker Status (`/identity/digiLocker/status`) on staging
- [ ] DigiLocker Fetch (`/identity/digiLocker/document`) on staging
- [ ] Confirm Verify Account non-exist `data.status` value
- [ ] Confirm `documentType` enum (`PAN`, `DL`, Aadhaar, APAAR, …)
- [ ] Confirm non-PAN response shapes
- [ ] Obtain full **`inquiryPurposeCode`** table
- [ ] **Capture live Get Session Result JSON** (docs sample empty / OpenAPI wrong)
- [ ] Confirm confidence field name + pass threshold
- [ ] Confirm image encoding (base64 vs URL) + retention
- [ ] Confirm Create URL live `data.url` shape (not placeholder)
- [ ] Confirm `eaadhaar` flag semantics
- [ ] Obtain full **`inquiryPurposeCode`** table (image/table missing from paste)
- [ ] Confirm `taxIdNumber` always required
- [ ] Confirm live response is `preFillData` (not legacy `mobileLinkedName`)
- [ ] Confirm Profile Enrichment fee (~4.72)
- [ ] Confirm Face Liveness fee timing (create `0.00` vs result)
- [ ] Confirm DigiLocker fee (no pool in DigiLocker samples)
- [ ] Confirm AES key for DigiLocker Aadhaar (same as Identity?)
- [ ] Confirm session / `accessToken` TTL
- [ ] Confirm name-match semantics vs return-only lookup
- [ ] IP allowlist

---

## Source docs

| Doc | Role |
|-----|------|
| [`DIGITAL_KYC.md`](DIGITAL_KYC.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
| [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md) | Sibling Identity pattern / AES Aadhaar |
| [`BUSINESS_VERIFICATION.md`](BUSINESS_VERIFICATION.md) | MCA Fetch Profile (different path) |
