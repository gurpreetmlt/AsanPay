# PaySprint — AEPS

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`AEPS_DETAILS.md`](AEPS_DETAILS.md). Jab implement ho → root `PaySprint/AEPS.md`.

**Provider:** PaySprint (AEPS)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~299–446)

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

AePS suite covering **2FA registration/auth** for multiple banks (Bank2/3/5/6 variants), then:

- Balance enquiry
- Withdraw OTP + cash withdraw
- Ministatement
- Bank list
- Transaction status query
- Aadhaar Pay + query
- Merchant base location update

**MINIMUM REQUEST TIMEOUT** called out as **180 seconds** on several txn pages.

Cash deposit limits mentioned in Doc 2 NSDL section (min ₹100 / max ₹10,000) — NSDL CD is a separate suite.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Registration | `POST /aeps/kyc/Twofactorkyc/registration` | 📄 Docs captured |
| 2 | Authenticate | `POST /aeps/kyc/Twofactorkyc/authentication` | 📄 Docs captured |
| 3 | Registartion | `POST /aeps/kyc/Twofactorkyc/register_agent` | 📄 Docs captured |
| 4 | Authenticate | `POST /aeps/kyc/Twofactorkyc/auth_login` | 📄 Docs captured |
| 5 | Authentication | `POST /aeps/kyc/v5/authentication` | 📄 Docs captured |
| 6 | Authentication | `POST /aeps/kyc/v6/authentication` | 📄 Docs captured |
| 7 | Enquiry | `POST /aeps/balanceenquiry/index` | 📄 Docs captured |
| 8 | AePS Transaction Initiate OTP API | `POST /aeps/txnotp/index` | 📄 Docs captured |
| 9 | Wihdraw with Authencity NEW | `POST /aeps/authcashwithdraw/index` | 📄 Docs captured |
| 10 | Mini Statement | `POST /aeps/ministatement/index` | 📄 Docs captured |
| 11 | Bank list | `POST /aeps/banklist/index` | 📄 Docs captured |
| 12 | Cash Withdraw transaction status query | `POST /aeps/aepsquery/query` | 📄 Docs captured |
| 13 | Aadhar Pay | `POST /aadharpay/aadharpay/index` | 📄 Docs captured |
| 14 | Aadhar pay transaction status query | `POST /aadharpay/aadharpayquery/query` | 📄 Docs captured |
| 15 | Merchant Location Update APIBank2/5/6 | `POST /onboard/onboard/update_location` | 📄 Docs captured |

---

## 1. Registration

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/registration` |
| **OpenAPI path** | `/aeps/kyc/Twofactorkyc/registration` |
| **OpenAPI operationId** | `aeps-two-factor-authentication-register` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/registration' \
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

- OpenAPI summary: `Registration`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 2. Authenticate

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/authentication` |
| **OpenAPI path** | `/aeps/kyc/Twofactorkyc/authentication` |
| **OpenAPI operationId** | `aeps-two-factor-authentication-authenticate` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/authentication' \
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

- OpenAPI summary: `Authenticate`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 3. Registartion

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/register_agent` |
| **OpenAPI path** | `/aeps/kyc/Twofactorkyc/register_agent` |
| **OpenAPI operationId** | `aeps-two-factor-authentication-bank-3-registartion` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/register_agent' \
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

- OpenAPI summary: `Registartion`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 4. Authenticate

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/auth_login` |
| **OpenAPI path** | `/aeps/kyc/Twofactorkyc/auth_login` |
| **OpenAPI operationId** | `aeps-two-factor-authentication-bank-3-authenticate` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/Twofactorkyc/auth_login' \
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

- OpenAPI summary: `Authenticate`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 5. Authentication

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/v5/authentication` |
| **OpenAPI path** | `/aeps/kyc/v5/authentication` |
| **OpenAPI operationId** | `aeps-two-factor-authentication-bank-5-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/v5/authentication' \
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

- OpenAPI summary: `Authentication`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 6. Authentication

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/v6/authentication` |
| **OpenAPI path** | `/aeps/kyc/v6/authentication` |
| **OpenAPI operationId** | `authentication-2` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balanceamount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `clientrefno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/v6/authentication' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, amount, balanceamount, bankrrn, bankiin, clientrefno */ }'
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

