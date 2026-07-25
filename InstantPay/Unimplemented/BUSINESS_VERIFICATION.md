# InstantPay — Business Verification

> Raw InstantPay Business Verification API reference (`InstantPay/Unimplemented/`). Overview: [`OVERVIEW.md`](OVERVIEW.md). **Implement cheat-sheet:** [`BUSINESS_VERIFICATION_DETAILS.md`](BUSINESS_VERIFICATION_DETAILS.md). Jab implement ho → root `InstantPay/BUSINESS_VERIFICATION.md` (AEPS-style) banega.

**Provider:** InstantPay (Identity / Business Verification)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (sab Business Verification APIs)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Y ⚠️ (provider table; usually partner-supplied — confirm) |

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
| 1 | LEI Verification | `GET /identity/lei` | 📄 Docs captured |
| 2 | FSSAI Verification | `POST /identity/verifyFssai` | 📄 Docs captured |
| 3 | TAN Verification Plus | `POST /identity/verifyTan` | 📄 Docs captured |
| 4 | Udyam Verification | `POST /identity/udyam` | 📄 Docs captured |
| 5 | MCA Company Search — Fetch CIN | `POST /identity/company/lookup/cin` | 📄 Docs captured |
| 6 | MCA Company Search — Fetch Profile | `POST /identity/company/lookup` | 📄 Docs captured |

---

## 1. LEI Verification

