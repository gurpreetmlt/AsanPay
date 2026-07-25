# PaySprint — AEPS Bank4

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`AEPS_BANK4_DETAILS.md`](AEPS_BANK4_DETAILS.md). Jab implement ho → root `PaySprint/AEPS_BANK4.md`.

**Provider:** PaySprint (AEPS Bank4)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~447–539)

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

**Bank4** (City Union Bank onboarding labeled in operationId) AePS v3 APIs + v2 onboard.

Distinct path prefix: `/onboard/v2/...` and `/aeps/v3/...`.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Generate Onboarding URL | `POST /onboard/v2/onboard/getonboardurl` | 📄 Docs captured |
| 2 | Onboard Status check | `POST /onboard/v2/onboard/getonboardstatus` | 📄 Docs captured |
| 3 | Authentication | `POST /aeps/v3/authenticate/index` | 📄 Docs captured |
| 4 | Enquiry | `POST /aeps/v3/balanceenquiry/index` | 📄 Docs captured |
| 5 | Withdrawal API | `POST /aeps/v3/cashwithdraw/index` | 📄 Docs captured |
| 6 | Ministatement API | `POST /aeps/v3/ministatement/index` | 📄 Docs captured |
| 7 | Withdrawl transaction status API | `POST /aeps/v3/aepsquery/query` | 📄 Docs captured |
| 8 | Bank list | `POST /aeps/banklist/index` | 📄 Docs captured |
| 9 | Aadhaar Pay API | `POST /aeps/v3/aadharpay/index` | 📄 Docs captured |
| 10 | Aadhar pay transaction status query | `POST /aadharpay/aadharpayquery/query` | 📄 Docs captured |

---

## 1. Generate Onboarding URL

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/v2/onboard/getonboardurl` |
| **OpenAPI path** | `/onboard/v2/onboard/getonboardurl` |
| **OpenAPI operationId** | `city-unioun-bank-onboarding` |

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
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/v2/onboard/getonboardurl' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, pipe */ }'
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

- OpenAPI summary: `Generate Onboarding URL`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, pipe`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 2. Onboard Status check

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/v2/onboard/getonboardstatus` |
| **OpenAPI path** | `/onboard/v2/onboard/getonboardstatus` |
| **OpenAPI operationId** | `merchant-onboard-status-check-api-for-bank1-and-bank4` |

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
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/v2/onboard/getonboardstatus' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, pipe */ }'
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

- OpenAPI summary: `Onboard Status check`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, pipe`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 3. Authentication

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/authenticate/index` |
| **OpenAPI path** | `/aeps/v3/authenticate/index` |
| **OpenAPI operationId** | `authenticate` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/authenticate/index' \
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


## 4. Enquiry

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/balanceenquiry/index` |
| **OpenAPI path** | `/aeps/v3/balanceenquiry/index` |
| **OpenAPI operationId** | `balance-enquiry-api` |

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
| `txnstatus` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/balanceenquiry/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, amount, balanceamount, bankrrn, bankiin, clientrefno, txnstatus */ }'
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


## 5. Withdrawal API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/cashwithdraw/index` |
| **OpenAPI path** | `/aeps/v3/cashwithdraw/index` |
| **OpenAPI operationId** | `withdrawal-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `txnstatus` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `datetime` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/cashwithdraw/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* txnstatus, ackno, amount, bankrrn, datetime, bankiin */ }'
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

- OpenAPI summary: `Withdrawal API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 6. Ministatement API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/ministatement/index` |
| **OpenAPI path** | `/aeps/v3/ministatement/index` |
| **OpenAPI operationId** | `ministatement-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `ackno` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `datetime` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankrrn` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `bankiin` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `date` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `txnType` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `amount` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `narration` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/ministatement/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* ackno, datetime, bankrrn, bankiin, date, txnType, amount, narration */ }'
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

- OpenAPI summary: `Ministatement API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 7. Withdrawl transaction status API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aepsquery/query` |
| **OpenAPI path** | `/aeps/v3/aepsquery/query` |
| **OpenAPI operationId** | `withdrawl-transaction-status-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aepsquery/query' \
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

- OpenAPI summary: `Withdrawl transaction status API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 8. Bank list

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
| `Authorisedkey` | String | M/O | See auth |
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


## 9. Aadhaar Pay API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aadharpay/index` |
| **OpenAPI path** | `/aeps/v3/aadharpay/index` |
| **OpenAPI operationId** | `aadhaar-pay-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/v3/aadharpay/index' \
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

- OpenAPI summary: `Aadhaar Pay API`
- Required (OpenAPI — may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 10. Aadhar pay transaction status query

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

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| _(RAW_BODY)_ | Object | Encrypted/plain JSON | M | Schema missing in OpenAPI |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aadharpay/aadharpayquery/query' \
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

- OpenAPI summary: `Aadhar pay transaction status query`
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

1. `onboard/v2/onboard/getonboardurl` → merchant completes flow
2. `getonboardstatus`
3. `aeps/v3/authenticate/index` (daily)
4. Balance / Cash withdraw / Ministatement / Aadhaar Pay under `/aeps/v3/...`
5. Status via `aeps/v3/aepsquery/query` (operationId typo: `withdrawl-...`)
