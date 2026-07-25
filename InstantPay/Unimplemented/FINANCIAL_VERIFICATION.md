# InstantPay — Financial Verifications

> Raw InstantPay Financial Verifications docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`FINANCIAL_VERIFICATION_DETAILS.md`](FINANCIAL_VERIFICATION_DETAILS.md). Jab implement ho → root `InstantPay/FINANCIAL_VERIFICATION.md` (AEPS-style) banega.

**Provider:** InstantPay (Financial Verifications)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (when APIs paste)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Confirm per page |

### Common response envelope

| Parameter | Type | Description |
|-----------|------|-------------|
| `statuscode` | String | InstantPay Status Code |
| `actcode` | String | Action Code |
| `status` | String/Array | Status message |
| `data` | Object/String | Response Data (if present) |
| `timestamp` | String | Response time (`YYYY-MM-DD HH:II:SS`) |
| `ipay_uuid` | String | Request reference number |
| `orderid` | String | Transaction Id (null if not a transaction) |
| `environment` | String | Live / Sandbox |
| `internalCode` | String | Usually null |

---

## Service-wise status

> Sidebar order under **FINANCIAL VERIFICATIONS**. Profile Enrichment archived under Digital KYC (updated from this nav paste: **`taxIdNumber` + `preFillData`**).

| # | Service | InstantPay endpoint / area | Status |
|---|---------|------------------------------|--------|
| 1 | PEP & Sanctions Search — Overview | Product overview (no REST on this page) | 📄 Docs captured |
| 2 | PEP — Search Profile | `GET /identity/sanctions/search` | 📄 Docs captured |
| 3 | PEP — Profile Details | `GET /identity/sanctions/profile/{id}` | 📄 Docs captured |
| 4 | Bank Account Verification — Overview | Suite overview (Bank List · Penny Less · Verify · UPI · BIN · IFSC) | 📄 Docs captured |
| 5 | Bank List | `GET /identity/verifyBankAccount/banks` | 📄 Docs captured |
| 6 | Verify Bank Account | `POST /identity/verifyBankAccount` | 📄 Docs captured |
| 7 | VPA Verification | `POST /identity/verifyBankAccount` (VPA in `payee.accountNumber`) | 📄 Docs captured |
| 8 | Card BIN Checker | `POST /identity/binChecker` | 📄 Docs captured |
| 9 | IFSC Lookup | `GET /identity/ifsc` | 📄 Docs captured |
| — | Profile Enrichment | `POST /identity/fetchProfile` | ✅ Updated [`DIGITAL_KYC.md`](DIGITAL_KYC.md) #1 (`taxIdNumber` + `preFillData`, fee ~4.72) |
| 10 | Credit Report | `POST` | ⏳ Pending (re-paste if needed) |
| 11 | Credit Score Simulator — Overview | Product overview (no REST on this page) | 📄 Docs captured |
| 12 | Credit Score Simulator — CS01 | `POST /identity/creditScoreSimulator` | 📄 Docs captured |
| 13 | Credit Score Simulator — CS02 | `POST /identity/creditScoreSimulator/scoreSimulation` | 📄 Docs captured |

---

## 1. PEP & Sanctions Search — Overview

**Title (provider):** PEP & Sanctions Search

Politically Exposed Person (**PEP**) API — access and verify information about individuals who are (or were) **politically exposed**, plus **family members** and **close associates**.

### Who counts as PEP (provider)

Positions may include:

- Heads of state
- Government officials
- Judicial or military officials
- Senior executives of state-owned corporations
- Important political party officials

…including past holders of such roles, and related family / associates.

### Capabilities (from overview)

| Capability | Detail |
|------------|--------|
| **Identification and Verification** | Check whether an individual is classified as a PEP via databases (government lists, international orgs, proprietary sources) |
| **Risk Assessment** | Assess risk from position, country of residence, nature of public function |
| **Continuous Monitoring** | Ongoing alerts on PEP status changes (new appointments, political status, sanctions-list updates) |
| **Data Integration** | Integrate into existing systems for automated checks and compliance workflows |

### Positioning

| Item | Detail |
|------|--------|
| **Product area** | Financial Verifications → PEP & Sanctions Search |
| **Purpose** | Due diligence, regulatory compliance, mitigate risk of dealing with PEPs |
| **Related APIs (sidebar)** | **Search Profile** (`GET`) · **Profile Details** (`GET`) |