A **Legal Entity Identifier (LEI)** is a unique **20-character alphanumeric** code identifying legal entities in financial transactions — global transparency / party identification.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/identity/lei` |
| **OpenAPI operationId** | `identity-verification-lei-verification` |
| **Summary** | LEI Verification |
| **OpenAPI title** | `identity` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `value` | String | Mandatory | Lookup value (for `type=LEI`: 20-char alphanumeric LEI) |
| `type` | String | Mandatory | `NAME` \| `BIC` \| `ISIN` \| `LEI` |
| `pagination[pageNumber]` | String/Number | Optional | Page number (query; docs table wrongly says Array) |
| `pagination[recordsPerPage]` | String/Number | Optional | Records per page |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |

> OpenAPI `requestBody` also lists `consent` — **not** in the published param table or curl sample. Confirm on staging whether consent is required.

### Sample request

> Provider “curl” sample is broken (HTTP request-line mixed with `--header`). Cleaned below — **query-string GET**, no JSON body.

```bash
curl --location --request GET \
'https://api.instantpay.in/identity/lei?latitude=28.5094&longitude=77.2973&externalRef=1716870276&type=LEI&value=335800ZS5FFXU1CGRK27&pagination[pageNumber]=1&pagination[recordsPerPage]=10' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}'
```

```http
GET /identity/lei?latitude=28.5094&longitude=77.2973&externalRef=1716870276&type=LEI&value=335800ZS5FFXU1CGRK27&pagination[pageNumber]=1&pagination[recordsPerPage]=10 HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1240527171547ZXLPN",
    "pool": {
      "openingBal": "43.42",
      "mode": "DR",
      "amount": "2.36",
      "closingBal": "41.06"
    },
    "meta": {
      "totalPages": 1,
      "currentPage": 1,
      "totalRecords": 1,
      "recordsOnCurrentPage": 10,
      "recordFrom": 1,
      "recordTo": 1
    },
    "record": [
      {
        "lei": "335800ZS5FFXU1CGRK27",
        "entity": {
          "legalName": {
            "name": "ANKIT INTERNATIONAL",
            "language": "en"
          },
          "otherNames": [],
          "transliteratedOtherNames": [],
          "legalAddress": {
            "language": "en",
            "addressLines": ["42/42", "WEST PUNJABI BAGH"],
            "addressNumber": null,
            "addressNumberWithinBuilding": null,
            "mailRouting": null,
            "city": "NEW DELHI",
            "region": "IN-DL",
            "country": "IN",
            "postalCode": "110026"
          },
          "headquartersAddress": {
            "language": "en",
            "addressLines": ["42/42", "WEST PUNJABI BAGH"],
            "addressNumber": null,
            "addressNumberWithinBuilding": null,
            "mailRouting": null,
            "city": "NEW DELHI",
            "region": "IN-DL",
            "country": "IN",
            "postalCode": "110026"
          },
          "registeredAt": {
            "id": "RA000709",
            "other": null
          },
          "registeredAs": "0509049290",
          "jurisdiction": "IN",
          "category": "GENERAL",
          "legalForm": {
            "id": "A0PS",
            "other": null
          },
          "associatedEntity": {
            "lei": null,
            "name": null
          },
          "status": "INACTIVE",
          "expiration": {
            "date": null,
            "reason": null
          },
          "successorEntity": {
            "lei": "3358004PT3NRFB1FYG32",
            "name": null
          },
          "successorEntities": [
            {
              "lei": "3358004PT3NRFB1FYG32"
            }
          ],
          "creationDate": null,
          "subCategory": null,
          "otherAddresses": [],
          "eventGroups": [
            {
              "groupType": "STANDALONE",
              "events": [
                {
                  "validationDocuments": "OTHER_OFFICIAL_DOCUMENTS",
                  "effectiveDate": "2021-02-18T06:17:13Z",
                  "recordedDate": "2021-02-18T06:17:13Z",
                  "type": "MERGERS_AND_ACQUISITIONS",
                  "status": "COMPLETED",
                  "affectedFields": [
                    {
                      "value": "3358004PT3NRFB1FYG32",
                      "xpath": "/lei:LEIData/lei:LEIRecords/lei:LEIRecord/lei:Entity/lei:SuccessorEntity/lei:SuccessorLEI"
                    }
                  ]
                }
              ]
            }
          ]
        },
        "registration": {
          "initialRegistrationDate": "2019-03-14T12:57:51Z",
          "lastUpdateDate": "2022-03-11T13:30:01Z",
          "status": "RETIRED",
          "nextRenewalDate": "2021-03-13T18:30:00Z",
          "managingLou": "335800FVH4MOKZS9VH40",
          "corroborationLevel": "FULLY_CORROBORATED",
          "validatedAt": {
            "id": "RA000709",
            "other": null
          },
          "validatedAs": "0509049290",
          "otherValidationAuthorities": [
            {
              "validatedAt": {
                "id": "RA888888"
              },
              "validatedAs": "0509049290"
            }
          ]
        },
        "bic": null,
        "mic": null,
        "ocid": null,
        "spglobal": ["606978683"],
        "conformityFlag": "NOT_APPLICABLE"
      }
    ]
  },
  "timestamp": "2024-05-27 17:15:47",
  "ipay_uuid": "h0059c249b12-fce2-4b1b-a804-eb4ee9ca30e3-KewJUzvBST1G",
  "orderid": "1240527171547ZXLPN",
  "environment": "LIVE"
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `poolReferenceId` | Pool txn ref (= envelope `orderid` in sample) |
| `pool` | Debit: `openingBal`, `mode` (`DR`), `amount`, `closingBal` — **chargeable** |
| `meta` | Pagination: `totalPages`, `currentPage`, `totalRecords`, `recordsOnCurrentPage`, `recordFrom`, `recordTo` |
| `record[]` | LEI hits: `lei`, `entity`, `registration`, `bic`/`mic`/`ocid`, `spglobal`, `conformityFlag` |

**Entity (per record):** `legalName`, addresses, `registeredAs`, `jurisdiction`, `category`, `legalForm`, `status` (e.g. `INACTIVE`), `successorEntity` / `successorEntities`, `eventGroups` (M&A etc.).

**Registration:** dates, `status` (e.g. `RETIRED`), `managingLou`, `corroborationLevel`, validation authorities.

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample is **string** |
| `data` | Table says String — sample is **object** |

### Gotchas

