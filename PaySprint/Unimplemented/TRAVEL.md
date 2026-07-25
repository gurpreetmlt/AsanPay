# PaySprint — Travel (Train + Flight)

> Raw PaySprint docs. **Cheat-sheet:** [`TRAVEL_DETAILS.md`](TRAVEL_DETAILS.md).

**Provider:** PaySprint (Travel (Train + Flight))
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~314–365)

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

Travel suite: merchant register/status for **train** and **flight**, generate booking URLs, debit/status/cancel notes for train, flight callbacks.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Merchant Status Check | `POST /travel/merchant/status_check` | 📄 Docs captured |
| 2 | Merchant Registration | `POST /travel/merchant/register` | 📄 Docs captured |
| 3 | Generate URL | `POST /travel/railway/url/generate` | 📄 Docs captured |
| 4 | Merchant Registeration | `POST /travel/air/merchant/register` | 📄 Docs captured |
| 5 | Status Check | `POST /travel/air/merchant/status_check` | 📄 Docs captured |
| 6 | Generate URL | `POST /travel/air/url/generate` | 📄 Docs captured |

---

## 1. Merchant Status Check

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/merchant/status_check` |
| **OpenAPI path** | `/travel/merchant/status_check` |
| **OpenAPI operationId** | `merchant-status-check` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `pan_no` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `service_type` | — | From docs | M/O | Confirm |
| `dob` | — | From docs | M/O | Confirm |
| `firmname` | — | From docs | M/O | Confirm |
| `gender` | — | From docs | M/O | Confirm |
| `address` | — | From docs | M/O | Confirm |
| `city` | — | From docs | M/O | Confirm |
| `state` | — | From docs | M/O | Confirm |
| `country` | — | From docs | M/O | Confirm |
| `pincode` | — | From docs | M/O | Confirm |
| `shop_branch` | — | From docs | M/O | Confirm |
| `shop_address` | — | From docs | M/O | Confirm |
| `shop_city` | — | From docs | M/O | Confirm |
| `shop_state` | — | From docs | M/O | Confirm |
| `shop_country` | — | From docs | M/O | Confirm |
| `shop_pincode` | — | From docs | M/O | Confirm |
| `merchant_status` | — | From docs | M/O | Confirm |
| `encdata` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/merchant/status_check' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, pan_no, email, mobile, service_type, dob, firmname, gender */ }'
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

- Summary: `Merchant Status Check`
- Required (may be polluted): `merchantcode, pan_no, email, mobile, service_type, dob, firmname, gender, address, city, state, country, pincode, shop_branch, shop_address, shop_city, shop_state, shop_country, shop_pincode`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. Merchant Registration

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/merchant/register` |
| **OpenAPI path** | `/travel/merchant/register` |
| **OpenAPI operationId** | `merchant-registration` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `pan_no` | — | From docs | M/O | Confirm |
| `service_type` | — | From docs | M/O | Confirm |
| `dob` | — | From docs | M/O | Confirm |
| `firmname` | — | From docs | M/O | Confirm |
| `gender` | — | From docs | M/O | Confirm |
| `address` | — | From docs | M/O | Confirm |
| `city` | — | From docs | M/O | Confirm |
| `state` | — | From docs | M/O | Confirm |
| `country` | — | From docs | M/O | Confirm |
| `pincode` | — | From docs | M/O | Confirm |
| `shop_branch` | — | From docs | M/O | Confirm |
| `shop_address` | — | From docs | M/O | Confirm |
| `shop_city` | — | From docs | M/O | Confirm |
| `shop_state` | — | From docs | M/O | Confirm |
| `shop_country` | — | From docs | M/O | Confirm |
| `shop_pincode` | — | From docs | M/O | Confirm |
| `encdata` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/merchant/register' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, email, mobile, pan_no, service_type, dob, firmname, gender */ }'
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

- Summary: `Merchant Registration`
- Required (may be polluted): `merchantcode, email, mobile, pan_no, service_type, dob, firmname, gender, address, city, state, country, pincode, shop_branch, shop_address, shop_city, shop_state, shop_country, shop_pincode`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 3. Generate URL

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/railway/url/generate` |
| **OpenAPI path** | `/travel/railway/url/generate` |
| **OpenAPI operationId** | `generate-url-4` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `pan_no` | — | From docs | M/O | Confirm |
| `markup` | — | From docs | M/O | Confirm |
| `markup_type` | — | From docs | M/O | Confirm |
| `encdata` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/railway/url/generate' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, email, pan_no, markup, markup_type, encdata */ }'
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
- Required (may be polluted): `merchantcode, email, pan_no, markup, markup_type`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 4. Merchant Registeration

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/air/merchant/register` |
| **OpenAPI path** | `/travel/air/merchant/register` |
| **OpenAPI operationId** | `merchant-registeration` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `pan_no` | — | From docs | M/O | Confirm |
| `markup` | — | From docs | M/O | Confirm |
| `markup_type` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/air/merchant/register' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, email, pan_no, markup, markup_type */ }'
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

- Summary: `Merchant Registeration`
- Required (may be polluted): `merchantcode, email, pan_no, markup, markup_type`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 5. Status Check

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/air/merchant/status_check` |
| **OpenAPI path** | `/travel/air/merchant/status_check` |
| **OpenAPI operationId** | `status-check` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `markup` | — | From docs | M/O | Confirm |
| `markup_type` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/air/merchant/status_check' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, markup, markup_type */ }'
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

- Summary: `Status Check`
- Required (may be polluted): `merchantcode, markup, markup_type`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 6. Generate URL

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/travel/air/url/generate` |
| **OpenAPI path** | `/travel/air/url/generate` |
| **OpenAPI operationId** | `generate-url-9` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs | M/O | Confirm |
| `markup` | — | From docs | M/O | Confirm |
| `markup_type` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/travel/air/url/generate' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, markup, markup_type */ }'
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
- Required (may be polluted): `merchantcode, markup, markup_type`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

1. Merchant `register` + `status_check` (rail and/or air)
2. `url/generate` → hosted booking
3. Handle debit/status/cancel (train) and flight callbacks