> Overview only — no endpoint / sample on this page. APIs: Search Profile (#2), Profile Details (#3).

### Gotchas

- Overview describes **monitoring** and **sanctions** — Search/Details use `/identity/sanctions/…`; confirm topic codes beyond `role.pep`.
- Distinct from DigiLocker / Face Liveness / Profile Enrichment (Identity / Digital KYC).

### Related

- PEP Search Profile (#2)
- PEP Profile Details (#3)

---

## 2. PEP — Search Profile

Search politically exposed entities by **full name or aliases**.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/identity/sanctions/search` |
| **OpenAPI operationId** | `identity-verification-pep-sanctions-search-search-profile` |
| **Summary** | Search Profile |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Sample also sends `X-Ipay-Request-Hash`, `X-Ipay-Request-Timestamp`, `X-Ipay-Hash-Check: OFF`, `User-Agent` — not in param table. Confirm if hash headers required in live vs sandbox.

### Request parameters (query string)

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `queryText` | String | Mandatory | Full name or known aliases |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (sample `y`) |
| `limit` | String | Optional | Max results to return |
| `offset` | String | Optional | Result offset (pagination) |

> OpenAPI incorrectly puts these in **`requestBody`** and adds unused `target` — **trust query-string sample**. This is a **GET**.

### Sample request

> Provider samples: broken `{{clientId}` braces, leaked secrets, empty `offset=` — cleaned below.

```bash
curl --location 'https://api.instantpay.in/identity/sanctions/search?queryText=Yadav&consent=y&latitude=0&longitude=0&externalRef=1716180614&limit=10&offset=0' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{ipAddress}}' \
--header 'X-Ipay-Hash-Check: OFF'
```

```http
GET /identity/sanctions/search?queryText=Yadav&consent=y&latitude=0&longitude=0&externalRef=1716180569&limit=10&offset=0 HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{ipAddress}}
X-Ipay-Hash-Check: OFF
```

### Sample success response

> Sample hit is a public political figure (illustrative). Truncated multilingual `name` / `alias` arrays in archive where noisy.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "searchData": {
      "limit": 10,
      "offset": 0,
      "total": { "value": 1, "relation": "eq" },
      "results": [
        {
          "id": "Q122304",
          "caption": "Nitish Kumar",
          "schema": "Person",
          "properties": {
            "keywords": ["State government", "National government"],
            "name": ["Nitish Kumar", "नीतिश कुमार", "…"],
            "alias": ["…"],
            "wikidataId": ["Q122304"],
            "position": [
              "Chief Minister of Bihar (2015-)",
              "Member of the 11th Lok Sabha"
            ],
            "topics": ["role.pep"],
            "country": ["in"],
            "birthDate": ["1951-03-01"],
            "nationality": ["in"],
            "notes": ["Indian politician and Current Chief Minister of Bihar"]
          },
          "target": true,
          "firstSeen": "2023-04-20T10:30:17",
          "lastSeen": "2024-05-19T12:48:01",
          "lastChange": "2024-05-08T00:47:01"
        }
      ],
      "facets": {
        "topics": {
          "label": "Topics",
          "values": [{ "name": "role.pep", "label": "Politican", "count": 1 }]
        },
        "countries": {
          "label": "Countries",
          "values": [{ "name": "in", "label": "India", "count": 1 }]
        }
      }
    },
    "poolReferenceId": "1240520094857ZNSYR",
    "pool": {
      "openingBal": "23.64",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "23.64"
    }
  },
  "timestamp": "2024-05-20 09:48:57",
  "ipay_uuid": "h0059c15e665-84b9-422b-9baa-6324f0284ecc-zFCN75SrVyTx",
  "orderid": "1240520094857ZNSYR",
  "environment": "LIVE"
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `searchData.results[].id` | Entity id (sample Wikidata-style `Q122304`) — likely key for Profile Details |
| `caption` / `schema` | Display name + type (`Person`) |
| `properties.topics` | e.g. `role.pep` |
| `properties.position` / `country` / `birthDate` | PEP context |
| `facets` | Aggregates (topics, countries) — label typo **Politican** |
| `pool` / `poolReferenceId` | Sample fee `amount: "0.00"` DR; `orderid` = pool ref |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample **string** |
| `data` | Table says String — sample **object** |

### Gotchas

- Path is **`/identity/sanctions/search`** under Identity family — product nav says Financial Verifications / PEP.
- **GET + query params** — ignore OpenAPI `requestBody` / extra `target` field.
- `consent` mandatory (sample `y`) — confirm accepted values (`Y`/`y`/`true`).
- Sample `latitude`/`longitude` = `0` — use real end-customer coords in prod.
- Empty `offset=` in provider sample — send `0` or omit if optional works.
- Hash headers in samples with `Hash-Check: OFF` — confirm live requirement.
- Secrets leaked in provider http sample — sanitized.
- Facet label typo `Politican` — match on `name: "role.pep"` not English label.
- Pool `0.00` — confirm billing on search vs details.
- Use `results[].id` as path param for Profile Details (#3).

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `GET /sanctions/search`
- `operationId`: `identity-verification-pep-sanctions-search-search-profile`
- Wrong: GET with `requestBody` ⚠️
- `400` → `{}`

### Related

- Overview (#1) · Profile Details (#3)

---

## 3. PEP — Profile Details

Fetch full entity profile for a PEP/sanctions hit using the **`id`** from Search Profile (`results[].id`).

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/identity/sanctions/profile/{id}` |
| **OpenAPI operationId** | `identity-verification-pep-sanctions-search-profile-details` |
| **Summary** | Profile Details |
| **OpenAPI title** | `identity` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

### Request parameters

**Path**

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `id` | String | Mandatory | Entity id from Search (`results[].id`), e.g. `Q30252299` |

> Param table omits path `id`. OpenAPI path is wrongly `/sanctions/profile` with **no** `{id}` — **trust curl**.

**Query string**

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (sample `y`) |

> OpenAPI again puts query fields in **`requestBody`** — ignore; this is a **GET**.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/sanctions/profile/Q30252299?consent=y&latitude=0&longitude=0&externalRef=1715943599' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{ipAddress}}'
```

```http
GET /identity/sanctions/profile/Q30252299?consent=y&latitude=0&longitude=0&externalRef=1715943599 HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{ipAddress}}
```

### Sample success response

> Public political figure sample (illustrative). Nested `positionOccupancies` kept; truncate further in logs if needed.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "entityData": {
      "id": "Q30252299",
      "caption": "Sangram Yadav",
      "schema": "Person",
      "properties": {
        "topics": ["role.pep"],
        "wikidataId": ["Q30252299"],
        "gender": ["male"],
        "position": ["Member of the Uttar Pradesh Legislative Assembly"],
        "name": ["Sangram Yadav"],
        "nationality": ["in"],
        "notes": ["Indian politician"],
        "keywords": ["State government"],
        "birthDate": ["1971-10-03"],
        "modifiedAt": ["2023-12-21"],
        "country": ["in"],
        "positionOccupancies": [
          {
            "id": "wd-da16de6531c7bbc83ea227673bc80d251ddb32dc",
            "caption": "Occupancy",
            "schema": "Occupancy",
            "properties": {
              "holder": ["Q30252299"],
              "status": ["unknown"],
              "post": [
                {
                  "id": "Q18039836",
                  "caption": "Member of the Uttar Pradesh Legislative Assembly",
                  "schema": "Position",
                  "properties": {
                    "topics": ["gov.state"],
                    "country": ["in"],
                    "wikidataId": ["Q18039836"],
                    "name": ["Member of the Uttar Pradesh Legislative Assembly"]
                  },
                  "target": false,
                  "firstSeen": "2023-09-08T07:00:40",
                  "lastSeen": "2024-05-19T13:37:33",
                  "lastChange": "2023-12-22T14:40:54"
                }
              ]
            },
            "target": false,
            "firstSeen": "2023-09-08T07:00:40",
            "lastSeen": "2024-05-19T12:48:01",
            "lastChange": "2023-09-08T07:00:40"
          }
        ]
      },
      "target": true,
      "firstSeen": "2023-04-20T10:30:17",
      "lastSeen": "2024-05-19T12:48:01",
      "lastChange": "2024-01-31T00:47:01"
    },
    "poolReferenceId": "1240520102224FJADQ",
    "pool": {
      "openingBal": "23.64",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "23.64"
    }
  },
  "timestamp": "2024-05-20 10:22:24",
  "ipay_uuid": "h0059c15f25a-636b-4273-95b3-2c3e44ee87f8-STG9NGfDA808",
  "orderid": "1240520102224FJADQ",
  "environment": "LIVE"
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `entityData.id` | Same Wikidata-style id as Search |
| `caption` / `schema` | Display name + `Person` |
| `properties.topics` | e.g. `role.pep` |
| `properties.position` / `birthDate` / `country` | Profile fields (arrays) |
| `properties.positionOccupancies` | Nested occupancy + `post` Position entities (`gov.state`) |
| `pool` / `orderid` | Sample fee `0.00` DR |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample **string** |
| `data` | Table says String — sample **object** |

### Gotchas

- Path: **`/identity/sanctions/profile/{id}`** — `id` from Search `results[].id`.
- OpenAPI path missing `{id}`; GET + fake `requestBody` — trust curl.
- Param table has no path param — still required.
- No hash headers in this sample (Search had optional hash headers).
- Sample lat/long `0` — use real coords.
- Nested `positionOccupancies` can be deep — store selectively.
- Pool `0.00` again — confirm fee on search vs details vs both.
- `target: true` on entity vs `false` on nested occupancy/post — confirm semantics.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Documented path: `GET /sanctions/profile` ⚠️ missing `{id}`
- Actual: `GET /sanctions/profile/{id}`
- `operationId`: `identity-verification-pep-sanctions-search-profile-details`
- `400` → `{}`

### Related

- Overview (#1) · Search Profile (#2)

---

## 4. Bank Account Verification — Overview

**Title (provider):** Overview

Secure transactions with Instantpay’s **Financial Verification API Suite** — tools for fast, safe financial data validation (fewer errors / fraud).

### Six key features (provider)

| Feature (provider name) | Likely sidebar / API | Notes |
|-------------------------|----------------------|--------|
| **Bank List** | Bank List (`GET`) | #5 |
| **Penny Less** | Flag on Bank List: `impsPennyLess` | Verify without ₹1 credit; see #5 callout |
| **Verify Bank Account** | Verify Bank Account (`POST`) | #6 — penny drop and/or penny less |
| **Verify UPI Handle** | VPA Verification (`POST`) | #7 |
| **Card BIN Checker** | Card BIN Checker (`POST`) | #8 |
| **IFSC Lookup** | IFSC Lookup (`GET`) | #9 |

### Positioning

| Item | Detail |
|------|--------|
| **Product area** | Financial Verifications → Bank Account Verification (Overview) |
| **Goal** | Validate financial data; secure / efficient settlement ecosystem |
| **Audience** | Businesses needing accurate, trustworthy txn checks |

> Overview / marketing page only — no endpoint. Bank List (#5) and Verify Bank Account (#6) follow.

### Gotchas

- Page title is generic **Overview**; copy describes the **whole Financial Verification suite**, not only bank-account verify.
- **Penny Less** = verify without ₹1 credit; capability per bank via `impsPennyLess` on Bank List (#5).
- **Verify UPI Handle** = sidebar **VPA Verification**.
- Separate from PEP / sanctions (#1–#3) and from Digital KYC Profile Enrichment.

### Related

- Bank List (#5)
- Verify Bank Account (#6) · VPA (#7) · BIN (#8) · IFSC (#9)

---

## 5. Bank List

List banks for beneficiary / transfer / verify flows. Includes per-bank IFSC sample and IMPS / penny-less capability flags.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/identity/verifyBankAccount/banks` |
| **OpenAPI operationId** | `financial-verification-bank-account-verification-bank-list` |
| **Summary** | Bank List |
| **OpenAPI title** | `bank-list-1` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP (partner-supplied) |

### Request parameters

None (headers only).

### Sample request

> Secrets in provider http sample — sanitized.

```bash
curl --location 'https://api.instantpay.in/identity/verifyBankAccount/banks' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}'
```

```http
GET /identity/verifyBankAccount/banks HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
```

### Sample success response

> Provider returns a **very large** `data` array (hundreds of banks). Archive shows a few rows only — call live API / cache for full list.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Banks fetched successfully",
  "data": [
    {
      "bankId": 109005,
      "name": "STATE BANK OF INDIA",
      "ifscGlobal": "SBIN0000001",
      "impsEnabled": 1,
      "upiEnabled": 0,
      "impsPennyLess": 1
    },
    {
      "bankId": 64597,
      "name": "IndusInd Bank",
      "ifscGlobal": "INDB0000001",
      "impsEnabled": 1,
      "upiEnabled": 0,
      "impsPennyLess": 1
    },
    {
      "bankId": 91606,
      "name": "UNION BANK OF INDIA",
      "ifscGlobal": "UBIN0550451",
      "impsEnabled": 1,
      "upiEnabled": 0,
      "impsPennyLess": 0
    }
  ],
  "timestamp": "2024-09-09 09:46:59",
  "ipay_uuid": "h0009cf733eb-649c-4762-bd8a-a32810afbb7e-kIZYbHrlTbZg",
  "orderid": null,
  "environment": "LIVE"
}
```

### Response `data[]` fields

| Field | Description |
|-------|-------------|
| `bankId` | InstantPay bank id (number) |
| `name` | Bank display name |
| `ifscGlobal` | Sample / global IFSC (sometimes empty string) |
| `impsEnabled` | `0` \| `1` — IMPS / penny-drop eligibility |
| `upiEnabled` | `0` \| `1` — sample rows mostly `0` |
| `impsPennyLess` | `0` \| `1` — penny-less eligibility |

### Provider callout (penny drop vs penny less)

| Term | Meaning |
|------|---------|
| **Penny drop** | Validate account by crediting **₹1** |
| **Penny less** | Validate **without** crediting ₹1 |
| `impsEnabled = 0` | Cannot initiate penny drop (no IMPS) |
| `impsEnabled = 1` | Penny drop allowed |
| `impsPennyLess = 0` | Cannot initiate penny-less |
| `impsPennyLess = 1` | Penny-less allowed |

### Gotchas

- Path under **`/identity/verifyBankAccount/banks`** — Identity family, Financial Verifications nav.
- **No query/body** — GET with headers only.
- Endpoint-Ip Provided = **N**.
- Full payload is huge — cache server-side; do not ship entire list to mobile every time.
- Some `ifscGlobal` values are `""` — handle empty.
- Sample `upiEnabled: 0` on majors — confirm meaning vs VPA Verification API.
- Resolves overview **Penny Less** as bank capability flag, not a separate REST page.
- Secrets leaked in provider sample — sanitized.
- No `pool` / `orderid` in sample — likely free list call; confirm.

### OpenAPI notes

- Spec title: `bank-list-1` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `GET /verifyBankAccount/banks`
- `operationId`: `financial-verification-bank-account-verification-bank-list`
- `400` → `{}`

### Related

- Suite Overview (#4) · Verify Bank Account (#6)

---

## 6. Verify Bank Account

Returns bank account holder **name** from **account number + IFSC**. Works for IMPS & UPI-enabled banks (per Bank List flags).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyBankAccount` |
| **OpenAPI operationId** | `bank-account-verifcation-upi-vpa` ⚠️ (wrong — VPA leftover) |
| **Summary** | OpenAPI wrongly says “Verify UPI Handle (VPA)” ⚠️ |
| **OpenAPI title** | `bank-account-validation` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (docs typo: “Auth Code -1”) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP (docs wrongly label “Unique secret key”) |

