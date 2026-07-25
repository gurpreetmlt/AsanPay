# InstantPay — Mobile Based Verifications

> Raw InstantPay Mobile Based Verifications docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`MOBILE_BASED_VERIFICATIONS_DETAILS.md`](MOBILE_BASED_VERIFICATIONS_DETAILS.md). Jab implement ho → root `InstantPay/MOBILE_BASED_VERIFICATIONS.md` (AEPS-style) banega.

**Provider:** InstantPay (Mobile Based Verifications)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (when APIs paste)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Y on Address/Name · **N** on VPA Lookup (still send) |

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
| `internalCode` | String | Usually null (sample may echo status text) |

---

## Service-wise status

> Sidebar order under **MOBILE BASED VERIFICATIONS** — fill as pages paste.

| # | Service | InstantPay endpoint / area | Status |
|---|---------|------------------------------|--------|
| 1 | Mobile to Address Lookup | `POST /identity/mobile/addressLookup` | 📄 Docs captured |
| 2 | Mobile to UPI VPA Lookup | `POST /identity/mobile/vpaLookup` | 📄 Docs captured |
| 3 | Mobile to Name Lookup | `POST /identity/mobile/nameLookup` | 📄 Docs captured |
| 4 | Mobile to Profile | `POST /identity/mobile/dataLookup` | 📄 Docs captured |
| 5 | Mobile to PAN | `POST /identity/mobile/panLookup` | 📄 Docs captured |
| 6 | Mobile Number to EPFO UAN | `POST /identity/corporateEmpCheck` | 📄 Docs captured |

---

## 1. Mobile to Address Lookup

**Title (provider):** Mobile to Address Lookup

Lookup address(es) linked to a **mobile number** (ranked list + quality insights).

> **Docs pollution:** Provider page description, consent callout, and OpenAPI `operationId` / description are **copy-pasted from Voter ID Verification** (EPIC / Election Commission). **Ignore** that prose — trust title, path `/mobile/addressLookup`, request params, and response shape.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/mobile/addressLookup` |
| **OpenAPI operationId** | `post_verifyVoterId-2` (**wrong** — Voter ID leftover) |
| **Summary** | Mobile to Address Lookup |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/mobile/addressLookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `mobileNumber` | String | Mandatory | Mobile number |
| `latitude` | String / Number | Mandatory | End customer latitude (sample = JSON **number**) |
| `longitude` | String / Number | Mandatory | End customer longitude (sample = JSON **number**) |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

### Sample request

> Masked mobiles in archive. OpenAPI code-sample leaked secrets + a real-looking mobile — **placeholders only**.

```bash
curl --location 'https://api.instantpay.in/identity/mobile/addressLookup' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "mobileNumber": "xxxxxxxxxx",
  "consent": "Y",
  "externalRef": "1758870994",
  "latitude": 0.99,
  "longitude": 38
}'
```

```http
POST /identity/mobile/addressLookup HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "mobileNumber": "XXXXXXX78",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

### Sample success response

