# InstantPay — Digital KYC

> Raw InstantPay Digital KYC docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`DIGITAL_KYC_DETAILS.md`](DIGITAL_KYC_DETAILS.md). Jab implement ho → root `InstantPay/DIGITAL_KYC.md` (AEPS-style) banega.

**Provider:** InstantPay (Digital KYC / Identity)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (Digital KYC APIs)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Y ⚠️ (confirm vs partner-supplied) |

### Common response envelope

| Parameter | Type | Description |
|-----------|------|-------------|
| `statuscode` | String | InstantPay Status Code |
| `actcode` | String | Action Code |
| `status` | String/Array | Status message (docs may mis-type) |
| `data` | Object/String | Response Data (if present) |
| `timestamp` | String | Response time (`YYYY-MM-DD HH:II:SS`) |
| `ipay_uuid` | String | Request reference number |
| `orderid` | String | Transaction Id (null if not a transaction) |
| `environment` | String | Live / Sandbox |
| `internalCode` | String | Usually null |

---

## Service-wise status

| # | Service | InstantPay endpoint | Status |
|---|---------|---------------------|--------|
| 1 | Profile Enrichment | `POST /identity/fetchProfile` | 📄 Docs captured |
| 2 | Face Liveness — Overview | SDK + create/start/get session flow | 📄 Docs captured |
| 3 | Face Liveness — Create Session | `POST /identity/faceLiveness/createSession` | 📄 Docs captured |
| 4 | Face Liveness — Get Session Result | `POST /identity/faceLiveness/getSessionResult` | 📄 Docs captured |
| 5 | DigiLocker — Overview | Digital Locker process flow (SIGNIN/SIGNUP → status → fetch) | 📄 Docs captured |
| 6 | DigiLocker — Create URL | `POST /identity/digiLocker` | 📄 Docs captured |
| 7 | DigiLocker — Verification Status | `POST /identity/digiLocker/status` | 📄 Docs captured |
| 8 | DigiLocker — Fetch Document | `POST /identity/digiLocker/document` | 📄 Docs captured |
| 9 | DigiLocker — Verify Account | `POST /identity/digiLocker/verifyAccount` | 📄 Docs captured |

---

## 1. Profile Enrichment

Enrich / pre-fill user profile using **name + mobile + PAN** (`taxIdNumber`). Same path also appears under Financial Verifications nav.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/fetchProfile` |
| **OpenAPI operationId** | `identity-profile-enrichment-1` (Financial Verifications page) / older `post_mobilenameLookup-1-1` ⚠️ |
| **Summary** | Provider intros often **wrong** (Bank List / Mobile Name Lookup copy) |
| **OpenAPI title** | Mixed junk (`identity` / `bank-list-1`) ⚠️ |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP (Financial Verifications page) |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `name` | String | Mandatory | Name of the user |
| `mobileNumber` | String | Mandatory | Mobile number |
| `taxIdNumber` | String | Mandatory | **PAN** |
| `inquiryPurposeCode` | String | Mandatory | Purpose code — **table still missing** from paste (image placeholder); sample `"01"` |
| `latitude` | String | Mandatory | Latitude |
| `longitude` | String | Mandatory | Longitude |
| `externalRef` | String | Mandatory | Unique transaction id |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/fetchProfile' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endpointIp}}' \
--header 'X-Ipay-Auth-Code: 1' \
--data '{
  "name": "Instantpay",
  "mobileNumber": "9876543210",
  "inquiryPurposeCode": "01",
  "taxIdNumber": "AJJPS0032N",
  "latitude": "11.10",
  "longitude": "26.91",
  "externalRef": "1769750452"
}'
```

```http
POST /identity/fetchProfile HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endpointIp}}
X-Ipay-Auth-Code: 1

{
  "name": "SHAHBAZ ALI",
  "mobileNumber": "98XXXXXXXX",
  "inquiryPurposeCode": "01",
  "taxIdNumber": "AJJPS0032N",
  "latitude": "11.10",
  "longitude": "26.91",
  "externalRef": "1769750452"
}
```

