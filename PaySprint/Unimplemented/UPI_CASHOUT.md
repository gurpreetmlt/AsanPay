# PaySprint — UPI Cashout

> Raw PaySprint docs. **Cheat-sheet:** [`UPI_CASHOUT_DETAILS.md`](UPI_CASHOUT_DETAILS.md).

**Provider:** PaySprint (UPI Cashout)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~366–388)

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

**UPI Cashout** — SDK token generation + txn status + callbacks.

Workflow page + SDK drive link. Sample hosted UI: `https://sit.paysprint.in/upi-cashout/?encdata=...` (mask encdata).


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | SDK TOKEN GENERATION | `POST /upi/cashout/get_token` | 📄 Docs captured |
| 2 | TRANSACTION STATUS CHECK | `POST /upi/cashout/txn_status` | 📄 Docs captured |

---

## 1. SDK TOKEN GENERATION

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/upi/cashout/get_token` |
| **OpenAPI path** | `/upi/cashout/get_token` |
| **OpenAPI operationId** | `upi-cashout-sdk-token-generation` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `User-Agent` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchant_code` | — | From docs | M/O | Confirm |
| `refid` | — | From docs | M/O | Confirm |
| `redirect_url` | — | From docs | M/O | Confirm |
| `token` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `customer_name` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `comm` | — | From docs | M/O | Confirm |
| `tds` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/upi/cashout/get_token' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchant_code, refid, redirect_url, token, ackno, customer_name, mobile, amount */ }'
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

- Summary: `SDK TOKEN GENERATION`
- Required (may be polluted): `merchant_code, refid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. TRANSACTION STATUS CHECK

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/upi/cashout/txn_status` |
| **OpenAPI path** | `/upi/cashout/txn_status` |
| **OpenAPI operationId** | `upi-cashout-transaction-status-check` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchant_code` | — | From docs | M/O | Confirm |
| `refid` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `customer_name` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `comm` | — | From docs | M/O | Confirm |
| `tds` | — | From docs | M/O | Confirm |
| `txn_status` | — | From docs | M/O | Confirm |
| `payer_name` | — | From docs | M/O | Confirm |
| `payer_amount` | — | From docs | M/O | Confirm |
| `payer_va` | — | From docs | M/O | Confirm |
| `rrn` | — | From docs | M/O | Confirm |
| `deviceid` | — | From docs | M/O | Confirm |
| `remarks` | — | From docs | M/O | Confirm |
| `payer_account` | — | From docs | M/O | Confirm |
| `payer_ifsc` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/upi/cashout/txn_status' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchant_code, refid, ackno, customer_name, mobile, amount, latitude, longitude */ }'
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

- Summary: `TRANSACTION STATUS CHECK`
- Required (may be polluted): `merchant_code, refid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

1. `upi/cashout/get_token` (SDK token)
2. Launch SDK / URL with encdata
3. `upi/cashout/txn_status`
4. CALLBACKS section for terminal states
