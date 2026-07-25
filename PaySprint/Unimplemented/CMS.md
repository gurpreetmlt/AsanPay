# PaySprint — CMS (Bank1 Airtel + Bank2)

> Raw PaySprint docs. **Cheat-sheet:** [`CMS_DETAILS.md`](CMS_DETAILS.md).

**Provider:** PaySprint (CMS (Bank1 Airtel + Bank2))
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~119–164)

### Shared headers / auth

| Header | Type | Mandatory | Env | Description |
|--------|------|-----------|-----|-------------|
| `Token` | String | M | UAT+Live | JWT (HS256) |
| `Authorisedkey` | String | M on UAT* | UAT | Not required on Live |
| `Content-Type` | String | M | Both | `application/json` |


JWT `Token` + UAT `Authorisedkey`. See [`AUTHENTICATION.md`](AUTHENTICATION.md).

### Common response envelope

| Field | Type | Description |
|-------|------|-------------|
| `status` | Boolean/Number | Success flag |
| `response_code` | Number/String | Provider code |
| `message` | String | Status text |
| `data` | Object/Array | Payload |
| `ackno` / `refid` / `utr` | String | Txn ids |


### PDF / OpenAPI pollution

- Placeholder server `xyz.xyz.in` / sample hosts — use PaySprint Live/UAT
- Copy-paste operationIds; prefer tables + curl
- Mask secrets/PII (`xxxxx`)


---

## Product notes

Cash Management / collection via **CMS Bank1 (Airtel CMS)** and **CMS Bank2**.

### Bank1 (Airtel)

- Generate URL (hosted CMS)
- Callback
- Balance enquiry / debit / low balance / posting / transaction enquiry

UAT host sample seen: `https://uat.cmscollections.in/airtel-cms?url=<jwt>`

### Bank2

- Generate URL
- Callback
- balance enquiry / balance_debit / posting


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Generate URL | `POST /airtelcms/V2/airtel/index` | 📄 Docs captured |
| 2 | TRANSACTION ENQUIRY | `POST /airtelcms/airtel/status` | 📄 Docs captured |
| 3 | Generate URL | `POST /cms/initiate/index` | 📄 Docs captured |

---

## 1. Generate URL

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/airtelcms/V2/airtel/index` |
| **OpenAPI path** | `/airtelcms/V2/airtel/index` |
| **OpenAPI operationId** | `generate-url-7` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `redirecturl` | — | From docs | M/O | Confirm |
| `txnid` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `commission` | — | From docs | M/O | Confirm |
| `transfertype` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/airtelcms/V2/airtel/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, latitude, longitude, redirecturl, txnid, amount, commission, transfertype */ }'
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

- Summary: `Generate URL`
- Required (may be polluted): `refid, latitude, longitude`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. TRANSACTION ENQUIRY

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/airtelcms/airtel/status` |
| **OpenAPI path** | `/airtelcms/airtel/status` |
| **OpenAPI operationId** | `airtel-cms-v2-transaction-status-enquiry` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `merchantcode` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `txnid` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `commission` | — | From docs | M/O | Confirm |
| `transfertype` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `dateadded` | — | From docs | M/O | Confirm |
| `remarks` | — | From docs | M/O | Confirm |
| `errormsg` | — | From docs | M/O | Confirm |
| `network` | — | From docs | M/O | Confirm |
| `refundtxnid` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/airtelcms/airtel/status' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, merchantcode, latitude, longitude, txnid, amount, commission, transfertype */ }'
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

- Summary: `TRANSACTION ENQUIRY`
- Required (may be polluted): `refid, merchantcode, latitude, longitude`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 3. Generate URL

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/cms/initiate/index` |
| **OpenAPI path** | `/cms/initiate/index` |
| **OpenAPI operationId** | `generate-url-10` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `responsecode` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/cms/initiate/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, latitude, longitude, responsecode */ }'
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

- Summary: `Generate URL`
- Required (may be polluted): `merchantcode, latitude, longitude`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

1. Generate URL for merchant/agent
2. User completes CMS UI
3. Callback + enquiry APIs for reconciliation
