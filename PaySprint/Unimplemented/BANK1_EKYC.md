# PaySprint — Bank1 Merchant eKYC + AePS

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`BANK1_EKYC_DETAILS.md`](BANK1_EKYC_DETAILS.md). Jab implement ho → root `PaySprint/BANK1_EKYC.md`.

**Provider:** PaySprint (Bank1 Merchant eKYC + AePS)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~540–600)

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

**Bank1** merchant eKYC must be done **two times** (provider note on Merchant EKYC page).

APIs: send OTP → resend OTP → verify OTP, then Bank1 authenticate / balance / ministatement / cash withdraw / query.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | SEND OTP | `POST /aeps/v3/merchantkyc/send_otp` | 📄 Docs captured |
| 2 | Re-Send OTP | `POST /aeps/v3/merchantkyc/resend_otp` | 📄 Docs captured |
| 3 | Verify OTP | `POST /aeps/v3/merchantkyc/verify_otp` | 📄 Docs captured |
| 4 | Daily Authentication API | `POST /aeps/v3/authenticate/bank1` | 📄 Docs captured |
| 5 | Balance Enquiry | `POST /aeps/v3/balanceenquiry/bank1` | 📄 Docs captured |
| 6 | Mini Statement | `POST /aeps/v3/ministatement/bank1` | 📄 Docs captured |
| 7 | Cash Withdrawal | `POST /aeps/v3/cashwithdraw/bank1` | 📄 Docs captured |
| 8 | Cash Withdrawal Txn Status | `POST /aeps/v3/aepsquery/bank1` | 📄 Docs captured |

---

## 1. SEND OTP

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/send_otp` |
| **OpenAPI path** | `/aeps/v3/merchantkyc/send_otp` |
| **OpenAPI operationId** | `aeps-bank-1-merchant-ekyc-sendotp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `Content-type` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `latitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `longitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otpreqid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/send_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, accessmode, latitude, longitude, aadhaar, stateresp, ekyc_id, otp */ }'
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

- OpenAPI summary: `SEND OTP`
- Required (OpenAPI — may be polluted): `merchantcode, accessmode, latitude, longitude, aadhaar, stateresp, ekyc_id, otp, piddata`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 2. Re Send OTP

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/resend_otp` |
| **OpenAPI path** | `/aeps/v3/merchantkyc/resend_otp` |
| **OpenAPI operationId** | `re-send-otp` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `latitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `longitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/resend_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, aadhaar, latitude, longitude, stateresp, ekyc_id, accessmode, otp */ }'
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

- OpenAPI summary: `Re-Send OTP`
- Required (OpenAPI — may be polluted): `merchantcode, aadhaar, latitude, longitude, stateresp, ekyc_id, accessmode, otp, piddata`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 3. Verify OTP

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/verify_otp` |
| **OpenAPI path** | `/aeps/v3/merchantkyc/verify_otp` |
| **OpenAPI operationId** | `verify-otp-7` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `Content-type` | String | M/O | See auth |
| `authorizedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `latitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `longitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `stateresp` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ekyc_id` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/merchantkyc/verify_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, aadhaar, latitude, longitude, otp, stateresp, ekyc_id, piddata */ }'
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

- OpenAPI summary: `Verify OTP`
- Required (OpenAPI — may be polluted): `merchantcode, aadhaar, latitude, longitude, otp, stateresp, ekyc_id, piddata, accessmode`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 4. Daily Authentication API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/authenticate/bank1` |
| **OpenAPI path** | `/aeps/v3/authenticate/bank1` |
| **OpenAPI operationId** | `authenticate-1` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `Content-type` | String | M/O | See auth |
| `content-type` | String | M/O | See auth |
| `authorizedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/authenticate/bank1' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* RAW_BODY — see notes */ }'
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

- OpenAPI summary: `Daily Authentication API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 5. Balance Enquiry

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/balanceenquiry/bank1` |
| **OpenAPI path** | `/aeps/v3/balanceenquiry/bank1` |
| **OpenAPI operationId** | `balance-enquiry-2` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `Content-type` | String | M/O | See auth |
| `content-type` | String | M/O | See auth |
| `authorizedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/balanceenquiry/bank1' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* RAW_BODY — see notes */ }'
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

- OpenAPI summary: `Balance Enquiry`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 6. Mini Statement

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/ministatement/bank1` |
| **OpenAPI path** | `/aeps/v3/ministatement/bank1` |
| **OpenAPI operationId** | `mini-statement-1` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `content-type` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |
| `authorizedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/ministatement/bank1' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* RAW_BODY — see notes */ }'
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

- OpenAPI summary: `Mini Statement`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 7. Cash Withdrawal

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/cashwithdraw/bank1` |
| **OpenAPI path** | `/aeps/v3/cashwithdraw/bank1` |
| **OpenAPI operationId** | `cash-withdrawal` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | JWT |
| `Authorisedkey` | String | O* | UAT |
| `Content-Type` | String | M | JSON |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/cashwithdraw/bank1' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* RAW_BODY — see notes */ }'
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

- OpenAPI summary: `Cash Withdrawal`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 8. Cash Withdrawal Txn Status

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aepsquery/bank1` |
| **OpenAPI path** | `/aeps/v3/aepsquery/bank1` |
| **OpenAPI operationId** | `aeps-bank-1-cashwithdrawal-transaction-status-check-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | JWT |
| `Authorisedkey` | String | O* | UAT |
| `Content-Type` | String | M | JSON |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aepsquery/bank1' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* RAW_BODY — see notes */ }'
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

- OpenAPI summary: `Cash Withdrawal Txn Status`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


---

## Flows

1. `merchantkyc/send_otp` with Aadhaar + lat/long
2. Optional `resend_otp`
3. `verify_otp` with otp + stateresp + ekyc_id + piddata
4. Repeat eKYC if provider requires second pass
5. `authenticate/bank1` then txn APIs `*/bank1`
