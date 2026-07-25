# PaySprint — DMT (CASA)

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`DMT_DETAILS.md`](DMT_DETAILS.md). Jab implement ho → root `PaySprint/DMT.md`.

**Provider:** PaySprint (DMT (CASA))
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~34–217)

### Shared headers / auth

| Header | Type | Mandatory | Env | Description |
|--------|------|-----------|-----|-------------|
| `Token` | String | M | UAT+Live | JWT (HS256) |
| `Authorisedkey` | String | M on UAT* | UAT | Not required on Live (provider note) |
| `Content-Type` | String | M | Both | `application/json` |


### Shared auth

JWT in `Token` header; UAT may need `Authorisedkey`. AES-128 for some sensitive bodies. India IP only. See [`AUTHENTICATION.md`](AUTHENTICATION.md).


### Common response envelope

| Field | Type | Description |
|-------|------|-------------|
| `status` | Boolean/Number | Success flag (shape varies) |
| `response_code` | Number/String | Provider code |
| `message` | String | Status text |
| `data` | Object/Array | Payload |
| `ackno` / `referenceid` / `utr` | String | Txn ids when applicable |


### PDF / OpenAPI pollution

- Servers often `https://xyz.xyz.in/service-api/api/v1/service` — use `api.paysprint.in`
- `operationId` / `required[]` frequently copy-pasted across adjacent endpoints
- Prefer param tables + curl over OpenAPI blobs
- Mask all PII/secrets in samples (`xxxxx`)


---

## Product notes

**DMT CASA** (Domestic Money Transfer + account opening) under path prefix `/dmt-casa/`.

Major areas in PDF sidebar order:

1. Introduction / partner notes / bank list asset
2. Query Remitter
3. Account opening (Aadhaar → PAN → eKYC → pincode → OTP → submit / revision)
4. Beneficiary (OTP → add → list → verify → fetch → delete)
5. Transaction (send OTP → process → query)
6. Refund (resend OTP → claim)

> Bank master captured: [`DMT_BANK_LIST.md`](DMT_BANK_LIST.md) (1903 banks from `DMT-BANK-LIST.xlsx`) — cache `bankid` locally. Cheat-sheet: [`DMT_BANK_LIST_DETAILS.md`](DMT_BANK_LIST_DETAILS.md).


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | QueryRemitter | `POST /dmt-casa/Queryremitter` | 📄 Docs captured |
| 2 | Check Aadhar number | `POST /dmt-casa/account_opening/check_aadhaar` | 📄 Docs captured |
| 3 | Check Pan | `POST /dmt-casa/account_opening/check_pan` | 📄 Docs captured |
| 4 | Ekyc | `POST /dmt-casa/account_opening/ekyc` | 📄 Docs captured |
| 5 | Check pincode | `POST /dmt-casa/account_opening/check_pincode` | 📄 Docs captured |
| 6 | Get Otp | `POST /dmt-casa/account_opening/generate_otp` | 📄 Docs captured |
| 7 | Account Submit Request | `POST /dmt-casa/account_opening/submit_account_details` | 📄 Docs captured |
| 8 | Account Revision Submit | `POST /dmt-casa/account_opening/submit_account_revision` | 📄 Docs captured |
| 9 | Send Bene Otp | `POST /dmt-casa/beneficiary/sendotp` | 📄 Docs captured |
| 10 | Add_Bene | `POST /dmt-casa/beneficiary/add_bene` | 📄 Docs captured |
| 11 | Delete Beneficiary | `POST /dmt-casa/beneficiary/deletebene` | 📄 Docs captured |
| 12 | Get Bene List | `POST /dmt-casa/beneficiary/benelist` | 📄 Docs captured |
| 13 | Bene Verification Api | `POST /dmt-casa/beneficiary/benenameverify` | 📄 Docs captured |
| 14 | Get Single Bene | `POST /dmt-casa/beneficiary/fetch_single_bene` | 📄 Docs captured |
| 15 | Transaction send otp | `POST /dmt-casa/transact/send_otp` | 📄 Docs captured |
| 16 | Transaction Verify Otp | `POST /dmt-casa/transact/process` | 📄 Docs captured |
| 17 | Transaction Status | `POST /dmt-casa/transact/querytransact` | 📄 Docs captured |
| 18 | Refund send otp api | `POST /dmt-casa/refund/resendotp` | 📄 Docs captured |
| 19 | Refund Claim Api | `POST /dmt-casa/refund/index` | 📄 Docs captured |

---