### Request parameters

| Parameter | Type | M/O | Description |
|-----------|------|-----|-------------|
| `payee.name` | String | O | Beneficiary name — required for `nameMatchPercent` in response |
| `payee.accountNumber` | String | M | End-user account number |
| `payee.bankIfsc` | String | M | Bank IFSC |
| `externalRef` | String | M | Your unique transaction id |
| `consent` | String | M | Always **`Y`** |
| `pennyDrop` | String | M | **`YES`** \| **`NO`** \| **`AUTO`** |
| `latitude` | String | M | End customer lat (4 decimal degrees) |
| `longitude` | String | M | End customer long (4 decimal degrees) |

> HTTP sample also shows `beneBank` — **not** in param table; ignore unless confirmed on staging.

### `pennyDrop` behaviour (provider note)

| Value | Behaviour |
|-------|-----------|
| `YES` | Verify via bank; **₹1 credited** (penny drop) |
| `NO` | Verify via bank; **₹1 not credited** (penny less) |
| `AUTO` | Check InstantPay server first; if not found → penny less (no ₹1) |
| Re-verify `YES` within **24h** | From 2nd call onward, ₹1 **not** credited again |
| Response `isPennyDrop` | `true` = penny drop used; `false` = penny less |

> Prefer Bank List `impsEnabled` / `impsPennyLess` before choosing mode (#5).

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/identity/verifyBankAccount' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "payee": {
    "name": "Instantpay India",
    "accountNumber": "7770007428585742",
    "bankIfsc": "YESB0CMSNOC"
  },
  "externalRef": "123456789",
  "consent": "Y",
  "pennyDrop": "YES",
  "latitude": "20.5936",
  "longitude": "78.9628"
}'
```

```http
POST /identity/verifyBankAccount HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "payee": {
    "name": "Instantpay India",
    "accountNumber": "7770007428585742",
    "bankIfsc": "YESB0CMSNOC"
  },
  "externalRef": "123456789",
  "consent": "Y",
  "pennyDrop": "YES",
  "latitude": "20.5936",
  "longitude": "78.9628"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "123456789",
    "poolReferenceId": "1240315102923AFEFN",
    "txnValue": "0.00",
    "txnReferenceId": "407510310584",
    "pool": {
      "account": "7428585742",
      "openingBal": "20.10",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "20.10"
    },
    "payer": {
      "account": "7428585742",
      "name": "Instantpay India Limited"
    },
    "payee": {
      "name": "Instantpay India Ltd",
      "account": "7770007428585742",
      "ifsc": "YESB0CMSNOC",
      "type": "",
      "mccCode": "",
      "merchantOnboardingType": "",
      "merchantGenre": "",
      "accountType": "",
      "iin": "",
      "nameMatchPercent": 96.83
    },
    "isCached": false,
    "isPennyDrop": false
  },
  "timestamp": "2024-03-15 10:29:24",
  "ipay_uuid": "h0059b912fe7-ac74-49f4-9f25-d9af53d89411-wOLLeQN8MiZ0",
  "orderid": "1240315102923AFEFN",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `payee.name` | Name at bank |