- **GET + query params** — not JSON body. Provider curl sample is malformed (`GET /… HTTP/1.1` + `--header`); use cleaned curl above.
- OpenAPI also defines a JSON `requestBody` (incl. `consent`) on a GET — **ignore body**; trust query-string sample unless staging proves otherwise.
- `type`: `NAME` \| `BIC` \| `ISIN` \| `LEI` — for LEI, `value` must be **20-char** alphanumeric.
- Pagination params documented as “Array” but sent as `pagination[pageNumber]` / `pagination[recordsPerPage]` query keys (object shape).
- Header table marks `X-Ipay-Endpoint-Ip` Provided by InstantPay = **Y** — unusual vs other Identity APIs (often partner-supplied **N**); confirm.
- Sample lat/long in provider docs (`-49.1725`, `-167.2633`) look like placeholders — use real end-customer coords.
- **Chargeable**: sample pool `amount: "2.36"` DR — confirm fee with KAM.
- Entity `status` / registration `status` can be inactive/retired even when lookup `TXN` succeeds — UI must surface LEI lifecycle, not only API success.
- `meta.recordsOnCurrentPage: 10` with `totalRecords: 1` — treat meta as provider-reported; don’t assume consistency.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `GET /lei`
- `operationId`: `identity-verification-lei-verification`
- Misleading: GET + `requestBody` + `consent` — prefer documented query sample
- `400` → `"{}"` / `{}`

---

## 2. FSSAI Verification

Verify authenticity of **Food Safety and Standards Authority of India (FSSAI)** licenses — authorization for production, storage, distribution, or export of food products.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyFssai` |
| **OpenAPI operationId** | `identity-verification-fssai-verification` |
| **Summary** | FSSAI Verification |
| **OpenAPI title** | `identity` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `fssaiNumber` | String | Mandatory | FSSAI number to verify |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

> OpenAPI schema also lists `dob` — **not** in param table or curl sample. Ignore unless staging requires it.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyFssai' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "fssaiNumber": "1332112340532",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/verifyFssai HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "fssaiNumber": "1332112340532",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

> Provider “http” sample pasted raw **curl** with live-looking client id/secret/IP — sanitized to placeholders above.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "fassaiDetail": {
      "premiseAddress": "Sample Full Address",
      "fssaiNumber": "1332112340532",
      "licenseCategoryName": "State License",
      "stateName": "Delhi",
      "statusDescription": "License Issued",
      "licenseCategoryId": "2",
      "talukName": "Taluk Name",
      "districtName": "District Name ",
      "companyName": "Company Business Name",
      "licenseActiveFlag": true,
      "appTypeDescription": "New License",
      "villageName": null,
      "premisePincode": "110018"
    },
    "pool": {
      "referenceId": "1231005101634YLFYA",
      "openingBalance": "47.77",
      "paymentAmount": "0.00",
      "mode": "DR",
      "closingBalance": "47.77"
    }
  },
  "timestamp": "2023-10-05 10:16:34",
  "ipay_uuid": "h0059a4b47e5-7b72-4309-835a-868f5fbbb7fe-CLueOJFuLnk6",
  "orderid": "1231005101634YLFYA",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| **`fassaiDetail`** ⚠️ | License payload — provider spelling (**fassai**, not `fssaiDetail`) |
| `fassaiDetail.fssaiNumber` | Echo of license number |
| `fassaiDetail.companyName` | Business name |
| `fassaiDetail.licenseActiveFlag` | Boolean active flag |
| `fassaiDetail.statusDescription` | e.g. `License Issued` |
| `fassaiDetail.licenseCategoryName` / `licenseCategoryId` | e.g. State License / `"2"` |
| `fassaiDetail.premiseAddress` / `premisePincode` | Premise |
| `fassaiDetail.stateName` / `districtName` / `talukName` / `villageName` | Geography |
| `fassaiDetail.appTypeDescription` | e.g. `New License` |
| `pool` | `referenceId`, `openingBalance`, `paymentAmount`, `mode`, `closingBalance` |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample is **string** |
| `data` | Table says String — sample is **object** |

### Gotchas

- Response key is **`fassaiDetail`** (double-s typo) — parse as-is; do not expect `fssaiDetail`.
- Provider http sample leaked real-looking **Client-Id / Client-Secret / IP** — never commit; use placeholders.
- OpenAPI extra property **`dob`** — not in published params; ignore unless confirmed.
- Lat/long sample `0.99` / `38` look like placeholders — use real end-customer coords.
- Pool sample `paymentAmount: "0.00"` — still `mode: DR`; confirm whether always free or sample-only zero fee.
- `consent` mandatory (`"Y"` in sample).
- Docs envelope types wrong (`status` Array, `data` String).

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /verifyFssai`
- `operationId`: `identity-verification-fssai-verification`
- Schema includes unused `dob`
- `400` → `"{}"` / `{}`