> SANDBOX. PII / pin fragments masked as in provider sample (`1100XX`, `Full Name`).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "addressData": {
      "fullName": "Full Name",
      "addresses": [
        {
          "addressRank": 1,
          "addressDetails": {
            "address": " FLOOR BLOCK J1 DDA",
            "locality": "FLAT KALKAJI DELHI 1100XX DL",
            "city": null,
            "district": null,
            "state": "DELHI (NCT)",
            "country": "INDIA",
            "pincode": "1100XX"
          },
          "addressInsights": {
            "reportedDate": null,
            "lastActivityDate": null,
            "addressMatchScore": 0,
            "addressMatchIndex": null,
            "addressQuality": {
              "level": "VERY GOOD",
              "missing": []
            }
          }
        },
        {
          "addressRank": 2,
          "addressDetails": {
            "address": " SARAI DUBEY KOIL  OPPOSITE",
            "locality": "GREAT PLAZA ALIGARH 2020XX UP",
            "city": null,
            "district": null,
            "state": "UTTAR PRADESH",
            "country": "INDIA",
            "pincode": "2020XX"
          },
          "addressInsights": {
            "reportedDate": null,
            "lastActivityDate": null,
            "addressMatchScore": 0,
            "addressMatchIndex": null,
            "addressQuality": {
              "level": "GOOD",
              "missing": []
            }
          }
        }
      ]
    },
    "poolReferenceId": "1260615044155QMQPA",
    "pool": {
      "account": "7505684294",
      "openingBal": "99917686.68",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "99917686.68"
    }
  },
  "timestamp": "2026-06-15 10:12:20",
  "ipay_uuid": "h000a206be9e-521b-4736-b20b-691aceb29bff-0Vat61XhW8tN",
  "orderid": "1260615044155QMQPA",
  "environment": "SANDBOX",
  "internalCode": "Transaction Successful"
}
```

### Response notes (`data.addressData`)

| Field | Notes |
|-------|-------|
| `fullName` | Name linked to mobile (sample placeholder) |
| `addresses[]` | Ranked list (`addressRank`) |
| `.addressDetails` | `address`, `locality`, `city`, `district`, `state`, `country`, `pincode` — city/district may be `null` |
| `.addressInsights` | dates, `addressMatchScore`, `addressQuality.level` (e.g. VERY GOOD / GOOD), `missing[]` |
| Pool | `mode: DR`, sample fee **`0.00`** (sandbox); confirm live |
| `internalCode` | Sample echoes `"Transaction Successful"` (not always null) |

### Consent (provider callout — polluted)

> Provider shows Voter ID consent text on this page. Treat as **wrong copy**. Implement consent for **mobile / address lookup** per product/legal; sample body uses `"consent": "Y"`.

### Gotchas

- Page marketing + OpenAPI description + `operationId` = **Voter ID** leftovers — do not implement as EPIC verify.
- Consent callout mentions Voter ID — ignore wording; still send `consent`.
- Lat/long OpenAPI `string`, sample **numbers** — coerce safely.
- Fee sample `0.00` may be sandbox-only.
- Distinct from Location Services Reverse Geocoding / PIN Lookup (those take coords/PIN, not mobile).

### Related

- Mobile to UPI VPA Lookup (#2)
- Next Mobile Based Verifications sidebar pages (pending paste)

---

## 2. Mobile to UPI VPA Lookup

**Title (provider):** Mobile to UPI VPA Lookup

**Summary:** Fetch UPI VPA from mobile number.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/mobile/vpaLookup` |
| **OpenAPI operationId** | `get_mobilevpaLookup` (name says get; method is **POST**) |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/mobile/vpaLookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP — still required on request |

> Also send `Accept: application/json`, `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `mobileNumber` | String | Mandatory | UPI-linked mobile number |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | String | Mandatory (`Y` or `N`) | Customer consent |
| `latitude` | String / Number | Mandatory | End customer latitude (sample = JSON **number**) |
| `longitude` | String / Number | Mandatory | End customer longitude (sample = JSON **number**) |

### Sample request

> Secrets masked. Sample mobile `9876543210` is illustrative.

```bash
curl --location 'https://api.instantpay.in/identity/mobile/vpaLookup' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "mobileNumber": "9876543210",
  "consent": "Y",
  "externalRef": "1757650497",
  "latitude": 72.9999,
  "longitude": 38.1223
}'
```

```http
POST /identity/mobile/vpaLookup HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "mobileNumber": "9876543210",
  "consent": "Y",
  "externalRef": "1757650544",
  "latitude": 72.9999,
  "longitude": 38.1223
}
```

### Sample success response

> LIVE sample. Provider JSON had a trailing comma after `accountHolderName` — cleaned below.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "vpaData": {
      "vpa": "md.shah1234@ybl",
      "accountHolderName": "MD SHAHBAZ ALI"
    },
    "poolReferenceId": "1250919165418QCSDS",
    "pool": {
      "openingBal": "20.33",
      "mode": "DR",
      "amount": "3.54",
      "closingBal": "16.79"
    }
  },
  "timestamp": "2025-09-19 16:54:18",
  "ipay_uuid": "h0009fea2bc7-6b7d-4991-897a-313272a52c58-IyW1rl3JmWwx",
  "orderid": "1250919165418QCSDS",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes (`data.vpaData`)

| Field | Notes |
|-------|-------|
| `vpa` | UPI VPA string |
| `accountHolderName` | Name on VPA |
| Pool | `mode: DR`, sample fee **`3.54`** (LIVE); no `account` field in this sample |
| Success | `statuscode: TXN` |

### Gotchas

- Header `X-Ipay-Endpoint-Ip` = **M** but Provided by IPAY = **N** (caller supplies).
- `operationId` `get_mobilevpaLookup` — still **POST**.
- OpenAPI stub has empty description / responses — trust curl + sample response.
- Distinct from FV VPA Verification (`POST /identity/verifyBankAccount` with VPA in account field) and from Mobile to Address.
- Sample lat `72.9999` looks like a longitude value — send real end-customer coords.

### Related

- Mobile to Address Lookup (#1)
- Mobile to Name Lookup (#3)
- Next sidebar pages (pending paste)

---

## 3. Mobile to Name Lookup

**Title (provider):** Mobile to Name Lookup

Look up the **owner’s name** associated with a phone number (caller identity, profile enrichment, number legitimacy).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/mobile/nameLookup` |
| **OpenAPI operationId** | `identity-name-lookup` |
| **Summary** | Mobile to Name Lookup |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/mobile/nameLookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `mobileNumber` | String / Number | Mandatory | User mobile (OpenAPI: string; sample often sends **number**) |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

