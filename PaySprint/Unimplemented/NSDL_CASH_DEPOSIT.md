# PaySprint — NSDL Cash Deposit

> Raw PaySprint docs. **Cheat-sheet:** [`NSDL_CASH_DEPOSIT_DETAILS.md`](NSDL_CASH_DEPOSIT_DETAILS.md).

**Provider:** PaySprint (NSDL Cash Deposit)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~1–18)

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

NSDL-backed AePS Cash Deposit. Related to AePS banking; keep separate from InstantPay AePS CD if any.

## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | NSDL Cash Deposit Transaction Status Query | `POST /cashdeposit/V3/Cashdeposit/query` | 📄 Docs captured |

---

## Overview (from PDF)

AePS **Cash Deposit** via NSDL — deposit cash using Aadhaar + mobile + biometric + bank.

### Specs / limits

| Item | Value |
|------|-------|
| Merchant 2FA | Mandatory per NPCI for calendar day |
| Biometric login | Required same calendar day before CD |
| Amount | Min **₹100**, Max **₹10,000** |
| Customer inputs | Aadhaar, mobile (linked), bank name, amount |

### Process (provider)

1. Merchant 2FA success for the day
2. Collect customer Aadhaar / mobile / bank / amount
3. Biometric auth (fingerprint/iris)
4. Customer hands cash → merchant initiates credit
5. Receipt / notification
6. Status via query API

> PDF section also titled "NSDL Cash Deposit Transaction" — initiate endpoint may be documented outside OpenAPI path extract (only status query path found in OpenAPI). Confirm initiate URL with PaySprint / adjacent pages when integrating.


## 1. NSDL Cash Deposit Transaction Status Query

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/cashdeposit/V3/Cashdeposit/query` |
| **OpenAPI path** | `/cashdeposit/V3/Cashdeposit/query` |
| **OpenAPI operationId** | `nsdl-cash-deposit-transaction-status-query` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `txnstatus` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `bankrrn` | — | From docs | M/O | Confirm |
| `settled_id` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/cashdeposit/V3/Cashdeposit/query' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* txnstatus, ackno, amount, bankrrn, settled_id */ }'
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

- Summary: `NSDL Cash Deposit Transaction Status Query`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

Merchant daily 2FA → CD transaction → `Cashdeposit/query` for status.