---

## 3. TAN Verification Plus

Beyond basic **TAN** (Tax Deduction and Collection Account Number) checks — verify TAN details and enrich with supplementary business data for due diligence / tax compliance.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyTan` |
| **OpenAPI operationId** | `identity-verification-tan-verification` |
| **Summary** | TAN Verification Plus |
| **OpenAPI title** | `identity` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `tanNumber` | String | Mandatory | TAN number |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyTan' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "tanNumber": "PNEA28XXXX",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/verifyTan HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "tanNumber": "PNEA28XXXX",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

> Provider http sample included live-looking Client-Id / Client-Secret / IP — sanitized to placeholders.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "tanDetail": {
      "tanNumber": "PNEA28XXXX",
      "userFullName": "Business Name",
      "userFirstName": "",
      "userMiddleName": "",
      "userLastName": "",
      "tanAllotmentDate": "25-10-2018",
      "userAddress": {
        "line1": "ADD_LINE_1",
        "line2": "JEWADI ROAD",
        "line3": "XRBIA,",
        "line4": "",
        "line5": "PUNE, PUNE",
        "stateCode": "19",
        "zipCode": "",
        "country": "",
        "full": "Full Address"
      },
      "userEmail": "help@instantpay.in",
      "userPhoneNumber": "7428585742"
    },
    "pool": {
      "referenceId": "1231005103330VNFPB",
      "openingBalance": "47.77",
      "paymentAmount": "3.54",
      "mode": "DR",
      "closingBalance": "44.23"
    }
  },
  "timestamp": "2023-10-05 10:33:30",
  "ipay_uuid": "h0069a4b4df1-1c60-49f7-a0ff-78902a0953e2-YcyXJlTNHQtU",
  "orderid": "1231005103330VNFPB",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `tanDetail` | TAN payload |
| `tanDetail.tanNumber` | Echo of TAN |
| `tanDetail.userFullName` | Business / holder name (split name fields may be empty) |
| `tanDetail.userFirstName` / `userMiddleName` / `userLastName` | Name parts |
| `tanDetail.tanAllotmentDate` | Allotment date (`DD-MM-YYYY` in sample) |
| `tanDetail.userAddress` | `line1`–`line5`, `stateCode`, `zipCode`, `country`, `full` |
| `tanDetail.userEmail` / `userPhoneNumber` | Contact enrichment |
| `pool` | `referenceId`, balances, `paymentAmount`, `mode: DR` |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample is **string** |
| `data` | Table says String — sample is **object** |

### Gotchas

- **Chargeable**: sample pool `paymentAmount: "3.54"` DR (unlike FSSAI sample often `0.00`).
- `tanAllotmentDate` format `DD-MM-YYYY` — not ISO; parse carefully.
- Name fields: org TANs may only populate `userFullName`; first/middle/last can be empty.
- Provider http sample leaked secrets — sanitize.
- Lat/long sample placeholders (`0.99` / `38`).
- `consent` mandatory (`"Y"`).
- Docs envelope types wrong (`status` Array, `data` String).
- Sample contact fields may be provider demos (`help@instantpay.in`) — treat as PII when live.

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity` · Path: `POST /verifyTan`
- `operationId`: `identity-verification-tan-verification`
- `400` → `"{}"` / `{}`

---

## 4. Udyam Verification

Verify clients’ **Udyam (MSME)** registration details for due diligence, onboarding, and MSME compliance.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/udyam` |
| **OpenAPI operationId** | `identity-verification-udyam-verification` |
| **Summary** | Udyam Verification |
| **OpenAPI title** | `udhyam` v1.0 ⚠️ (typo — path/param use **udyam**) |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `udyamNumber` | String | Mandatory | Udyam registration number |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Your unique transaction id |
| `consent` | String | Mandatory | Customer consent (sample `"Y"`) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/udyam' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "udyamNumber": "UDYAM-MH-19-XXXXX",
  "externalRef": "456566",
  "latitude": "27.999",
  "longitude": "24.898",
  "consent": "Y"
}'
```

