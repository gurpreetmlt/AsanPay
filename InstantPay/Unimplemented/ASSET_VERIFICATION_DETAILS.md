# InstantPay — Asset Verification — Implementation Details

> Compact cheat-sheet for AsanPay implementers. Full samples/OpenAPI: [`ASSET_VERIFICATION.md`](ASSET_VERIFICATION.md). Auth: [`OVERVIEW.md`](OVERVIEW.md) · [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao; is DETAILS ko source maano.
> **Workflow:** har nayi Asset Verification page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON
**Status:** Docs captured — not wired in AsanPay yet
**Last updated:** 2026-07-20

---

## 1. Auth & credentials (implement pehle)

### Staging / live credentials (per module)

| Key | Use |
|-----|-----|
| `client_id` | Client id → header `X-Ipay-Client-Id` |
| `client_secret` | Secret → header `X-Ipay-Client-Secret` |
| `module_secret` | Some modules (confirm with InstantPay for Identity) |
| `provider_secret` | Some modules only |
| AES key | Aadhaar encrypt (`INSTANTPAY_AES_KEY` style — same as onboarding/AEPS) |

Staging ≠ Live — production credentials alag milte hain.

### Headers (har Identity call)

| Header | Value | Notes |
|--------|-------|-------|
| `X-Ipay-Auth-Code` | `"1"` | Fixed |
| `X-Ipay-Client-Id` | from InstantPay | Or JWT auth (see below) |
| `X-Ipay-Client-Secret` | from InstantPay | Or JWT auth |
| `X-Ipay-Endpoint-Ip` | end-customer IP | OKYC / Aadhaar Demographic: **customer-provided** (docs = N) |
| `Content-Type` | `application/json` | |
| `Accept` | `application/json` | OKYC samples include this |

### JWT (optional alt auth)

- Auth API `grant_type`: `client_credentials` | `refresh_token` | `user_credentials`
- Token TTL: **15 min**
- Header me JWT pass → `client_id`/`client_secret` ki jagah
- Dono methods supported

### Common response envelope

```
statuscode | actcode | status | data | timestamp | ipay_uuid | orderid | environment | internalCode
```

Success often `statuscode: "TXN"`. Pool debit fields vary by API (see §3).

---

## 2. Env / config (AsanPay side — proposed)

Reuse existing InstantPay creds pattern jahan possible:

```env
# Shared InstantPay (already used by AEPS/onboarding)
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
INSTANTPAY_AES_KEY=          # AES-256-CBC for aadhaarNumber
# Identity / Asset Verification mode (proposed — confirm at implement)
IDENTITY_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

Provider se confirm: Identity module ke liye alag `module_secret` / IP whitelist chahiye ya nahi.

---

## 3. API matrix (implement checklist)

| # | Service | Method + path | AES Aadhaar? | Consent? | `externalRef`? | Key response |
|---|---------|---------------|--------------|----------|----------------|--------------|
| 1 | UAN Plus | `POST /identity/verifyUan` | No | Yes (`Y`) | Yes | `data.uanDetails` + pool |
| 2 | Driving License | `POST /identity/verifyDrivingLicense` | No | Yes | Yes | `data.drivingLicenseDetail` + pool |
| 3 | RC Plus | `POST /identity/verifyRcPlus` | No | Yes | Yes | `data.vehicalData` ⚠️ typo + pool? |
| 4 | Passport | `POST /identity/verifyPassport` | No | **No** | Yes | `data.passportData` + pool |
| 5 | Voter ID | `POST /identity/verifyVoterId` | No | Yes | Yes | `data.VoterCardDetail` ⚠️ PascalCase + pool |
| 6 | OKYC Send OTP | `POST /identity/okyc/sendOtp` | **Yes** | Yes (`Y`/`N`) | **No** | `otpReferenceID`, masked aadhaar |
| 7 | OKYC Verify OTP | `POST /identity/okyc/verify` | No | Yes | Yes | demographics + `profilePic` + `xmlContent` |
| 8 | Aadhaar Demographic | `POST /identity/verifyAadhaar` | **Yes** | Yes | Yes | `optional1..4` label/value + pool |

---

## 4. Per-API request fields (exact names)

### 1. UAN Verification Plus — `/identity/verifyUan`

```
uanNumber, latitude, longitude, externalRef, consent
```

Response highlights: `uanDetails.personal_details`, `employment_details` (recent/previous employers), `poolReferenceId`, pool: `openingBal` / `mode` / `amount` / `closingBal`.

### 2. Driving License — `/identity/verifyDrivingLicense`

```
drivingLicenseNumber, dob (YYYY-MM-DD), latitude, longitude, externalRef, consent
```

Response highlights: addresses, COV (`vehicleCategoryDetails`), `userImage` (base64), validity, status. Pool: `referenceId` / `openingBalance` / `paymentAmount` / `mode` / `closingBalance`.

### 3. RC Plus — `/identity/verifyRcPlus`

```
vehicleRegistrationNumber, latitude, longitude, externalRef, consent
```

Response key: **`vehicalData`** (provider spelling — parse as-is). Insurance, fitness, PUCC, owner, specs, `invoiceInfo`.

### 4. Passport — `/identity/verifyPassport`

```
passportFileNumber, dob (YYYY-MM-DD request), latitude, longitude, externalRef
```

No consent. Response: `passportData` (name, surname, applicationType/Date, passportNumber may be null). DOB response often `DD/MM/YYYY`.

### 5. Voter ID — `/identity/verifyVoterId`

```
voterId (EPIC), latitude, longitude, externalRef, consent
```

Consent copy required in UI. Response key: **`VoterCardDetail`**. Address, constituencies, polling booth, vernacular names. Pool: DL-style balance fields.

### 6. OKYC Send OTP — `/identity/okyc/sendOtp`

```
aadhaarNumber (AES-256-CBC), latitude, longitude, consent (Y/N)
```

`actcode: OtpGenerated` → save `data.otpReferenceID` for step 7. `orderid` may be null.

### 7. OKYC Verify OTP — `/identity/okyc/verify`

```
otp, otpReferenceID, latitude, longitude, externalRef, consent
```

Response: `fullName`, `shortAadhaarNumber`, `dateOfBirth`, `gender`, `address{}`, `profilePic` (base64 JPEG), `xmlContent` (base64 OfflinePaperlessKyc), `pool` (+ `transactionValue` / `payableValue`).

### 8. Aadhaar Demographic — `/identity/verifyAadhaar`

```
aadhaarNumber (AES-256-CBC), latitude, longitude, externalRef, consent
```

Response: `optional1Label`/`optional1` … `optional4` (Address, Age Band, Gender, masked Mobile). Pool: `openingBal` / `amount` / `closingBal`.

---

## 5. Flows (UI / backend)

### Offline KYC (2-step)

```
UI: enter Aadhaar + consent + geo
  → encrypt Aadhaar (AES-256-CBC)
  → POST sendOtp
  → show OTP screen (keep otpReferenceID)
  → POST verify
  → show / store KYC result (avoid logging full xmlContent/profilePic)
```

### Single-shot verifications (1–5, 8)

```
UI: collect id + required fields (dob where needed) + consent (if any) + geo + externalRef
  → POST corresponding /identity/*
  → map data.* to UI; treat statuscode TXN as success
```

---

## 6. Implementation gotchas

| Issue | Detail |
|-------|--------|
| Pool field names inconsistent | UAN/Passport/Demographic: `openingBal`/`amount`/`closingBal`; DL/Voter/OKYC verify: `openingBalance`/`paymentAmount`/`closingBalance` (+ sometimes `transactionValue`) |
| Typos in response keys | `vehicalData`, `VoterCardDetail` — do not “fix” on parse |
| AES Aadhaar | Same cipher as onboarding (`INSTANTPAY_AES_KEY`); never send plaintext |
| Large payloads | OKYC `profilePic` + `xmlContent` — don’t log; size limits on mobile |
| Geo | Almost every API requires lat/long |
| `externalRef` | Client unique txn id — generate UUID / order ref |
| Consent UI | Voter + Aadhaar/OKYC have provider consent text — show before call |
| Provider doc bugs | Missing commas in samples; OpenAPI copy-paste titles; some samples omit `consent`/`dob` |

---

## 7. Suggested AsanPay backend shape (when implementing)

Not built yet — proposal only:

```
POST /api/identity/uan
POST /api/identity/driving-license
POST /api/identity/rc
POST /api/identity/passport
POST /api/identity/voter-id
POST /api/identity/okyc/send-otp
POST /api/identity/okyc/verify
POST /api/identity/aadhaar-demographic
```

Pattern: same as AEPS — controller → service → InstantPay HTTP adapter; `IDENTITY_PROVIDER_MODE` / shared InstantPay mode; dummy mocks for local.

---

## 8. Provider se confirm karna (before live)

- [ ] Identity / Asset Verification module enabled on staging
- [ ] Creds: client_id, client_secret, AES key, IP allowlist
- [ ] Pricing / pool debit amounts per API
- [ ] Whether JWT required or header client creds enough
- [ ] Rate limits
- [ ] Sandbox test numbers (UAN, DL, RC, EPIC, passport file no.)

---

## Source docs

| Doc | Role |
|-----|------|
| [`ASSET_VERIFICATION.md`](ASSET_VERIFICATION.md) | Full API pages (samples, OpenAPI notes) |
| [`OVERVIEW.md`](OVERVIEW.md) | Platform overview, JWT, testing credentials |
| [`ONBOARDING.md`](ONBOARDING.md) | Existing AES + InstantPay header patterns to reuse |
