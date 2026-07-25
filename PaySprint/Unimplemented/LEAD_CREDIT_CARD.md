# PaySprint — Lead Generation + Credit Card

> Raw PaySprint docs. **Cheat-sheet:** [`LEAD_CREDIT_CARD_DETAILS.md`](LEAD_CREDIT_CARD_DETAILS.md).

**Provider:** PaySprint (Lead Generation + Credit Card)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~284–313)

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

**Lead Generation** status check + **Credit Card** UTM generation / status (Credilio / SBM RuPay UPI CC marketing pages in PDF).

External references: `customer.credilio.in`, product UTM links.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Lead status check API | `POST /lead/generation/status_check` | 📄 Docs captured |
| 2 | Generate UTM | `POST /lead/creditcard/get_utm` | 📄 Docs captured |
| 3 | UTM Status Check | `POST /lead/creditcard/status_check` | 📄 Docs captured |

---

## 1. Lead status check API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/lead/generation/status_check` |
| **OpenAPI path** | `/lead/generation/status_check` |
| **OpenAPI operationId** | `lead-status-check-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `merchantcode` | — | From docs | M/O | Confirm |
| `mobile_no` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `product` | — | From docs | M/O | Confirm |
| `pincode` | — | From docs | M/O | Confirm |
| `state` | — | From docs | M/O | Confirm |
| `type` | — | From docs | M/O | Confirm |
| `link` | — | From docs | M/O | Confirm |
| `request_id` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/lead/generation/status_check' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, merchantcode, mobile_no, email, product, pincode, state, type */ }'
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

- Summary: `Lead status check API`
- Required (may be polluted): `refid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. Generate UTM

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/lead/creditcard/get_utm` |
| **OpenAPI path** | `/lead/creditcard/get_utm` |
| **OpenAPI operationId** | `create-credit-card-generate-utm-link-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `authorisedkey` | String | M/O | See auth |
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `merchantcode` | — | From docs | M/O | Confirm |
| `type` | — | From docs | M/O | Confirm |
| `link` | — | From docs | M/O | Confirm |
| `request_id` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `pan` | — | From docs | M/O | Confirm |
| `product` | — | From docs | M/O | Confirm |
| `txn_status` | — | From docs | M/O | Confirm |
| `referral_link` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/lead/creditcard/get_utm' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, merchantcode, type, link, request_id, mobile, pan, product */ }'
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

- Summary: `Generate UTM`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 3. UTM Status Check

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/lead/creditcard/status_check` |
| **OpenAPI path** | `/lead/creditcard/status_check` |
| **OpenAPI operationId** | `utm-status-check` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `merchantcode` | — | From docs | M/O | Confirm |
| `mobile` | — | From docs | M/O | Confirm |
| `pan` | — | From docs | M/O | Confirm |
| `product` | — | From docs | M/O | Confirm |
| `txn_status` | — | From docs | M/O | Confirm |
| `referral_link` | — | From docs | M/O | Confirm |
| `resume_link` | — | From docs | M/O | Confirm |
| `ex_status` | — | From docs | M/O | Confirm |
| `ex_remarks` | — | From docs | M/O | Confirm |
| `ex_sub_status` | — | From docs | M/O | Confirm |
| `last_update_date` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/lead/creditcard/status_check' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, merchantcode, mobile, pan, product, txn_status, referral_link, resume_link */ }'
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

- Summary: `UTM Status Check`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

Create/check lead → generate UTM for CC → status_check until approved/rejected.