```http
POST /identity/udyam HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "udyamNumber": "UDYAM-MH-19-XXXXX",
  "externalRef": "456566",
  "latitude": "27.999",
  "longitude": "24.898",
  "consent": "Y"
}
```

> Provider http sample leaked Client-Id / Client-Secret / IP — sanitized.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "udyamDetails": {
      "udyamNumber": "UDYAM-DL-08-XXXXX",
      "nameOfEnterprise": " Health and Fitness",
      "typeOfEnterprise": "",
      "majorActivity": "Services",
      "organisationType": "Others",
      "socialCategory": "General",
      "dateOfIncorporation": "10/04/2019",
      "dateOfCommencementOfProductionOrBusiness": "",
      "unitDetails": [
        {
          "slNo": "1",
          "unitName": "1",
          "flat": "A 24/9 1ST FLOOR",
          "building": "AWIFS",
          "villageOrTown": "NEW DELHI",
          "block": "A",
          "road": "SARITA VIHAR",
          "city": "DELHI",
          "pincode": "110044",
          "state": "DELHI",
          "district": "SOUTH"
        }
      ],
      "officialAddress": {
        "flatOrDoorOrBlockNo": "A 24/9 1ST FLOOR",
        "NameOfPremisesOrBuilding": "",
        "villageOrTown": "NEW DELHI",
        "block": "A",
        "roadOrStreetOrLane": "SARITA VIHAR",
        "city": "DELHI",
        "state": "DELHI",
        "district": "SOUTH",
        "pincode": "110044",
        "mobile": "XXXXXXX934",
        "email": "XXXXXXXX@gmail.com"
      },
      "dic": "DELHI",
      "msmeDi": "DELHI",
      "dateOfUdyamRegistration": "28/01/2022"
    },
    "pool": {
      "referenceId": "1230621093735GXQLH",
      "openingBalance": "6.92",
      "paymentAmount": "3.54",
      "mode": "DR",
      "closingBalance": "3.38"
    }
  },
  "timestamp": "2023-06-21 09:37:35",
  "ipay_uuid": "h0069975fda1-c5a7-408d-b5b0-c5a8fbac850b",
  "orderid": "1230621093735GXQLH",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `udyamDetails` | MSME / Udyam payload |
| `udyamDetails.udyamNumber` | Registered number (sample may differ from request) |
| `nameOfEnterprise` / `typeOfEnterprise` / `majorActivity` | Enterprise profile |
| `organisationType` / `socialCategory` | Classification |
| `dateOfIncorporation` / `dateOfCommencementOfProductionOrBusiness` | Dates (`DD/MM/YYYY` in sample) |
| `unitDetails[]` | Units: address parts, city/state/district/pincode |
| `officialAddress` | Official address + masked `mobile` / `email`; note **`NameOfPremisesOrBuilding`** PascalCase |
| `dic` / `msmeDi` | DIC / MSME DI |
| `dateOfUdyamRegistration` | Registration date |
| `pool` | Chargeable: sample `paymentAmount: "3.54"` DR |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample is **string** |
| `data` | Table says String — sample is **object** |

### Gotchas

- Path is **`/identity/udyam`** (not `verifyUdyam`). OpenAPI title **`udhyam`** — same udyam/udhyam spelling drift as Contact Book business field.
- Request sample `UDYAM-MH-19-…` vs response `UDYAM-DL-08-…` — provider mismatched examples; trust live echo.
- Dates use **`DD/MM/YYYY`** (slashes) — different from TAN’s `DD-MM-YYYY`.
- `nameOfEnterprise` sample has leading space — trim in UI.
- `officialAddress.NameOfPremisesOrBuilding` is PascalCase (inconsistent with camelCase siblings).
- **Chargeable** (~3.54 in sample, same ballpark as TAN Plus).
- Secrets in provider http sample — sanitized.
- `consent` mandatory (`"Y"`).