### Sample request

> Secrets → placeholders. Illustrative mobile `9876543210`.

```bash
curl --location 'https://api.instantpay.in/identity/mobile/nameLookup' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "mobileNumber": "9876543210",
    "consent": "Y",
    "latitude": "11.1009",
    "longitude": "26.9119",
    "externalRef": "1729743447"
}'
```

```http
POST /identity/mobile/nameLookup HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
    "mobileNumber": "9876543210",
    "consent": "Y",
    "latitude": "11.1009",
    "longitude": "26.9119",
    "externalRef": "1729743474"
}
```

### Sample success response (LIVE page sample)

> Provider paste had a trailing comma after the root object — cleaned. `mobileLinkedName` can be **`"No Record found"`** while still `TXN` + fee charged.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "mobileLinkedName": "No Record found",
    "poolReferenceId": "1260203145658BKSJR",
    "pool": {
      "openingBal": "316977.56",
      "mode": "DR",
      "amount": "1.18",
      "closingBal": "316976.38"
    }
  },
  "timestamp": "2026-02-03 14:56:58",
  "ipay_uuid": "h000a0fd9aa6-ee6a-4fd4-963b-bdc17448d00d-GvIb5vAIAw0D",
  "orderid": "1260203145658BKSJR",
  "environment": "LIVE",
  "internalCode": null
}
```

### Alternate response shape (OpenAPI example)

> OpenAPI nests name under `data.result` and shows a hit + higher sandbox fee:

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "result": {
      "mobileLinkedName": "Ravi"
    },
    "poolReferenceId": "1241023100643TTMGX",
    "pool": {
      "openingBal": "98921.48",
      "mode": "DR",
      "amount": "2.36",
      "closingBal": "98919.12"
    }
  },
  "timestamp": "2024-10-23 15:36:43",
  "ipay_uuid": "h0009d503448-becb-4280-96e9-a97caf1a7e93-QFUQCEKHB3Rv",
  "orderid": "1241023100643TTMGX",
  "environment": "SANDBOX"
}
```

### Response notes

| Field | Notes |
|-------|-------|
| Name | Prefer **`data.mobileLinkedName`** (LIVE sample); also handle **`data.result.mobileLinkedName`** (OpenAPI) |
| Empty hit | `"No Record found"` may still return `TXN` and debit pool |
| Pool | LIVE sample fee **`1.18`**; OpenAPI sandbox example **`2.36`** |

### Consent (provider callout — polluted)

> Same Voter ID consent text as Address Lookup page — **wrong copy**. Send `consent: "Y"`; legal text for product should be mobile-name specific.

### Gotchas