### Sample success response (`preFillData`)

> PII truncated/masked in archive. Older OpenAPI-only sample had `result.mobileLinkedName` + fee ~2.36 — **prefer this live sample**.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "preFillData": {
      "userFullName": "PARAMJIT SINGH",
      "userFirstName": "PARAMJIT",
      "userMiddleName": "SINGH",
      "userLastName": "",
      "userGender": "F",
      "userDob": "01-01-1975",
      "userAge": "51",
      "totalIncome": "50001",
      "panNumber": "AJJPS0032N",
      "voterIdNumber": "JJGXXXXXXX",
      "aadhaarNumber": "XXXXXXXXXXXX",
      "addressFull": "…",
      "addressState": "TN",
      "addressPostal": "641602",
      "mobileNumber": "91XXXXXXXXXX",
      "addressList": [
        { "fullAddress": "…", "state": "TN", "postalCode": "641602" }
      ],
      "phoneList": [
        { "type": "M", "number": "XXXXXXXXXX" }
      ]
    },
    "poolReferenceId": "1260130052816KPTXJ",
    "pool": {
      "openingBal": "99925439.30",
      "mode": "DR",
      "amount": "4.72",
      "closingBal": "99925434.58"
    }
  },
  "timestamp": "2026-01-30 10:58:16",
  "ipay_uuid": "h000a0f53958-218b-45a8-86dc-ea1c7bbf1162-dTAEjqkNxtHu",
  "orderid": "1260130052816KPTXJ",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data.preFillData` highlights

| Field | Description |
|-------|-------------|
| `userFullName` / first/middle/last | Split name |
| `userGender` / `userDob` / `userAge` | Demographics |
| `totalIncome` | Income string |
| `panNumber` / `voterIdNumber` / `aadhaarNumber` | IDs (Aadhaar masked) |
| `addressFull` / `addressList[]` | Addresses |
| `phoneList[]` | Phones with `type` (e.g. `M`) |
| `pool` | Sample fee **`4.72`** DR |

### Gotchas

- Page intro on Financial Verifications nav is **Bank List copy-paste** — ignore prose; trust params + sample.
- OpenAPI on that page is **Bank List + Credit Score Simulator junk** — ignore.
- **`taxIdNumber` (PAN) mandatory** in current param table (older Digital KYC paste omitted it).
- **`inquiryPurposeCode` table still missing** — only `"01"` known.
- Two response shapes seen: **`preFillData`** (this paste) vs older OpenAPI `result.mobileLinkedName` — implement against `preFillData` unless staging returns the short form.
- Fees differ by sample (~4.72 vs ~2.36) — confirm live.
- Endpoint-Ip Provided = **N** on Financial Verifications page.
- ≠ MCA Fetch Profile (`/identity/company/lookup`).
- Heavy PII — minimize logging.

### OpenAPI notes

- Do **not** trust OpenAPI for this page (wrong path/summary/examples).
- Real path: `POST https://api.instantpay.in/identity/fetchProfile`

### Related

- Also listed under Financial Verifications sidebar ([`FINANCIAL_VERIFICATION.md`](FINANCIAL_VERIFICATION.md))

---

## 2. Face Liveness — Overview

Verify the customer is a **real live person** (not a bot / spoof / static photo or replay). User records a short **video selfie** and follows on-screen prompts.

### Positioning

| Item | Detail |
|------|--------|
| **Purpose** | Presence / anti-spoof face liveness |
| **Capture** | Short video selfie; face in oval; good lighting |
| **Outcomes** | Confidence score, reference image, audit images (via Get Session Result) |
| **Fraud** | Detects camera bypass / spoof attempts |

### API operations (3 steps)

| Step | Operation | Role |
|------|-----------|------|
| **1** | **Create Face Liveness Session** | Starts session; returns `sessionId` + `accessToken` |
| **2** | **Start Face Liveness Session** | InstantPay **UI component** (SDK) — user captures video selfie |
| **3** | **Get Session Result** | Confidence score, reference image, audit images |