- OpenAPI summary: `Authentication`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 7. Enquiry

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/balanceenquiry/index` |
| **OpenAPI path** | `/aeps/balanceenquiry/index` |
| **OpenAPI operationId** | `enquiry` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balanceamount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `clientrefno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/balanceenquiry/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, amount, balanceamount, bankrrn, bankiin, clientrefno */ }'
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

- OpenAPI summary: `Enquiry`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 8. AePS Transaction Initiate OTP API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/txnotp/index` |
| **OpenAPI path** | `/aeps/txnotp/index` |
| **OpenAPI operationId** | `aeps-transaction-initiate-otp-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `otp_refid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txnstatus` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/txnotp/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* otp_refid, txnstatus, ackno, amount, bankrrn */ }'
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

- OpenAPI summary: `AePS Transaction Initiate OTP API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 9. Wihdraw with Authencity NEW

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/authcashwithdraw/index` |
| **OpenAPI path** | `/aeps/authcashwithdraw/index` |
| **OpenAPI operationId** | `aeps-cashwithdraw-transaction-with-merchant-authencity-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `txnstatus` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `datetime` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balanceamount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `date` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/authcashwithdraw/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* txnstatus, ackno, amount, bankrrn, datetime, balanceamount, bankiin, date */ }'
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

- OpenAPI summary: `Wihdraw with Authencity NEW`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 10. Mini Statement

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/ministatement/index` |
| **OpenAPI path** | `/aeps/ministatement/index` |
| **OpenAPI operationId** | `mini-statement` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `datetime` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balanceamount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `date` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txnType` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `narration` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/ministatement/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, datetime, balanceamount, bankrrn, bankiin, date, txnType, amount */ }'
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


## 11. Bank list

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/banklist/index` |
| **OpenAPI path** | `/aeps/banklist/index` |
| **OpenAPI operationId** | `bank-list-1` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/banklist/index' \
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

- OpenAPI summary: `Bank list`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 12. Cash Withdraw transaction status query

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/aepsquery/query` |
| **OpenAPI path** | `/aeps/aepsquery/query` |
| **OpenAPI operationId** | `cash-withdraw-transaction-status-query-1` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/aepsquery/query' \
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

- OpenAPI summary: `Cash Withdraw transaction status query`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 13. Aadhar Pay

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aadharpay/aadharpay/index` |
| **OpenAPI path** | `/aadharpay/aadharpay/index` |
| **OpenAPI operationId** | `aadhar-pay-1` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `balanceamount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `response` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aadharpay/aadharpay/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, balanceamount, bankrrn, bankiin, response */ }'
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

- OpenAPI summary: `Aadhar Pay`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 14. Aadhar pay transaction status query

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aadharpay/aadharpayquery/query` |
| **OpenAPI path** | `/aadharpay/aadharpayquery/query` |
| **OpenAPI operationId** | `aadhar-pay-transaction-status-query` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aadharpay/aadharpayquery/query' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, lat, long, accessmode, pipe */ }'
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

- OpenAPI summary: `Aadhar pay transaction status query`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, lat, long, accessmode`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 15. Merchant Location Update APIBank2/5/6

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/update_location` |
| **OpenAPI path** | `/onboard/onboard/update_location` |
| **OpenAPI operationId** | `aeps-merchant-base-location-update-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `lat` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `long` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/update_location' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, lat, long, accessmode, pipe */ }'
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

- OpenAPI summary: `Merchant Location Update APIBank2/5/6`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, lat, long, accessmode`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


---

## Flows

### Daily 2FA then txn

1. Bank-specific **Registration** (once) → **Authentication** / auth_login (daily)
2. `banklist/index` for IIN/bank master
3. Balance / Ministatement / Cash withdraw / Aadhaar Pay with biometric `piddata` (often AES-encrypted body)
4. On withdraw: may need `txnotp` then `authcashwithdraw`
5. Always support `aepsquery/query` / aadharpay query for pending

### Bank pipe variants

- Twofactorkyc/* = Bank2/3 style
- kyc/v5, v6 = Bank5/6 auth variants
- Bank4 uses `/aeps/v3/*` — see [`AEPS_BANK4.md`](AEPS_BANK4.md)
- Bank1 uses `/aeps/v3/*/bank1` + merchant eKYC — see [`BANK1_EKYC.md`](BANK1_EKYC.md)