- Response shape **flat vs nested** — implement tolerant parser.
- Sample request sends `mobileNumber` as JSON **number**; OpenAPI says string — accept both / stringify.
- `"No Record found"` ≠ hard failure statuscode.
- Fee varies across samples (1.18 vs 2.36).
- Distinct from Mobile to Address / VPA Lookup.

### Related

- Mobile to Address Lookup (#1)
- Mobile to UPI VPA Lookup (#2)
- Mobile to Profile (#4)
- Next sidebar pages (pending paste)

---

## 4. Mobile to Profile

**Title (provider):** Mobile to Profile

Profile enrichment from **mobile + first/last name** — returns name, DOB/age, gender, PAN, email, address list (`POST …/mobile/dataLookup`).

> **Docs pollution:** Page description, OpenAPI summary (`Copy of Mobile to Name Lookup`), `operationId` (`post_mobilenameLookup-1`), OpenAPI requestBody (`consent` only — missing `firstName`/`lastName`), OpenAPI response example (`mobileLinkedName` + pool), and Voter ID consent callout are **Name Lookup / Voter leftovers**. **Trust:** title, path `/mobile/dataLookup`, request param table, curl/HTTP samples, and the (broken) profile Sample Response fields.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/mobile/dataLookup` |
| **OpenAPI operationId** | `post_mobilenameLookup-1` (**wrong** — Name Lookup copy) |
| **OpenAPI summary** | `Copy of Mobile to Name Lookup` (ignore) |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/mobile/dataLookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `mobileNumber` | String | Mandatory | User mobile number |
| `firstName` | String | Mandatory | First name |
| `lastName` | String | Mandatory | Last name |
| `externalRef` | String | Mandatory | Unique transaction id |
| `latitude` | String / Number | Mandatory | End customer latitude (sample = JSON **number**) |
| `longitude` | String / Number | Mandatory | End customer longitude (sample = JSON **number**) |

> Param table + samples have **no `consent`**. OpenAPI schema wrongly lists `consent` and omits `firstName`/`lastName` — **ignore OpenAPI body**.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/mobile/dataLookup' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "mobileNumber": "9876543210",
  "firstName": "John",
  "lastName": "Doe",
  "externalRef": "1758870994",
  "latitude": 0.99,
  "longitude": 38
}'
```

```http
POST /identity/mobile/dataLookup HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "mobileNumber": "9876543210",
  "firstName": "John",
  "lastName": "Doe",
  "externalRef": "1758870994",
  "latitude": 0.99,
  "longitude": 38
}
```

### Sample success response (reconstructed)

> Provider Sample Response JSON was **truncated / invalid** (unclosed `address` / `result` / `data`). Reconstructed from visible fields. **No `pool` / fee** in that paste — OpenAPI’s pool/`mobileLinkedName` example is Name Lookup pollution; **do not use for Profile fee**.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "result": {
      "name": "John Doe",
      "dob": "25-1X-19XX",
      "age": "30",
      "gender": "Male",
      "pan": "ATPPXXXXXXB",
      "email": "johndoe@GMAIL.COM",
      "address": [
        {
          "first_line_of_address": "D 123 22A BLOCK D ",
          "second_line_of_address": "NEW DELHI",
          "third_line_of_address": null,
          "city": null,
          "state": "Delhi",
          "postal_code": "1100XX",
          "country_code": "IB",
          "reported_date": ""
        }
      ]
    }
  },
  "timestamp": "2024-10-23 15:36:43",
  "ipay_uuid": "h0009d503448-becb-4280-96e9-a97caf1a7e93-QFUQCEKHB3Rv",
  "orderid": "1241023100643TTMGX",
  "environment": "SANDBOX"
}
```

### Response notes (`data.result`)

| Field | Notes |
|-------|-------|
| `name` | Full name |
| `dob` / `age` / `gender` | Masked DOB in sample |
| `pan` / `email` | Masked / illustrative |
| `address[]` | Lines, city/state/postal, `country_code` (sample `"IB"`), `reported_date` |
| Pool / fee | **Unknown** from this paste — re-paste if needed |

### Consent

> Callout is Voter ID pollution. Request table/samples **omit `consent`** — do not invent unless a later paste adds it.

### Gotchas

- Path is **`dataLookup`**, not `profileLookup`.
- OpenAPI is largely a **copy of Name Lookup** — trust table + curl + profile sample fields only.
- No `consent` in working samples (unlike Address/Name/VPA).
- Distinct from Mobile to Name (`nameLookup`) and Address (`addressLookup`).
- Fee TBD.

### Related

- Mobile to Name Lookup (#3)
- Mobile to Address Lookup (#1)
- Mobile to PAN (#5)
- Next sidebar pages (pending paste)

---

## 5. Mobile to PAN

**Title (provider):** Mobile to PAN

Lookup **PAN (+ name)** linked to a mobile number (`POST …/mobile/panLookup`).

> **Docs pollution:** Description, OpenAPI `operationId` (`post_mobilenameLookup-1-2`), OpenAPI body (`consent`), OpenAPI response (`mobileLinkedName`), and Voter ID consent callout are **Name Lookup leftovers**. **Trust:** title, path, request table, curl/HTTP, Sample Response `panData`.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/mobile/panLookup` |
| **OpenAPI operationId** | `post_mobilenameLookup-1-2` (**wrong**) |
| **Summary** | Mobile to PAN |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/mobile/panLookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `mobileNumber` | String | Mandatory | User mobile number |
| `externalRef` | String | Mandatory | Unique transaction id |
| `latitude` | String / Number | Mandatory | End customer latitude (sample = JSON **number**) |
| `longitude` | String / Number | Mandatory | End customer longitude (sample = JSON **number**) |

> No `consent` / `firstName` / `lastName` in table or samples (unlike Profile). OpenAPI wrongly adds `consent` — ignore.

### Sample request

> Provider sample had a real-looking mobile — masked below.

```bash
curl --location 'https://api.instantpay.in/identity/mobile/panLookup' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "mobileNumber": "xxxxxxxxxx",
    "externalRef": "1778653422",
    "latitude": 0.99,
    "longitude": 38
}'
```

```http
POST /identity/mobile/panLookup HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
    "mobileNumber": "xxxxxxxxxx",
    "externalRef": "1778653422",
    "latitude": 0.99,
    "longitude": 38
}
```

### Sample success response

> SANDBOX. Trust this over OpenAPI’s Name Lookup example.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "panData": {
      "name": "RAVI",
      "pan": "ABCDE6309L"
    },
    "poolReferenceId": "1260617042916XUERS",
    "pool": {
      "account": "7505684294",
      "openingBal": "99917580.48",
      "mode": "DR",
      "amount": "2.36",
      "closingBal": "99917578.12"
    }
  },
  "timestamp": "2026-06-17 09:59:17",
  "ipay_uuid": "h000a20ac00f-ff48-4d3c-a114-2f2d21d88638-7i0WMF2AXECv",
  "orderid": "1260617042916XUERS",
  "environment": "SANDBOX",
  "internalCode": "Transaction Successful"
}
```

### Response notes (`data.panData`)

| Field | Notes |
|-------|-------|
| `name` | Name linked to mobile/PAN |
| `pan` | PAN string |
| Pool | `mode: DR`, sample fee **`2.36`**, includes `account` |
| `internalCode` | Sample echoes `"Transaction Successful"` |

### Consent

> Callout is Voter ID pollution. Body samples **omit `consent`**.

### Gotchas

- OpenAPI response/schema still Name Lookup — use `panData` sample.
- No consent field in working request (unlike Address/Name/VPA).
- Distinct from Digital KYC / PAN verify rails and from Mobile to Profile (`dataLookup`).
- Sample mobile masked in archive.

### Related

- Mobile to Profile (#4)
- Mobile to Name Lookup (#3)
- Mobile Number to EPFO UAN (#6)
- Next sidebar pages (pending paste)

---

## 6. Mobile Number to EPFO UAN

**Title (provider):** Mobile Number to EPFO UAN

Verify / fetch **EPFO UAN** and employment details from a **mobile number** (onboarding, compliance).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/corporateEmpCheck` |
| **OpenAPI operationId** | `identity-verification-mobile-number-epfo-uan` |
| **Summary** | Mobile Number to EPFO UAN |
| **OpenAPI title** | `identity` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/corporateEmpCheck` |

> Path is **`/identity/corporateEmpCheck`** — not under `/identity/mobile/…`.

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `customerPhoneNumber` | String | Mandatory | Mobile number (**not** `mobileNumber`) |
| `latitude` | String / Number | Mandatory | End customer latitude (sample = JSON **number**) |
| `longitude` | String / Number | Mandatory | End customer longitude (sample = JSON **number**) |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

### Sample request

> Phone + secrets → placeholders.

```bash
curl --location 'https://api.instantpay.in/identity/corporateEmpCheck' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "customerPhoneNumber": "xxxxxxxxxx",
    "consent": "Y",
    "latitude": 0.99,
    "longitude": 38,
    "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/corporateEmpCheck HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
    "customerPhoneNumber": "xxxxxxxxxx",
    "consent": "Y",
    "latitude": 0.99,
    "longitude": 38,
    "externalRef": "jdnjdi89"
}
```

### Sample success response

> LIVE. Key typo kept as provider sends: **`employeData`** (missing “e”). Pool shape differs from other mobile APIs (`paymentAmount` / `openingBalance` / `referenceId`).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "employeData": {
      "personalDetails": {
        "userGender": "MALE",
        "userDob": "08/09/1998",
        "userFullName": "Sample Name",
        "userPhoneNumber": "xxxxxxxxxx"
      },
      "employmentDetails": {
        "isEmployed": true,
        "dateOfExitMarked": false,
        "uanList": ["101748344546"],
        "uanCount": 1,
        "recentEmployerData": {
          "memberId": "DSNHP13800300000332",
          "establishmentId": "DSNHP13800000",
          "dateOfExit": "NA",
          "dateOfJoining": "18/10/2021",
          "establishmentName": "INSTANTPAY INDIA LIMITED",
          "uanNumber": "1017123444546"
        },
        "previousEmployerData": {
          "list": [
            {
              "sequenceNumber": "1",
              "uanNumber": "101748344546",
              "dateOfExit": "NA",
              "dateOfJoining": "18/10/2021",
              "establishmentId": "DSNHP13800120000",
              "establishmentName": "INSTANTPAY  INDIA LIMITED",
              "memberId": "DSNHP13800301000332",
              "leaveReason": "NA",
              "mobile": "NA",
              "aadhaarVerificationStatus": "Verified"
            }
          ]
        }
      }
    },
    "pool": {
      "referenceId": "1240130150440BSGHU",
      "openingBalance": "20.97",
      "paymentAmount": "5.90",
      "mode": "DR",
      "closingBalance": "15.07"
    }
  },
  "timestamp": "2024-01-30 15:04:40",
  "ipay_uuid": "h0059b370c0f-3176-417f-b799-518c8638edbc-D2ldwjni01D9",
  "orderid": "1240130150440BSGHU",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes

| Area | Fields |
|------|--------|
| Personal | `userGender`, `userDob`, `userFullName`, `userPhoneNumber` |
| Employment | `isEmployed`, `dateOfExitMarked`, `uanList[]`, `uanCount` |
| Recent employer | memberId, establishmentId/Name, joining/exit, `uanNumber` |
| Previous employers | `previousEmployerData.list[]` (+ aadhaarVerificationStatus, leaveReason, …) |
| Pool | **`paymentAmount`** sample **`5.90`**; keys `referenceId`, `openingBalance`, `closingBalance` (not `poolReferenceId` / `amount`) |
| Root key | **`employeData`** — typo in provider API |

### Gotchas

- Field name **`customerPhoneNumber`**, not `mobileNumber`.
- Path **`corporateEmpCheck`** — easy to miss under Mobile Based nav.
- Pool schema differs from Address/VPA/Name/PAN.
- Keep spelling `employeData` when parsing.
- Sample UAN / employer data illustrative; mask phones in logs.

### Related

- Mobile to PAN (#5)
- Mobile to Profile (#4)
- Next sidebar pages (pending paste)