| `payee.nameMatchPercent` | Present if request sent `payee.name` |
| `isPennyDrop` | Whether this call used penny drop |
| `isCached` | Cached result flag |
| `pool` / `poolReferenceId` / `orderid` | Wallet / txn refs (sample fee `0.00`) |
| `txnReferenceId` | Bank/txn reference |

### Name match percent bands (provider)

| Range | Result |
|-------|--------|
| 100 | Exact Match |
| 85.00–99.00 | Close Match |
| 60.00–84.00 | Moderate Match |
| 34.00–59.00 | Poor Match |
| 1–33.00 | No Match |

### Sandbox test accounts

> Sandbox: any IFSC OK. Wallet debit refunded T+1 for these test txns.

| `accountNumber` | Result |
|-----------------|--------|
| `1111111111` | Transaction Successful |
| `0000000000` | Transaction Under Process |
| Any other | Transaction Failed |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `data` | Table says Array — sample **object** |

### Gotchas

- OpenAPI page is **copy-paste of VPA** (wrong summary, operationId, example with VPA as `accountNumber`, `bankIfsc: "0"`, missing `pennyDrop`) — **trust param table + main curl**.
- Nested `payee` object — not flat fields.
- Header table mislabels Endpoint-Ip as “secret key”; Auth “-1” typo.
- Sample response has `pennyDrop: YES` request but `isPennyDrop: false` — 24h re-verify / AUTO / cache may explain; confirm on staging.
- Pass `payee.name` to get `nameMatchPercent`.
- Use Bank List flags before `YES` vs `NO`.
- Distinct from upcoming VPA Verification (#7).

### OpenAPI notes

- Spec title: `bank-account-validation` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /verifyBankAccount`
- Summary / `operationId` / samples = **VPA junk** ⚠️
- `400` → `{}`

### Related

- Bank List (#5) · Suite Overview (#4) · VPA Verification (#7)

---

## 7. VPA Verification

UPI **VPA** verification — returns account holder **name** from a VPA (UPI id). Same InstantPay path as Verify Bank Account (#6); input is a VPA string instead of bank account number.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyBankAccount` |
| **OpenAPI operationId** | `bank-account-verifcation-upi-vpa` |
| **Summary** | Verify UPI Handle (VPA) |
| **OpenAPI title** | `bank-account-validation` v1.0 |

> **Same URL as #6.** Differentiate by putting the **VPA** in `payee.accountNumber` (e.g. `ipay.109564@icici`).

### Headers

Same as #6 (Auth / Client-Id / Client-Secret / Endpoint-Ip). Endpoint-Ip typically **N** on bank-verify family.

### Request parameters

| Parameter | Type | M/O | Description |
|-----------|------|-----|-------------|
| `payee` | Object* | M | Payee details (*table says Array — sample is **object**) |
| `payee.accountNumber` | String | M | **UPI id / VPA** of the payee |
| `payee.name` | String | O† | Sample includes name (for match %); not in this page’s table |
| `payee.bankIfsc` | String | O† | Sample uses `""` or `"0"`; table lists top-level `bankIfsc` |
| `bankIfsc` | String | O | Table top-level — confirm vs nested `payee.bankIfsc` |
| `externalRef` | String | M | Unique reference |
| `consent` | String | M | `Y` / `N` |
| `pennyDrop` | String | M‡ | Table says **`YES`** only — sample **omits** it |
| `isCached` | String | ? | In sample (`"0"`) — **not** in param table |
| `latitude` / `longitude` | String | M | Current location |

† Sample fields · ‡ Param table vs sample mismatch — confirm on staging.

### Sample request

> Provider JSON missing comma after `payee.name` — **invalid**; fixed below. Prefer OpenAPI x-readme sample shape.

```bash
curl --location --request POST 'https://api.instantpay.in/identity/verifyBankAccount' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "payee": {
    "name": "Instantpay India",
    "accountNumber": "ipay.109564@icici",
    "bankIfsc": ""
  },
  "externalRef": "PPT223",
  "consent": "Y",
  "isCached": "0",
  "latitude": "21.3436",
  "longitude": "70.8738"
}'
```

```http
POST /identity/verifyBankAccount HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "payee": {
    "name": "Instantpay India",
    "accountNumber": "ipay.109564@icici",
    "bankIfsc": ""
  },
  "externalRef": "PPT223",
  "consent": "Y",
  "isCached": "0",
  "latitude": "21.3436",
  "longitude": "70.8738"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "1732171930",
    "poolReferenceId": "1241121122210WSZUX",
    "txnValue": "0.00",
    "txnReferenceId": "00",
    "pool": {
      "account": "9876543210",
      "openingBal": "11.99",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "11.99"
    },
    "payer": {
      "account": "9876543210",
      "name": "SHAHBAZ STORE"
    },
    "payee": {
      "name": "Instantpay India Ltd",
      "account": "ipay.109564@icici",
      "ifsc": "ICIC0000104",
      "type": "",
      "mccCode": "0000",
      "merchantOnboardingType": "",
      "merchantGenre": "",
      "accountType": "SAVINGS",
      "iin": "",
      "nameMatchPercent": 96
    },
    "isCached": false,
    "isPennyDrop": false
  },
  "timestamp": "2024-11-21 12:22:11",
  "ipay_uuid": "h0009d8a4542-a4ca-4ba3-913c-a435a27ae0cc-QrdVY5UL0ll4",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response highlights

Same envelope as #6: `payee.name`, `payee.account` (echo VPA), resolved `ifsc`, optional `nameMatchPercent`, `isCached`, `isPennyDrop`, `pool`.

### Gotchas

- **Same endpoint** as Verify Bank Account — do not invent a separate path.
- Detect mode by input: VPA (`user@psp`) vs numeric account + real IFSC.
- Param table: `payee` typed as Array — sample **object**.
- Table requires `pennyDrop: YES`; sample uses `isCached` and **no** `pennyDrop` — confirm required fields on staging.
- Broken JSON in provider sample (missing comma).
- `bankIfsc` empty / `"0"` in samples for VPA.
- `orderid` null in sample (unlike some bank-verify samples).
- Name-match bands from #6 still apply if `payee.name` sent.

### OpenAPI notes

- Same spec as #6 (`bank-account-validation`) — this page’s OpenAPI summary correctly describes VPA.
- Path: `POST /verifyBankAccount`
- `operationId`: `bank-account-verifcation-upi-vpa`

### Related

- Verify Bank Account (#6) · Card BIN Checker (#8)

---

## 8. Card BIN Checker

Lookup **Bank Identification Number (BIN)** — first 6 digits of a card — against InstantPay’s near-daily BIN database: confirm BIN exists, issuing bank, card network/type.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/binChecker` |
| **OpenAPI operationId** | `financial-verification-bank-account-verification-card-bin-checker` |
| **Summary** | Card BIN Checker |
| **OpenAPI title** | `card-bin-checker` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |
| `X-Ipay-Outlet-Id` | String | ? | — | In sample curl — **not** in header table; confirm if required |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `binNumber` | String | Mandatory | Credit card **first 6 digits** |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |

### Sample request

> Secrets in provider http sample — sanitized.

```bash
curl --location --request POST 'https://api.instantpay.in/identity/binChecker' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'X-Ipay-Outlet-Id: {{outletID}}' \
--data-raw '{
  "binNumber": "346593",
  "latitude": "38.8951",
  "longitude": "77.0364",
  "externalRef": "3484-dsajkfj-33"
}'
```

```http
POST /identity/binChecker HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
X-Ipay-Outlet-Id: {{outletID}}

{
  "binNumber": "346593",
  "latitude": "38.8951",
  "longitude": "77.0364",
  "externalRef": "3484-dsajkfj-33"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "3484-dsajkfj-33",
    "pool": {
      "account": "7428585742",
      "openingBal": "381.45",
      "mode": "DR",
      "amount": "0.59",
      "closingBal": "380.86"
    },
    "binDetails": {
      "bin": "346590",
      "cardNetwork": "AMERICAN EXPRESS",
      "cardType": "CREDIT",
      "cardLevel": "",
      "isoCountryName": "UNITED STATES",
      "isoCountryA2": "US",
      "issuerBank": "",
      "issuerWebsite": "",
      "issuerPhone": "",
      "cardTransfer": "F"
    }
  },
  "timestamp": "2022-11-23 14:36:06",
  "ipay_uuid": "h06897cff5ba-5b1d-4ff0-8f09-0b59c8446895",
  "orderid": "1221123143606CCERP",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data.binDetails` fields

| Field | Description |
|-------|-------------|
| `bin` | Matched BIN (sample `346590` vs request `346593` — confirm matching rules) |
| `cardNetwork` | e.g. `AMERICAN EXPRESS` |
| `cardType` | e.g. `CREDIT` |
| `cardLevel` | May be empty |
| `isoCountryName` / `isoCountryA2` | Issuer country |
| `issuerBank` / `issuerWebsite` / `issuerPhone` | May be **blank** |
| `cardTransfer` | Sample `"F"` — confirm enum |

### Provider callout

> Verify **`issuerBank`** before starting a transaction if it is incorrect or **blank** in the response.

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `data` | Table says Array — sample **object** |
| `binDetails` | Table lists as top-level — sample is **`data.binDetails`** |
| `enviroment` | Table typo — sample `environment` |

### Gotchas

- Path: **`/identity/binChecker`** (not under `verifyBankAccount`).
- Chargeable — sample `pool.amount: "0.59"`.
- `X-Ipay-Outlet-Id` in samples only — confirm required.
- Endpoint-Ip Provided = **N**.
- Request BIN vs response `bin` may differ slightly — confirm.
- Empty `issuerBank` is expected sometimes — product must handle / block.
- Secrets leaked — sanitized.
- Sample lat/long look like US coords — use real end-customer.

### OpenAPI notes

- Spec title: `card-bin-checker` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /binChecker`
- `operationId`: `financial-verification-bank-account-verification-card-bin-checker`
- `400` → `{}`

### Related

- Suite Overview (#4) · IFSC Lookup (#9)

---

## 9. IFSC Lookup

Verify an **IFSC** and resolve bank branch details for accurate fund transfers.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/identity/ifsc` |
| **OpenAPI operationId** | `financial-verification-bank-account-verification-ifsc-lookup` |
| **Summary** | IFSC Lookup |
| **OpenAPI title** | `ifsc` v1.0 |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **Y** | End-customer IP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `ifsc` | String | Mandatory | IFSC code of the bank |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Unique transaction id |

> Samples send these as a **JSON body on GET** (and OpenAPI `requestBody`). Many HTTP clients drop GET bodies — confirm on staging whether **query string** also works.

### Sample request

> Provider samples: broken/truncated curl, leaked secrets, numeric lat/long — cleaned/stringified below.

```bash
curl --location --request GET 'https://api.instantpay.in/identity/ifsc' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "ifsc": "ABHY0065002",
  "latitude": "0.90",
  "longitude": "99.0",
  "externalRef": "ngf8985ngjfn"
}'
```

```http
GET /identity/ifsc HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "ifsc": "ABHY0065002",
  "latitude": "0.90",
  "longitude": "99.0",
  "externalRef": "ngf8985ngjfn"
}
```

### Sample success response

> Provider paste had `{{` typo at start — fixed. Sandbox names prefixed with `"1 "` (artifact).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1230621161230BRZBJ",
    "pool": {
      "account": "7428585742",
      "openingBal": "987.61",
      "mode": "DR",
      "amount": "0.59",
      "closingBal": "987.02"
    },
    "ifscDetails": {
      "ifsc": "ABHY0065002",
      "bankName": "1 ABHYUDAYA COOPERATIVE BANK LIMITED",
      "branchName": "1 ABHYUDAYA COOPERATIVE BANK LIMITED",
      "branchAddress": "1 KMSPM'S SCHOOL, WADIA ESTATE, BAIL BAZAR-KURLA(W), MUMBAI-400070",
      "branchPincode": 400070,
      "branchArea1": "1 MUMBAI",
      "branchArea2": "1 GREATER MUMBAI",
      "branchState": "1 MAHARASHTRA"
    }
  },
  "timestamp": "2023-06-21 16:12:30",
  "ipay_uuid": "h00099768add-1475-48f2-95dd-1f450c7dbf3e",
  "orderid": "1230621161230BRZBJ",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data.ifscDetails` fields

| Field | Description |
|-------|-------------|
| `ifsc` | Echo / normalized IFSC |
| `bankName` | Bank name |
| `branchName` | Branch name |
| `branchAddress` | Full address |
| `branchPincode` | Number in sample |
| `branchArea1` / `branchArea2` | City / metro-style areas |
| `branchState` | State |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample **string** |
| `data` | Table says String — sample **object** |

### Gotchas

- Path: **`GET /identity/ifsc`**.
- **GET + JSON body** is fragile — confirm query-param alternative on staging.
- Chargeable — sample fee **`0.59`** (same as Card BIN sample).
- Endpoint-Ip Provided = **Y** (unlike BIN/Bank List N).
- Sandbox string prefixes `"1 "` on name/address fields — strip/ignore in tests.
- Provider sample JSON had leading `{{` — invalid.
- Secrets leaked — sanitized.
- Completes suite overview features: Bank List · Verify · VPA · BIN · IFSC (+ Penny Less via #5/#6 flags).

### OpenAPI notes

- Spec title: `ifsc` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `GET /ifsc`
- `operationId`: `financial-verification-bank-account-verification-ifsc-lookup`
- GET with `requestBody` ⚠️
- `400` → `{}`

### Related

- Card BIN (#8) · Suite Overview (#4) · Profile Enrichment (Digital KYC #1, updated) · Credit Report (#10) · Credit Score Simulator (#11+)

---

## Profile Enrichment (Financial Verifications nav)

> Full archive: [`DIGITAL_KYC.md`](DIGITAL_KYC.md) #1 — updated from this sidebar paste.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/fetchProfile` |
| **Body** | `name`, `mobileNumber`, **`taxIdNumber` (PAN)**, `inquiryPurposeCode`, `latitude`, `longitude`, `externalRef` |
| **Success shape** | `data.preFillData` (name/DOB/gender/income/IDs/addresses/phones) + `pool` (~**4.72**) |
| **Ignore** | Intro + OpenAPI (Bank List / Credit Score Simulator junk) |
| **Still missing** | `inquiryPurposeCode` purpose table (image placeholder) |

---

## 11. Credit Score Simulator — Overview

**Title (provider):** Credit Score Simulator

A **Credit Score Simulation** API — estimate how a credit score **may** change based on **hypothetical** financial actions, **without** impacting the actual credit score. Aimed at lenders, fintech platforms, and end users who want potential credit-behaviour outcomes before taking real actions.

### Key use cases (provider)

| Use case | Detail |
|----------|--------|
| Simulate impact | Loan repayment, late payment, or new credit |
| In-app “what-if” | Show scenarios to customers inside apps |
| Pre-qualification / risk awareness | Without hard credit checks |

### Key benefits (provider)

| Benefit | Detail |
|---------|--------|
| No real bureau hit | Simulation does not hard-pull the live score |
| Instant range | Score **range** estimation (not necessarily exact score) |
| Planning | Improves user financial planning / decision-making |

### Positioning

| Item | Detail |
|------|--------|
| **Product area** | Financial Verifications → Credit Score Simulator |
| **Purpose** | Soft / hypothetical score impact — not a live bureau pull |
| **Related APIs (sidebar)** | **CS01** (`POST /identity/creditScoreSimulator`) · **CS02** (`POST …/scoreSimulation`) |
| **Vs Credit Report (#10)** | Report = actual bureau data; Simulator = CS01 profile + CS02 what-if |

> Overview / marketing page only — no endpoint / sample on this page. APIs: CS01 (#12), CS02 (#13).

### Gotchas

- Distinct from **Credit Report** (#10) — do not treat simulator responses as live bureau truth.
- Flow is **two-step**: CS01 → `scenarioNo` → CS02 with hypothetical account knobs → text `decision`.
- Confirm consent / purpose-code tables once partner clarifies image placeholders.

### Related

- Credit Report (#10 — pending)
- CS01 (#12) · CS02 (#13)

---

## 12. Credit Score Simulator — CS01

Fetch / simulate credit profile data for what-if flows. Returns rich `simulatorData` (personal, IDs, addresses, phones, retail accounts, **ERS score**, enquiry history).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/creditScoreSimulator` |
| **OpenAPI operationId** | `credit-score-simulator-cs01` |
| **Summary** | CS01 |
| **OpenAPI title** | `bank-list-1` v1.0 ⚠️ (wrong — Bank List leftover) |

> Provider samples use `Host: api.localhost` — treat live base as **`https://api.instantpay.in`**. Intro + OpenAPI response examples are **Bank List junk** — ignore; trust param table + main sample response.

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
| `name` | String | Mandatory | User’s name |
| `mobileNumber` | String | Mandatory | User mobile |
| `dob` | String | Mandatory | Date of birth (sample `YYYY-MM-DD`) |
| `inquiryPurposeCode` | String | Mandatory | Purpose of enquiry — **table is image placeholder** (sample `"01"`) |
| `gender` | String | Mandatory | `M` \| `F` \| `T` |
| `homeAddress` | Array | Optional | Address array (table) |
| `addressLine1` / `addressLine2` / `locality` / `city` / `state` / `postal` | String | Optional | Address fields (table lists flat) |
| `taxIdNumber` | String | Optional | PAN |
| `drivingLicenseNumber` | String | Optional | DL |
| `voterIdNumber` | String | Optional | Voter ID |
| `passportNumber` | String | Optional | Passport |
| `rationCardNumber` | String | Optional | Ration card |
| `otherID` | String | Optional | Any other ID |
| `latitude` / `longitude` | String | Mandatory | Transaction location |
| `consent` | String | Mandatory | `Y` / `N` |
| `externalRef` | String | Mandatory | Unique client txn id |

> **Sample body shape differs from table:** nested `"address": { addressLine1, … }` object (not flat fields / `homeAddress` array). Sample also **omits `consent`** though table marks it Mandatory — confirm on staging.

### Sample request

> PII masked. Production host (not `api.localhost`).

```bash
curl --location 'https://api.instantpay.in/identity/creditScoreSimulator' \
--header 'X-Ipay-Endpoint-Ip: {{endpointIP}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'Content-Type: application/json' \
--data '{
  "name": "RAHUL NEGI",
  "mobileNumber": "9XXXXXXXXX",
  "inquiryPurposeCode": "01",
  "dob": "1990-07-27",
  "gender": "M",
  "address": {
    "addressLine1": "[masked office address]",
    "addressLine2": "",
    "locality": "",
    "city": "",
    "state": "MH",
    "postal": "411014"
  },
  "taxIdNumber": "XXXXX0460H",
  "latitude": "11.10",
  "longitude": "26.91",
  "consent": "Y",
  "externalRef": "1770870974"
}'
```

```http
POST /identity/creditScoreSimulator HTTP/1.1
Host: api.instantpay.in
X-Ipay-Endpoint-Ip: {{endpointIP}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Auth-Code: 1
Content-Type: application/json

{
  "name": "RAHUL NEGI",
  "mobileNumber": "9XXXXXXXXX",
  "inquiryPurposeCode": "01",
  "dob": "1990-07-27",
  "gender": "M",
  "address": {
    "addressLine1": "[masked office address]",
    "addressLine2": "",
    "locality": "",
    "city": "",
    "state": "MH",
    "postal": "411014"
  },
  "taxIdNumber": "XXXXX0460H",
  "latitude": "11.10",
  "longitude": "26.91",
  "consent": "Y",
  "externalRef": "1770870974"
}
```

### Sample success response

> Sandbox sample. Fee **`pool.amount: "20.00"`**. `enquiries[]` had **200+** rows in provider paste — archive keeps a few + `enquirySummary`. PII / account numbers masked.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1260211102831HDWVQ",
    "pool": {
      "openingBal": "999.28",
      "mode": "DR",
      "amount": "20.00",
      "closingBal": "979.28"
    },
    "simulatorData": {
      "scenarioNo": "18488294",
      "personalInfo": {
        "fullName": "RAHUL NEGI ",
        "firstName": "RAHUL ",
        "middleName": "",
        "lastName": "NEGI ",
        "gender": "M",
        "dob": "27-07-1990",
        "age": "35",
        "totalIncome": "19600"
      },
      "identityInfo": {
        "panNumber": "XXXXX0460H",
        "voterIdNumber": "",
        "aadhaarNumber": "",
        "driverLicense": "UK14XXXXXXXXXX"
      },
      "addresses": [
        {
          "fullAddress": "[masked]",
          "state": "MH",
          "postalCode": "411001",
          "type": "Office"
        },
        {
          "fullAddress": "[masked]",
          "state": "MH",
          "postalCode": "411014",
          "type": "Primary"
        },
        {
          "fullAddress": "[masked]",
          "state": "UL",
          "postalCode": "249201",
          "type": "Permanent"
        }
      ],
      "phones": [
        { "number": "XXXXXXXXXX", "type": "M" },
        { "number": "XXXXXXXXXX", "type": "H" }
      ],
      "emails": [{ "email": "user@example.com" }],
      "retailAccounts": [
        {
          "sequence": "1",
          "accountNumber": "[masked]",
          "institution": "Fullerton India Credit Company Ltd.",
          "accountType": "Personal Loan",
          "ownershipType": "Individual",
          "balance": "152185",
          "pastDueAmount": "0",
          "sanctionAmount": "206517",
          "lastPaymentDate": "2018-01-20",
          "dateOpened": "2016-05-19",
          "open": "Yes",
          "accountStatus": "Current Account",
          "source": "INDIVIDUAL"
        },
        {
          "sequence": "2",
          "accountNumber": "[masked]",
          "institution": "ICICI BANK LIMITED",
          "accountType": "Credit Card",
          "balance": "93640",
          "pastDueAmount": "7760",
          "creditLimit": "85000",
          "accountStatus": "1-29 days past due",
          "open": "Yes",
          "source": "INDIVIDUAL"
        }
      ],
      "accountSummary": {
        "totalAccounts": "4",
        "activeAccounts": "4",
        "totalPastDue": "15561.00",
        "highestCredit": "97998.00",
        "highestSanction": "336000.00",
        "totalBalanceAmount": "447873.00",
        "totalSanctionAmount": "542517.00",
        "totalMonthlyPayment": "4993.00"
      },
      "scores": [
        { "type": "ERS", "name": "ERS4.0", "version": "4.0", "value": "656" }
      ],
      "enquiries": [
        {
          "sequence": "1",
          "institution": "Indusind Bank Limited",
          "date": "2025-07-30",
          "time": "11:36",
          "requestPurpose": "10"
        },
        {
          "sequence": "191",
          "institution": "State Bank of Mysore",
          "date": "2019-07-10",
          "time": "15:55",
          "requestPurpose": "01"
        }
      ],
      "enquirySummary": {
        "total": "343",
        "past30Days": "0",
        "past12Months": "2",
        "past24Months": "2",
        "recent": "2025-07-30"
      },
      "otherIndicators": {
        "ageOfOldestTrade": "165",
        "openTrades": "0"
      },
      "recentActivities": {
        "accountsDelinquent": "0",
        "accountsOpened": "0",
        "totalInquiries": "0",
        "accountsUpdated": "0"
      }
    }
  },
  "timestamp": "2026-02-11 15:58:31",
  "ipay_uuid": "h000a10dc888-ea11-4b35-9996-6c18707e6f87-GJa6Zgl8X1RN",
  "orderid": "1260211102831HDWVQ",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data.simulatorData` highlights

| Field | Description |
|-------|-------------|
| `scenarioNo` | Scenario / report id for this pull |
| `personalInfo` | Name parts, gender, DOB, age, `totalIncome` |
| `identityInfo` | PAN, voter, aadhaar, DL (may be enriched beyond request) |
| `addresses[]` | Typed addresses (`Office` / `Primary` / `Permanent`) |
| `phones[]` / `emails[]` | Contact list (`type`: `M`/`H`/`T`) |
| `retailAccounts[]` | Trade lines — balances, past due, status, limits |
| `accountSummary` | Aggregates across accounts |
| `scores[]` | Sample: ERS 4.0 **value `656`** (single score, not a range) |
| `enquiries[]` | Very large history — prefer `enquirySummary` for UI |
| `enquirySummary` | totals + recent window counts |
| `otherIndicators` / `recentActivities` | Trade age / recent activity flags |
| `pool.amount` | Sample fee **`20.00`** DR |

### Gotchas

- Intro + OpenAPI = **Bank List** copy-paste — wrong title, wrong 200 example (`Banks fetched successfully` + bank array).
- Live URL: **`POST /identity/creditScoreSimulator`** on `api.instantpay.in` (samples say `api.localhost`).
- `inquiryPurposeCode` purpose table = **image only** — still missing (same gap as Profile Enrichment); sample `"01"`.
- Param table: flat address / `homeAddress` Array; sample: nested **`address` object**.
- `consent` Mandatory in table but **missing** from provider sample — send `Y`/`N` until confirmed optional.
- Overview promised “score **range**” / no bureau hit — CS01 sample returns a **single ERS score** plus full trade/enquiry dump; confirm product messaging vs Credit Report (#10).
- Response can be **huge** (`enquiries` 200–300+) — truncate/store selectively; fee ~**20.00**.
- Heavy PII in response — mask in logs / UI.
- Distinct from CS02 (#13).

### OpenAPI notes

- Spec title: `bank-list-1` v1.0 ⚠️
- Server: `https://api.instantpay.in/identity` · Path: `POST /creditScoreSimulator`
- `operationId`: `credit-score-simulator-cs01`
- Description + `200` example = Bank List junk ⚠️
- `x-readme` code-samples match the real CS01 curl (use those, not schema example)
- `400` → `{}`

### Related

- Overview (#11) · CS02 (#13) · Credit Report (#10) · Profile Enrichment (Digital KYC #1)

---

## 13. Credit Score Simulator — CS02

**What-if score simulation** using `scenarioNo` from CS01. Sends hypothetical account knobs (sanction / overdue / balance / close / limit / utilization) and returns a short **decision** string (e.g. “Increase by 23 points”).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/creditScoreSimulator/scoreSimulation` |
| **OpenAPI operationId** | `credit-score-simulator` |
| **Summary** | OpenAPI wrongly says “Copy of Copy of Bank List” ⚠️ |
| **OpenAPI title** | `bank-list-1` v1.0 ⚠️ |

> Intro + OpenAPI 200 example = **Bank List junk**. Trust param table + main curl/response.

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
| `name` | String | Mandatory | User’s name |
| `mobileNumber` | String | Mandatory | User mobile |
| `scenarioNo` | String | Mandatory | From **CS01** response (`simulatorData.scenarioNo`) |
| `dob` | String | Mandatory | Date of birth |
| `inquiryPurposeCode` | String | Mandatory | Purpose — table = image (sample `"01"`) |
| `gender` | String | Mandatory | `M` \| `F` \| `T` |
| `address` | Array* | Mandatory | Table says Array; sample is **object** |
| `addressLine1` | String | Mandatory | Line 1 |
| `addressLine2` / `locality` / `city` | String | Optional | |
| `state` / `postal` | String | Mandatory | State + postal |
| `sanctionedAmount` | String | Mandatory | Sanctioned amount (what-if) |
| `overdueAmount` | String | Mandatory | Overdue amount |
| `currentBalance` | String | Mandatory | Current balance |
| `closeAccount` | String | Mandatory | `Y` \| `N` — whether account is closed |
| `increaseLimit` | String | Mandatory | Increased limit |
| `utilization` | String | Mandatory | Utilization to apply |
| `taxIdNumber` | String | Mandatory | PAN (**Mandatory** here; optional on CS01) |
| `latitude` / `longitude` | String | Mandatory | Location |
| `externalRef` | String | Mandatory | Unique client txn id |

> No `consent` in this page’s param table (CS01 listed it). Curl/http samples nest address as object; curl sample `state: "MH"` vs http sample `state: "DL"` for same Delhi postal — prefer consistent state codes.

### Sample request

> PII masked.

```bash
curl --location 'https://api.instantpay.in/identity/creditScoreSimulator/scoreSimulation' \
--header 'X-Ipay-Endpoint-Ip: {{endpointIP}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'Content-Type: application/json' \
--data '{
  "name": "RAHUL NEGI",
  "mobileNumber": "9XXXXXXXXX",
  "inquiryPurposeCode": "01",
  "scenarioNo": "18488294",
  "dob": "1990-12-27",
  "gender": "M",
  "address": {
    "addressLine1": "[masked]",
    "addressLine2": "",
    "locality": "",
    "city": "New Delhi",
    "state": "DL",
    "postal": "110076"
  },
  "sanctionedAmount": "1000",
  "overdueAmount": "5000",
  "currentBalance": "9000",
  "closeAccount": "Y",
  "increaseLimit": "2000",
  "utilization": "10",
  "taxIdNumber": "XXXXX1234F",
  "latitude": "11.10",
  "longitude": "26.91",
  "externalRef": "1770811797"
}'
```

```http
POST /identity/creditScoreSimulator/scoreSimulation HTTP/1.1
Host: api.instantpay.in
X-Ipay-Endpoint-Ip: {{endpointIP}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Auth-Code: 1
Content-Type: application/json

{
  "name": "RAHUL NEGI",
  "mobileNumber": "9XXXXXXXXX",
  "inquiryPurposeCode": "01",
  "scenarioNo": "18488294",
  "dob": "1990-12-27",
  "gender": "M",
  "address": {
    "addressLine1": "[masked]",
    "addressLine2": "",
    "locality": "",
    "city": "New Delhi",
    "state": "DL",
    "postal": "110076"
  },
  "sanctionedAmount": "1000",
  "overdueAmount": "5000",
  "currentBalance": "9000",
  "closeAccount": "Y",
  "increaseLimit": "2000",
  "utilization": "10",
  "taxIdNumber": "XXXXX1234F",
  "latitude": "11.10",
  "longitude": "26.91",
  "externalRef": "1770811797"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1260211105621HXPCU",
    "pool": {
      "openingBal": "999.28",
      "mode": "DR",
      "amount": "20.00",
      "closingBal": "979.28"
    },
    "scoreSimulationData": {
      "decision": "Increase by 23 points"
    }
  },
  "timestamp": "2026-02-11 16:26:21",
  "ipay_uuid": "h000a10dd27c-c9d6-4276-8a57-53b7c2500e45-JUU0wSmMtXWq",
  "orderid": "1260211105621HXPCU",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response highlights

| Field | Description |
|-------|-------------|
| `data.scoreSimulationData.decision` | Human-readable impact, e.g. `"Increase by 23 points"` |
| `data.pool.amount` | Sample fee **`20.00`** (same as CS01 sample) |
| `orderid` / `poolReferenceId` | Wallet / txn refs |

### Gotchas

- **Depends on CS01** — must pass `scenarioNo` from CS01 `simulatorData.scenarioNo`.
- Path is **`…/creditScoreSimulator/scoreSimulation`** (not the same as CS01 root).
- This is the real “what-if” step; CS01 returns full profile + baseline ERS score.
- `taxIdNumber` **Mandatory** on CS02 (optional on CS01).
- `address` typed as Array in table — sample **object** (same CS01 pattern).
- No `consent` on this page — confirm if still required.
- `inquiryPurposeCode` table still image-only.
- OpenAPI summary “Copy of Copy of Bank List” + bank-list 200 example — ignore.
- Curl vs HTTP sample disagree on `state` (`MH` vs `DL`) — use correct state for city/postal.
- Decision is free text — parse carefully for UX (or display as-is).

### OpenAPI notes

- Spec title: `bank-list-1` v1.0 ⚠️
- Server: `https://api.instantpay.in/identity` · Path: `POST /creditScoreSimulator/scoreSimulation`
- `operationId`: `credit-score-simulator`
- Summary / description / schema example = Bank List junk ⚠️
- `x-readme` samples match real CS02 curl
- `400` → `{}`

### Related

- Overview (#11) · CS01 (#12) · Credit Report (#10 — still pending)

---