### OpenAPI notes

- Spec title: `udhyam` v1.0 ⚠️
- Server: `https://api.instantpay.in/identity` · Path: `POST /udyam`
- `operationId`: `identity-verification-udyam-verification`
- `400` → `"{}"` / `{}`

---

## 5. MCA Company Search — Fetch CIN

MCA (Ministry of Corporate Affairs) company search — look up **CIN** (`companyID`) by partial/full **company name**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/company/lookup/cin` |
| **OpenAPI operationId** | `identity-verification-mca-company-search-fetch-cin` |
| **Summary** | Fetch CIN |
| **OpenAPI title** | `fetch-cin` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `companyName` | String | Mandatory | Name of the company (partial match OK — sample `"instan"`) |

> Unlike LEI / FSSAI / TAN / Udyam — **no** `latitude`, `longitude`, `externalRef`, or `consent` in the published param table.

### Sample request

> Provider curl `--data` is missing a closing quote — fixed below.

```bash
curl --location 'https://api.instantpay.in/identity/company/lookup/cin' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "companyName": "instan"
}'
```

```http
POST /identity/company/lookup/cin HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "companyName": "instan"
}
```

> Provider http sample leaked Client-Id / Client-Secret / IP — sanitized. x-readme curl variant uses `"instant"` vs sample `"instan"`.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "companyID": "U64200DL2010PLC206587",
      "companyName": "INSTANTPAY INDIA LIMITED"
    },
    {
      "companyID": "U65999DL2020PTC360006",
      "companyName": "INSTANTPAY FOREX SERVICES PRIVATE LIMITED"
    }
  ],
  "timestamp": "2023-06-22 17:32:48",
  "ipay_uuid": "h0009978aa92-cbb9-4a31-aad1-a6280eb32c2b",
  "orderid": null,
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `data` | **Array** of matches (not object — unusual vs other Identity APIs) |
| `data[].companyID` | **CIN** (Corporate Identity Number) |
| `data[].companyName` | Registered company name |
| `orderid` | `null` in sample (no pool debit shown) |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample is **string** |
| `data` | Table says String — sample is **array of objects** |

### Gotchas

- Trust curl URL: `POST /identity/company/lookup/cin`. OpenAPI server is already `…/identity/company/lookup/cin` + path `/fetchCIN` → would become `…/cin/fetchCIN` — **do not combine**; ignore OpenAPI path.
- Partial name search returns **multiple** rows — UI needs picker before downstream MCA calls.
- Field name is `companyID` (not `cin`) — value is the CIN string.
- No lat/long/`externalRef`/`consent` / no `pool` in sample — confirm fee model on staging (may be free or billed elsewhere).
- Broken provider curl (unclosed `--data` quote).
- Secrets in http sample — sanitized.
- Sample environment `SANDBOX`.

### OpenAPI notes

- Spec title: `fetch-cin` v1.0
- Server: `https://api.instantpay.in/identity/company/lookup/cin` ⚠️ (already includes full path)
- Path: `POST /fetchCIN` ⚠️ — **double-path trap**; use curl URL instead
- `operationId`: `identity-verification-mca-company-search-fetch-cin`
- `400` → `"{}"` / `{}`

---

## 6. MCA Company Search — Fetch Profile

Retrieve detailed company information by **CIN** (`companyIdentityNumber`). Typical flow: Fetch CIN (name → pick CIN) → Fetch Profile.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/company/lookup` |
| **OpenAPI operationId** | `identity-verification-mca-company-search-fetch-profile` |
| **Summary** | Fetch Profile |
| **OpenAPI title** | `fetch-profile` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `companyIdentityNumber` | String | Mandatory | CIN number (from Fetch CIN `companyID`) |
| `latitude` | String | Mandatory | Location latitude |
| `longitude` | String | Mandatory | Location longitude |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | String | Mandatory | Must be `"Y"` |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/company/lookup' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "companyIdentityNumber": "U92100TN2015PTC102877",
  "latitude": "0.00",
  "longitude": "0.00",
  "externalRef": "djfodf",
  "consent": "Y"
}'
```

