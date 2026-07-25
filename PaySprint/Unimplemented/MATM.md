# PaySprint — MATM (Fino)

> Raw PaySprint docs. **Cheat-sheet:** [`MATM_DETAILS.md`](MATM_DETAILS.md).

**Provider:** PaySprint (MATM (Fino))
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~19–50)

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

Fino Micro ATM via PaySprint SDK + three-way recon + status query.

## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | MatmFINO Three-way API | `POST /matm/threeway/update` | 📄 Docs captured |
| 2 | MATMFINO WITHDRAW STATUS QUERY | `POST /matm/matmquery/query/` | 📄 Docs captured |

---

## Overview

**Fino MATM** (Micro ATM) — SDK driven cash withdraw / balance enquiry with **three-way recon**.

### Assets

- MATM SDK link / drive folders in PDF
- Three-way recon API must be called to finalize

### Status explanation

PDF includes Bank 6 style status tables — map `status` values carefully; do not invent enums.


## 1. MatmFINO Three way API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/matm/threeway/update` |
| **OpenAPI path** | `/matm/threeway/update` |
| **OpenAPI operationId** | `matmfino-three-way-api` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `txnstatus` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `bankrrn` | — | From docs | M/O | Confirm |
| `cardnumber` | — | From docs | M/O | Confirm |
| `response` | — | From docs | M/O | Confirm |
| `txnrefrenceNo` | — | From docs | M/O | Confirm |
| `transactiontype` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/matm/threeway/update' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* txnstatus, ackno, amount, bankrrn, cardnumber, response, txnrefrenceNo, transactiontype */ }'
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

- Summary: `MatmFINO Three-way API`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. MATMFINO WITHDRAW STATUS QUERY

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/matm/matmquery/query/` |
| **OpenAPI path** | `/matm/matmquery/query/` |
| **OpenAPI operationId** | `matmfino-withdraw-status-query` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `txnstatus` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `bankrrn` | — | From docs | M/O | Confirm |
| `cardnumber` | — | From docs | M/O | Confirm |
| `response` | — | From docs | M/O | Confirm |
| `txnrefrenceNo` | — | From docs | M/O | Confirm |
| `transactiontype` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/matm/matmquery/query/' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* txnstatus, ackno, amount, bankrrn, cardnumber, response, txnrefrenceNo, transactiontype */ }'
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

- Summary: `MATMFINO WITHDRAW STATUS QUERY`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

1. Onboard merchant (see ONBOARDING / callbacks)
2. Launch MATM SDK with tokens from PaySprint
3. On SDK callback → call `matm/threeway/update`
4. Status via `matm/matmquery/query/`