## 1. QueryRemitter

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/Queryremitter` |
| **OpenAPI path** | `/dmt-casa/Queryremitter` |
| **OpenAPI operationId** | `dmt-casa-queryremitter-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `sdk_token` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `RejectionType` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `Remarks` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `RejectionID` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `form_data` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `key` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `type` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `label` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `required` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pattern` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `maxLength` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/Queryremitter' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, aadhaar, sdk_token, RejectionType, Remarks, RejectionID, form_data */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `QueryRemitter`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, aadhaar`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 2. Check Aadhar number

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_aadhaar` |
| **OpenAPI path** | `/dmt-casa/account_opening/check_aadhaar` |
| **OpenAPI operationId** | `dmt-casa-aadharnumber-check-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `consent` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_aadhaar' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, aadhaar, pan, ekyc_flag, ekyc_id, piddata, consent */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Check Aadhar number`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, aadhaar, pan, ekyc_flag, ekyc_id, piddata, consent`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 3. Check Pan

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_pan` |
| **OpenAPI path** | `/dmt-casa/account_opening/check_pan` |
| **OpenAPI operationId** | `dmt-casa-check-pan-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `consent` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pincode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_pan' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, aadhaar, pan, ekyc_flag, ekyc_id, piddata, consent */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Check Pan`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, aadhaar, pan, ekyc_flag, ekyc_id, piddata, consent, pincode`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 4. Ekyc

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/ekyc` |
| **OpenAPI path** | `/dmt-casa/account_opening/ekyc` |
| **OpenAPI operationId** | `dmt-casa-ekyc-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `consent` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pincode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `CustomerName` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `DOB` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `Address` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `street` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `house` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `location` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `district` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `state` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `vtc` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `Gender` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `FathersName` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `Photo` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/ekyc' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, aadhaar, piddata, ekyc_id, ekyc_flag, consent, pincode */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Ekyc`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, aadhaar, piddata, ekyc_id, ekyc_flag, consent, pincode, name`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 5. Check pincode

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_pincode` |
| **OpenAPI path** | `/dmt-casa/account_opening/check_pincode` |
| **OpenAPI operationId** | `dmt-casa-pincode` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pincode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `occupation_type` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `marital_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `education_code` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `income_slab` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_form60` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `first_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `last_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `gender` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `StateName` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `DistrictName` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `StateCode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/check_pincode' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, pincode, name, aadhaar, occupation_type, marital_status, education_code */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Check pincode`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, pincode, name, aadhaar, occupation_type, marital_status, education_code, income_slab, is_form60, piddata, lat, long, stateresp, otp, ekyc_flag, ekyc_id, first_name, last_name, gender`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 6. Get Otp

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/generate_otp` |
| **OpenAPI path** | `/dmt-casa/account_opening/generate_otp` |
| **OpenAPI operationId** | `get-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `occupation_type` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `marital_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `education_code` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `income_slab` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_form60` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `first_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `last_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `gender` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_no` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_image` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/generate_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, name, aadhaar, occupation_type, marital_status, education_code, income_slab */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Get Otp`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, name, aadhaar, occupation_type, marital_status, education_code, income_slab, is_form60, piddata, lat, long, stateresp, otp, ekyc_flag, ekyc_id, first_name, last_name, gender, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 7. Account Submit Request

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/submit_account_details` |
| **OpenAPI path** | `/dmt-casa/account_opening/submit_account_details` |
| **OpenAPI operationId** | `dmt-casa-account-submit-request` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `occupation_type` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `marital_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `education_code` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `income_slab` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_form60` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_flag` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `first_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `last_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `gender` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mother_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_no` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_image` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan_applied` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/submit_account_details' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, aadhaar, occupation_type, marital_status, education_code, income_slab, is_form60 */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Account Submit Request`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, aadhaar, occupation_type, marital_status, education_code, income_slab, is_form60, piddata, lat, long, stateresp, otp, ekyc_flag, ekyc_id, first_name, last_name, gender, dob, mother_name`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 8. Account Revision Submit

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/submit_account_revision` |
| **OpenAPI path** | `/dmt-casa/account_opening/submit_account_revision` |
| **OpenAPI operationId** | `dmt-casa-account-opening-revision-submit-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsccode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/account_opening/submit_account_revision' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Account Revision Submit`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 9. Send Bene Otp

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/sendotp` |
| **OpenAPI path** | `/dmt-casa/beneficiary/sendotp` |
| **OpenAPI operationId** | `dmt-casa-create-bene-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsccode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/sendotp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Send Bene Otp`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 10. Add Bene

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/add_bene` |
| **OpenAPI path** | `/dmt-casa/beneficiary/add_bene` |
| **OpenAPI operationId** | `dmt-casa-verify-bene-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsccode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankname` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsc` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `verified` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/add_bene' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Add_Bene`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, benename, bankid, accno, ifsccode, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 11. Delete Beneficiary

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/deletebene` |
| **OpenAPI path** | `/dmt-casa/beneficiary/deletebene` |
| **OpenAPI operationId** | `dmt-casa-delete-beneficiary` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankname` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsc` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `verified` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/deletebene' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, referenceid, bene_id, accno, bankid, benename, bankname */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Delete Beneficiary`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, referenceid, bene_id, accno, bankid, benename`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 12. Get Bene List

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/benelist` |
| **OpenAPI path** | `/dmt-casa/beneficiary/benelist` |
| **OpenAPI operationId** | `dmt-casa-get-bene-list` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankname` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsc` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `verified` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsccode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/benelist' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, referenceid, bene_id, accno, bankid, benename, bankname */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Get Bene List`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, referenceid, bene_id, accno, bankid, benename`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 13. Bene Verification Api

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/benenameverify` |
| **OpenAPI path** | `/dmt-casa/beneficiary/benenameverify` |
| **OpenAPI operationId** | `dmt-casa-bene-verification-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ifsccode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `utr` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txn_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balance` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `refid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/benenameverify' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, referenceid, mobile, bene_id, accno, bankid, benename, amount */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Bene Verification Api`
- Required (OpenAPI — may be polluted): `merchantcode, referenceid, mobile, bene_id, accno, bankid, benename, amount`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 14. Get Single Bene

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/fetch_single_bene` |
| **OpenAPI path** | `/dmt-casa/beneficiary/fetch_single_bene` |
| **OpenAPI operationId** | `dmt-casa-get-single-bene` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txntype` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/beneficiary/fetch_single_bene' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, bene_id, amount, referenceid, txntype, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Get Single Bene`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, bene_id, amount, referenceid, txntype, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 15. Transaction send otp

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/send_otp` |
| **OpenAPI path** | `/dmt-casa/transact/send_otp` |
| **OpenAPI operationId** | `dmt-casa-transaction-send-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txntype` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `utr` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/send_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, bene_id, amount, referenceid, txntype, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Transaction send otp`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, bene_id, amount, referenceid, txntype, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 16. Transaction Verify Otp

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/process` |
| **OpenAPI path** | `/dmt-casa/transact/process` |
| **OpenAPI operationId** | `dmt-casa-transaction-verify-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bene_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txntype` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `utr` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txn_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `benename` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `remarks` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `remitter` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `account_number` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bc_share` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txn_amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `NPCI_response_code` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bank_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `customercharge` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `gst` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `tds` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/process' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, bene_id, referenceid, txntype, amount, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Transaction Verify Otp`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, bene_id, referenceid, txntype, amount, otp, stateresp, ackno`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 17. Transaction Status

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/querytransact` |
| **OpenAPI path** | `/dmt-casa/transact/querytransact` |
| **OpenAPI operationId** | `dmt-casa-transaction-status-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `utr` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `account` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txn_status` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `customercharge` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `gst` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bc_share` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `tds` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `netcommission` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `daterefunded` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `refundtxnid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/transact/querytransact' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* referenceid, merchantcode, ackno, otp, stateresp, utr, amount, account */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Transaction Status`
- Required (OpenAPI — may be polluted): `referenceid, merchantcode, ackno, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 18. Refund send otp api

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/refund/resendotp` |
| **OpenAPI path** | `/dmt-casa/refund/resendotp` |
| **OpenAPI operationId** | `dmt-casa-refund-send-otp-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/refund/resendotp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, ackno, referenceid, otp, stateresp */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Refund send otp api`
- Required (OpenAPI — may be polluted): `merchantcode, ackno, referenceid, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 19. Refund Claim Api

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/refund/index` |
| **OpenAPI path** | `/dmt-casa/refund/index` |
| **OpenAPI operationId** | `dmt-casa-refund-claim-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `referenceid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/refund/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, referenceid, otp, stateresp, merchantcode */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Refund Claim Api`
- Required (OpenAPI — may be polluted): `ackno, referenceid, otp, stateresp`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


---

## Flows

### Remitter + send money (happy path)

1. `Queryremitter` with merchant + mobile (+ Aadhaar per page)
2. If new: account opening chain (check_aadhaar → check_pan → ekyc → check_pincode → generate_otp → submit_account_details)
3. Beneficiary: `sendotp` → `add_bene` (with `stateresp`)
4. Optional: `benenameverify` / `benelist`
5. Txn: `transact/send_otp` → `transact/process` (`txntype`, amount, OTP, stateresp)
6. Status: `transact/querytransact` with `referenceid`
7. Failed claim: `refund/resendotp` → `refund/index`

### Revision path

- `submit_account_revision` when account under revision (docs have dedicated response_code notes)