> Create + Get Session Result REST pages not in this paste — archive when pasted. This page = product overview + **JS SDK** embed.

### SDK

| Item | Value |
|------|-------|
| **URL** | https://static.instantpay.in/assets/idv/ipayfaceliveness.js |
| **Inputs** | `sessionId`, `accessToken` (from Create Session) |
| **Mount** | `selectorId` — DOM element id for the liveness UI |

### SDK config (provider snippet — cleaned)

```js
{
  debug: false,
  selectorId: "", // element id where liveness UI mounts
  sessionId: "", // required — from Create Session
  accessToken: "", // required — from Create Session
  disableStartScreen: false, // optional
  onCancelCallback: "", // also on "Try Again" in default error modal
  onErrorCallback: "", // required — (error: LivenessError) => void
  onSuccessCallback: "", // required — then call Get Session Result
  welcomeScreenConfig: {
    hideScreen: false,
    hideTitleBar: false,
    title: "Liveness Check",
    hideCloseButton: false,
    description:
      "You will go through a face verification process to prove that you are a real person.",
    extraInstructionPoint: [],
    proceedButtonText: "Proceed Liveness Check",
  },
  verificationScreenConfig: {
    hideTitleBar: false,
  },
  onChangeDisplayText: {
    hintCenterFaceText: "Center your face",
    startScreenBeginCheckText: "Start video check",
    hintTooCloseText: "Move back",
    hintTooFarText: "Move closer",
    hintConnectingText: "Connecting...",
    hintVerifyingText: "Verifying...",
    hintCheckCompleteText: "Check complete",
  },
  config: {
    hidePhotosensitiveWarning: false,
    color: {
      backgroundPrimary: "#FFFFFF",
      fontPrimary: "#0d1926",
      primary10: "#e9f9fc",
      primary20: "#bcecf5",
      primary40: "#7dd6e8",
      primary60: "#40aabf",
      primary80: "#047d95",
      primary90: "#005566",
      primary100: "#00404d",
      button: {
        background: "#047d95",
        hover: "#005566",
        focus: "#005566",
        active: "#00404d",
      },
      loader: {
        primary: "#304050",
      },
    },
  },
}
```

Clients can customize copy/colors; can add descriptions beyond the static five via `extraInstructionPoint` / related fields.

### Flow (implement)

1. Backend: **Create Session** → `sessionId` + `accessToken`.
2. Frontend: load SDK → mount with config → user completes capture.
3. `onSuccessCallback` → backend **Get Session Result** → store score + images.
4. Handle `onCancelCallback` / `onErrorCallback` (incl. Try Again).

### Gotchas

- Step 2 is **SDK/component**, not a partner-called REST “start” in this overview.
- `sessionId` + `accessToken` both required before opening UI.
- `onSuccessCallback` only signals analysis complete — **must** call Get Session Result for score/images.
- Provider labeled snippet as `node` but it is a **browser JS config object**.
- UI English copy in defaults is fine for product; Adhikari may override via `welcomeScreenConfig` / `onChangeDisplayText`.
- Docs image (provider CDN): `files.readme.io/…Screenshot_2024-07-10_at_12.05.37_PM.png`

### Related