```http
POST /identity/company/lookup HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "companyIdentityNumber": "U92100TN2015PTC102877",
  "latitude": "0.00",
  "longitude": "0.00",
  "externalRef": "djfodf",
  "consent": "Y"
}
```

> Provider http sample leaked Client-Id / Client-Secret / IP — sanitized.

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Data Fetched Successful",
  "data": {
    "poolReferenceId": "1230717101848FBSEZ",
    "pool": {
      "openingBal": "96186.73",
      "amount": "5.90",
      "closingBal": "96180.83"
    },
    "companyData": {
      "fllpin": "FZZZ-9999",
      "foreignLlpName": "Business Name",
      "countryOfIncorporation": "IN",
      "numberOfAuthorisedRepresentatives": "",
      "dateOfIncorporation": "-",
      "registeredAddress": "Full Address",
      "emailId": "Email ID",
      "typeOfOffice": "ROC",
      "details": "",
      "mainDivisionOfBusinessActivityToBeCarriedOutInIndia": "29",
      "descriptionOfMainDivision": "Manufacture of machinery and equipment N.E.C.",
      "dateOfLastFinancialYearEndDateForWhichStatementOfAccountsAndSolvencyFiled": "-",
      "fllpStatus": "INACTIVE",
      "directors": [
        {
          "dinPan": "05269777",
          "name": "Sample Name",
          "beginDate": "26/10/2012",
          "endDate": "-",
          "surrenderedDin": "NO"
        },
        {
          "dinPan": "06378793",
          "name": "Sample Name",
          "beginDate": "26/10/2012",
          "endDate": "-",
          "surrenderedDin": "NO"
        }
      ]
    }
  },
  "timestamp": "2023-07-17 10:18:48",
  "ipay_uuid": "h00099aa59f4-fabb-47fd-821c-b2d39ce2a858",
  "orderid": "1230717101848FBSEZ",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data` highlights

| Field | Description |
|-------|-------------|
| `poolReferenceId` / `pool` | Chargeable — sample `amount: "5.90"` (no `mode` in sample) |
| `companyData` | Profile payload |
| `companyData.fllpin` / `foreignLlpName` / `fllpStatus` | Sample looks **FLLP / foreign LLP**-shaped (even when request CIN is Indian-style) |
| `registeredAddress` / `emailId` / `countryOfIncorporation` | Contact / geo |
| `dateOfIncorporation` | Often `"-"` when unknown |
| `mainDivisionOfBusinessActivityToBeCarriedOutInIndia` + `descriptionOfMainDivision` | NIC / activity |
| `directors[]` | `dinPan`, `name`, `beginDate` / `endDate` (`DD/MM/YYYY` or `-`), `surrenderedDin` |

### Envelope notes

| Name | Docs table vs sample |
|------|----------------------|
| `status` | Table says Array — sample string (`"Data Fetched Successful"`) |
| `data` | Table says String — sample **object** |

### Gotchas

- Path: **`/identity/company/lookup`** (profile) vs **`/identity/company/lookup/cin`** (name search) — do not confuse.
- Request field is **`companyIdentityNumber`** — map from Fetch CIN’s `companyID`.
- OpenAPI `requestBody` wrongly only lists **`companyName`** — ignore; use param table + curl.
- Sample `companyData` keys are FLLP-oriented (`fllpin`, `foreignLlpName`, `fllpStatus`) while request uses a CIN — confirm live response shape for Indian companies vs FLLP; may be polymorphic.
- **Chargeable** (~5.90 in sample). Pool uses `openingBal` / `amount` / `closingBal` (no `mode` / `paymentAmount` unlike TAN/Udyam).
- Lat/long sample `"0.00"` — prefer real coords.
- Secrets sanitized. Status grammar: “Data Fetched Successful”.
- Placeholder dates often `"-"`.

### OpenAPI notes

- Spec title: `fetch-profile` v1.0
- Server: `https://api.instantpay.in/identity/company` · Path: `POST /lookup`
- `operationId`: `identity-verification-mca-company-search-fetch-profile`
- Schema body: only `companyName` ⚠️ — wrong
- `400` → `"{}"` / `{}`

---