- Create Face Liveness Session (Step 1 — paste next)
- Get Session Result (Step 3 — paste next)
- Profile Enrichment (#1) — separate Identity API

---

## 3. Face Liveness — Create Session

Creates a Face Liveness session; returns unique **`sessionId`** and **`accessToken`** for the SDK (Step 2).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/faceLiveness/createSession` |
| **OpenAPI operationId** | `identity-verification-ai-ml-faceliveness-create-session` |
| **Summary** | Create Session |
| **OpenAPI title** | `face-liveness` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP (partner-supplied) |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `latitude` | String | M | Current location latitude |
| `longitude` | String | M | Current location longitude |
| `externalRef` | String | M | Unique transaction id — **alphanumeric + unique** (provider note) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/faceLiveness/createSession' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "latitude": "-33.2442",
  "longitude": "-106.3922",
  "externalRef": "1720521988"
}'
```

```http
POST /identity/faceLiveness/createSession HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "latitude": "-33.2442",
  "longitude": "-106.3922",
  "externalRef": "1720521988"
}
```

### Sample success response

> `accessToken` truncated — keep full token from live API for SDK.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Sucesses",
  "data": {
    "sessionId": "fdabfdc0-fba6-41d8-879c-30df24671f05",
    "accessToken": "SVFvSmIzSnBaMmx1WDJWakVH…#Phu5IOqA6Q+JXzhegfB/V87qBtALmLnQ1zFbmSP1##5K6HLLAGTOVSOJMZAISA",
    "poolReferenceId": "1240709150158FAKAV",
    "pool": {
      "openingBal": "13.97",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "13.97"
    }
  },
  "timestamp": "2024-07-09 15:01:58",
  "ipay_uuid": "h0009c7aeb8d-3b0f-4c91-af8f-b59b2b9c8f58-xdPdjB2KKBtl",
  "orderid": "1240709150158FAKAV",
  "environment": "LIVE"
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `sessionId` | UUID for SDK + Get Session Result |
| `accessToken` | Long opaque token for SDK (do not log in full in prod) |
| `poolReferenceId` / `pool` | Sample `amount: "0.00"` DR — fee may be deferred to Get Result |
| `orderid` | = `poolReferenceId` in sample |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `data` | Table says Array — sample is **object** |
| `status` | Typo **`Sucesses`** (success misspelled) |

### Gotchas

- Pass `sessionId` + `accessToken` to Face Liveness SDK (#2); do not expose `client_secret` to browser.
- `externalRef` must be **unique alphanumeric**.
- `X-Ipay-Endpoint-Ip` Provided = **N** here (unlike some Identity pages marked Y).
- Sample lat/long look like placeholders (US/desert coords) — use real end-customer coords.
- Pool `amount: "0.00"` on create — confirm whether billing is on create, result, or both.
- OpenAPI `400` example is **GSTIN validation** junk — ignore; wrong product copy-paste.
- Status string typo `Sucesses` — match on `statuscode: "TXN"` not English status text.
- Treat `accessToken` as secret (short TTL likely — confirm).

### OpenAPI notes

- Spec title: `face-liveness` v1.0
- Server: `https://api.instantpay.in/identity/faceLiveness` · Path: `POST /createSession`
- `operationId`: `identity-verification-ai-ml-faceliveness-create-session`
- `400` example: Invalid GSTIN ⚠️ — ignore

---

## 4. Face Liveness — Get Session Result

Retrieves results for a Face Liveness session by **`sessionId`**: confidence score (**0–100**), **reference image** (with face bounding box), and **audit images** (with face bounding boxes).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/faceLiveness/getSessionResult` |
| **OpenAPI operationId** | `identity-verification-ai-ml-face-liveness-get-session-result` |
| **Summary** | Get Session Result |
| **OpenAPI title** | `face-liveness` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP (partner-supplied) |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `sessionId` | String | M | From Create Session response |

> Provider note on this page repeats “`externalRef` must be unique alphanumeric” — **copy-paste from Create Session**. This API body only has `sessionId`.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/faceLiveness/getSessionResult' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "sessionId": "1ac280b1-dfe0-4e05-9127-e1ec74478cb9"
}'
```

```http
POST /identity/faceLiveness/getSessionResult HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "sessionId": "1ac280b1-dfe0-4e05-9127-e1ec74478cb9"
}
```

### Sample success response

> Main page Sample Response was **empty**. OpenAPI Result example is a **wrong paste of Create Session** (`sessionId` + `accessToken` + pool) — **does not** show confidence / images. Capture live response on staging.

**Expected shape (from prose — field names TBD on staging):**

| Expected | Detail |
|----------|--------|
| Confidence score | Numeric **0–100** |
| Reference image | Image + face bounding box |
| Audit images | One or more images + bounding boxes |

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Sucesses",
  "data": {
    "_comment": "PLACEHOLDER — confirm live keys (confidence / referenceImage / auditImages / bounding boxes). OpenAPI example wrongly reused Create Session."
  },
  "timestamp": "YYYY-MM-DD HH:MM:SS",
  "ipay_uuid": "…",
  "orderid": null,
  "environment": "LIVE|SANDBOX"
}
```

### Envelope notes

| Name | Docs table vs reality |
|------|----------------------|
| `data` | Table says Array — almost certainly **object** |
| `status` | OpenAPI still shows typo `Sucesses` |

### Gotchas

- Call **after** SDK `onSuccessCallback` (overview #2).
- Body = **`sessionId` only** — ignore misplaced `externalRef` note.
- **No usable sample payload** in docs; OpenAPI 200 example = Create Session clone — **do not** implement against it.
- OpenAPI `400` again = Invalid GSTIN junk — ignore.
- Confidence **0–100** — product must define pass threshold (not in this page).
- Images may be large (base64/URLs) — confirm storage/PII retention.
- Endpoint-Ip Provided = **N**.

### OpenAPI notes

- Spec title: `face-liveness` v1.0
- Server: `https://api.instantpay.in/identity/faceLiveness` · Path: `POST /getSessionResult`
- `operationId`: `identity-verification-ai-ml-face-liveness-get-session-result`
- 200 example / schema = Create Session leftover ⚠️
- `400` = GSTIN ⚠️

### Related

- Face Liveness Overview (#2) · Create Session (#3)

---

## 5. DigiLocker — Overview

**Title (provider):** Digilocker

Secure, standardized interface to access/manage **digital documents** issued by Indian government agencies and organizations via **DigiLocker**.

### Process flow

| Step | Action | Detail |
|------|--------|--------|
| **1** | Validate DigiLocker registration | **Verify Account** API — mobile or AES Aadhaar |
| | → Generate URL | If account exists → `userFlow` = **`SIGNIN`**. If not → `userFlow` = **`SIGNUP`** (overview said `user`; Create URL API uses **`userFlow`**) |
| | SIGNUP URL | User creates DigiLocker account with Aadhaar or mobile |
| | SIGNIN URL | User logs in with Aadhaar or mobile, then PIN or OTP |
| **2** | Document selection + redirect | After auth, user picks document (**PAN**, **Aadhaar**, or **APAAR ID** — provider text “Appaar ID”) → redirect to **callback URL** from Generate URL API |
| **3** | Verification Status API | Confirm authorization completed |
| **4** | Fetch Documents | If status = **`AUTHORIZED`** → fetch PAN or Driving Licence via Fetch Documents API |

### Verification status values

| Status | Meaning |
|--------|---------|
| `PENDING` | User has not completed verification |
| `AUTHORIZED` | User logged in and gave consent |
| `EXPIRED` | Link expired before completion |
| `CONSENT_DENIED` | User rejected consent |

### Capabilities (from overview)

| Item | Detail |
|------|--------|
| **Product area** | Digital KYC → Digital Locker → DigiLocker |
| **Docs mentioned** | PAN, Aadhaar, APAAR ID (select); Fetch API called out for **PAN** or **Driving Licence** |
| **Auth modes** | SIGNIN / SIGNUP via Generate URL |
| **Callback** | Partner callback URL after document selection |

> Overview only — Generate URL / Verification Status / Fetch Documents REST pages not in this paste.

### Gotchas

- Provider spelling **Digilocker** / **Appaar ID** — treat APAAR as intended; confirm doc types on Fetch API paste.
- Step 4 text says fetch **PAN or Driving Licence** after AUTHORIZED, while Step 2 also lists **Aadhaar** / APAAR — confirm which docs Fetch Documents supports.
- Flow order: validate → generate URL (`SIGNIN`/`SIGNUP`) → user journey → status poll → fetch only if `AUTHORIZED`.
- Separate from Face Liveness and Profile Enrichment.

### Related

- Generate URL / Verification Status / Fetch Documents (paste next)

---

## 6. DigiLocker — Create URL

Creates DigiLocker **SIGNUP / SIGNIN** journey URL; returns `referenceId` + `url` + initial `status`.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/digiLocker` |
| **OpenAPI operationId** | `post_mobileaddressLookupoint-1` ⚠️ (wrong — leftover) |
| **Summary** | “Copy of ” ⚠️ (empty/wrong) |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `externalRef` | String | Mandatory | Your unique transaction id |
| `redirectionUrl` | String | Mandatory | Partner redirect after sign-up / sign-in |
| `userFlow` | String | Mandatory | **`SIGNUP`** or **`SIGNIN`** |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |

> Overview (#5) said pass **`user`** = SIGNIN/SIGNUP. This API field is **`userFlow`** — trust Create URL param table.

### Sample request

> Provider sample used broken `postman request` + leaked secrets — cleaned curl below.

```bash
curl --location --request POST 'https://api.instantpay.in/identity/digiLocker' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "externalRef": "Vincenzo",
  "userFlow": "SIGNUP",
  "redirectionUrl": "https://www.example.com/digilocker/callback",
  "latitude": "-67.6942",
  "longitude": "130.6086"
}'
```

```http
POST /identity/digiLocker HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "externalRef": "Vincenzo",
  "userFlow": "SIGNUP",
  "redirectionUrl": "https://www.example.com/digilocker/callback",
  "latitude": "-67.6942",
  "longitude": "130.6086"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Success",
  "data": {
    "referenceId": "69368e58ac0102180406d47c",
    "url": "sample_URL",
    "status": "PENDING"
  },
  "timestamp": "2025-12-08 14:07:44",
  "ipay_uuid": "h000a08adef3-952f-4bf7-b467-31ec0aa6ae4e-kX1kf7MIXqQL",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `referenceId` | DigiLocker session / journey id — use for Status / Fetch |
| `url` | URL to open for user DigiLocker flow (sample shows placeholder `sample_URL`) |
| `status` | Initial journey status — sample **`PENDING`** |

### Gotchas

- Field name is **`userFlow`**, not overview’s `user`.
- Provider curl is invalid (`postman request`, `--body`); secrets leaked — sanitized.
- Sample `data.url: "sample_URL"` looks like placeholder / echo of request `redirectionUrl` — live should return DigiLocker hosted URL; confirm on staging.
- No `pool` / `orderid` in sample — confirm fee model.
- OpenAPI nearly empty (`summary: "Copy of "`, wrong `operationId`, no request schema) — trust param table + curl.
- Lat/long sample placeholders (Antarctic / ocean) — use real coords.
- After redirect to `redirectionUrl`, call Verification Status with `referenceId` (API TBD).

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /digiLocker`
- `operationId`: `post_mobileaddressLookupoint-1` ⚠️
- Summary: “Copy of ” ⚠️ · 200 body empty in spec

### Related

- DigiLocker Overview (#5) · Verification Status / Fetch Documents (next)

---

## 7. DigiLocker — Verification Status

Poll DigiLocker journey status after Create URL / callback. Use Create URL **`referenceId`**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/digiLocker/status` |
| **OpenAPI operationId** | `post_mobileaddressLookupoint-1-1` ⚠️ |
| **Summary** | “Copy of Copy of ” ⚠️ |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `referenceId` | String | Mandatory | From Create URL `data.referenceId` |

### Possible `data.status` values

| Status | Meaning |
|--------|---------|
| `PENDING` | User has not completed verification |
| `AUTHORIZED` | User logged in and gave consent |
| `EXPIRED` | Link expired before completion |
| `CONSENT_DENIED` | User rejected consent |

### Sample request

> Provider sample: broken `postman request` + leaked secrets — cleaned.

```bash
curl --location --request POST 'https://api.instantpay.in/identity/digiLocker/status' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "referenceId": "69368e58ac0102180406d47c"
}'
```

```http
POST /identity/digiLocker/status HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "referenceId": "69368e58ac0102180406d47c"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Success",
  "data": {
    "status": "AUTHORIZED",
    "referenceId": "69368e58ac0102180406d47c",
    "externalRef": "Vladimir",
    "userDetails": {
      "name": "Pradeep",
      "mobile": "767XXXXXX77",
      "dob": "1990-02-02",
      "gender": "M",
      "eaadhaar": "Y"
    }
  },
  "timestamp": "2025-12-08 14:08:56",
  "ipay_uuid": "h000a08adf60-d5c0-47f9-b764-bb42792d2f99-EFBURInlug8d",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

> Provider sample mobile masked above (`767XXXXXX77`); treat `userDetails` as PII.

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `status` | Journey status (`AUTHORIZED` in sample) |
| `referenceId` | Echo of DigiLocker journey id |
| `externalRef` | Partner ref from Create URL |
| `userDetails` | Present when authorized — `name`, `mobile`, `dob`, `gender`, `eaadhaar` |

### Gotchas

- Path is **`/identity/digiLocker/status`** — OpenAPI x-readme **http** sample wrongly posts to `/identity/digiLocker` (Create URL path) with only `referenceId` — trust curl URL with `/status`.
- Request sample `referenceId` (`692e742e…`) ≠ response (`69368e58…`) — provider mismatched examples.
- Broken `postman request` / `--body`; secrets leaked — sanitized.
- OpenAPI empty junk (`Copy of Copy of `, wrong operationId).
- Only fetch documents when `data.status === "AUTHORIZED"`.
- `userDetails.eaadhaar` is `"Y"`/`N`-style flag — confirm meaning.
- No pool / `orderid` in sample.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /digiLocker/status`
- x-readme http sample path wrong (missing `/status`) ⚠️
- `operationId`: `post_mobileaddressLookupoint-1-1` ⚠️

### Related

- Create URL (#6) · Fetch Documents (next) · Overview (#5)

---

## 8. DigiLocker — Fetch Document

Fetch a selected DigiLocker document after Verification Status = **`AUTHORIZED`**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/digiLocker/document` |
| **OpenAPI operationId** | `post_mobileaddressLookupoint-1-1-1` ⚠️ |
| **Summary** | “Copy of Copy of Copy of ” ⚠️ |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request parameters

> Published param table is a **Create URL copy-paste** (`externalRef`, `redirectionUrl`, lat/long). **Ignore it.** Trust curl/sample body:

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `referenceId` | String | Mandatory | From Create URL / Status |
| `documentType` | String | Mandatory | Sample **`PAN`** (overview also mentions DL / Aadhaar / APAAR — confirm enum) |

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/identity/digiLocker/document' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "referenceId": "69368e58ac0102180406d47c",
  "documentType": "PAN"
}'
```

```http
POST /identity/digiLocker/document HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "referenceId": "69368e58ac0102180406d47c",
  "documentType": "PAN"
}
```

> Provider http sample path wrongly `/identity/digiLocker`; OpenAPI x-readme curl wrongly hits `/digiLocker/status`. Secrets sanitized.

### Sample success response (`documentType: PAN`)

> `base64File` truncated — PDF base64 (`JVBERi0x…` = `%PDF-1.`). Masked PAN in archive.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Success",
  "data": {
    "pan": "BRQPPXXXXB",
    "panType": "Individual",
    "nameOnPan": "PRADEEP",
    "gender": "MALE",
    "dob": "02-02-1990",
    "base64File": "JVBERi0xLjcKJeLjz9MK…(PDF base64 truncated)…"
  },
  "timestamp": "2025-12-08 14:09:39",
  "ipay_uuid": "h000a08adf9f-0e33-4462-981a-a1b00f7510a7-6URq7LqTnJTi",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights (PAN sample)

| Field | Description |
|-------|-------------|
| `pan` | PAN number |
| `panType` | e.g. `Individual` |
| `nameOnPan` | Name on PAN |
| `gender` | e.g. `MALE` (Status API used `M`) |
| `dob` | `DD-MM-YYYY` in sample |
| `base64File` | Document file as base64 (PDF in sample) |

> Other `documentType` values likely return different `data` shapes — capture DL/Aadhaar/APAAR on staging.

### Gotchas

- **Param table wrong** (Create URL fields) — use `referenceId` + `documentType`.
- Path: **`/identity/digiLocker/document`** — http sample and OpenAPI samples point at wrong paths (`/digiLocker`, `/status`).
- Call only after Status = **`AUTHORIZED`**.
- `base64File` can be huge — truncate in logs; store securely (PII).
- PAN/`nameOnPan`/`dob` are PII — sanitized in archive samples.
- Gender casing differs vs Status (`MALE` vs `M`).
- DOB format `DD-MM-YYYY` here vs Status `YYYY-MM-DD` — normalize carefully.
- OpenAPI junk (`Copy of Copy of Copy of `, wrong operationId).
- No pool / `orderid` in sample — confirm fee.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /digiLocker/document`
- x-readme samples: wrong URLs ⚠️
- `operationId`: `post_mobileaddressLookupoint-1-1-1` ⚠️

### Related

- Overview (#5) · Create URL (#6) · Verification Status (#7)

---

## 9. DigiLocker — Verify Account

Check whether a **mobile** or **Aadhaar** already has a DigiLocker account. Use result to choose Create URL `userFlow`: **`SIGNIN`** (exists) vs **`SIGNUP`** (does not).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/digiLocker/verifyAccount` |
| **OpenAPI operationId** | `post_mobileaddressLookupoint-1-1-1-1` ⚠️ |
| **Summary** | “Copy of Copy of Copy of Copy of ” ⚠️ |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `externalRef` | String | Mandatory | Your unique transaction id |
| `mobile` | String | Optional* | User mobile — **either mobile or aadhaar** |
| `aadhaarNumber` | String | Optional* | Aadhaar **AES-256 encrypted** (provider typo: “nummber”) |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |

\* Enter **either** `mobile` **or** `aadhaarNumber` (not both required). Sample comment wrongly says “aadhaar or PAN”.

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/identity/digiLocker/verifyAccount' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "externalRef": "Ida",
  "latitude": "23.1117",
  "longitude": "-75.9203",
  "mobile": "784568XXXX",
  "aadhaarNumber": ""
}'
```

```http
POST /identity/digiLocker/verifyAccount HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "externalRef": "Ida",
  "latitude": "23.1117",
  "longitude": "-75.9203",
  "mobile": "784568XXXX",
  "aadhaarNumber": ""
}
```

> Provider samples: broken `postman request`, invalid `//` JSON comments, Postman `{{$random…}}` placeholders, leaked secrets — cleaned/masked above.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Success",
  "data": {
    "status": "ACCOUNT_EXISTS",
    "digilockerId": "8326bb95-0f01-55c0-b669-a2d69636caa2"
  },
  "timestamp": "2025-12-08 14:10:56",
  "ipay_uuid": "h000a08ae018-2b60-4188-8654-a4172a5b023d-6UZDNJ1NhluK",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `status` | Sample **`ACCOUNT_EXISTS`** — confirm other values (e.g. not found) on staging |
| `digilockerId` | DigiLocker account UUID when exists |

### Gotchas

- Overview Step 1 API — call **before** Create URL to pick `SIGNIN` vs `SIGNUP`.
- `aadhaarNumber` must be **AES-256** encrypted (same pattern as Asset Verification / OKYC) — plaintext Aadhaar will fail.
- Either-or: `mobile` **or** `aadhaarNumber`; sample comment “or PAN” is wrong.
- Provider response block labeled as `curl` — it’s JSON.
- Only documented success status: `ACCOUNT_EXISTS` — capture “no account” response for SIGNUP path.
- OpenAPI junk summary/operationId; empty 200 schema.
- No pool / `orderid` in sample.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /digiLocker/verifyAccount`
- `operationId`: `post_mobileaddressLookupoint-1-1-1-1` ⚠️
- Summary: “Copy of …” ×4 ⚠️

### Related

- DigiLocker Overview (#5) · Create URL (#6)

---
