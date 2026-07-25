# PaySprint — Payout

> Raw PaySprint docs. **Cheat-sheet:** [`PAYOUT_DETAILS.md`](PAYOUT_DETAILS.md).

**Provider:** PaySprint (Payout)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~75–118)

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

PaySprint **Payout** (IMPS/NEFT style). Flow in PDF:

1. Get list / add account
2. Upload document (ID proof validations mentioned in intro prose)
3. Account status check
4. Do transaction
5. Status enquiry

Intro prose mentions validating father/husband name on ID — compliance step before enabling payouts.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | GET LIST | `POST /payout/payout/list` | 📄 Docs captured |
| 2 | ADD ACCOUNT | `POST /payout/payout/add` | 📄 Docs captured |
| 3 | UPLOAD DOCUMENT | `POST /payout/payout/uploaddocument` | 📄 Docs captured |
| 4 | ACCOUNT STATUS CHECK | `POST /payout/Payout/accountstatus` | 📄 Docs captured |
| 5 | DO TRANSACTION | `POST /payout/payout/dotransaction` | 📄 Docs captured |
| 6 | STATUS ENQUIRY | `POST /payout/payout/status` | 📄 Docs captured |

---

## 1. GET LIST

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/payout/list` |
| **OpenAPI path** | `/payout/payout/list` |
| **OpenAPI operationId** | `get-list` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `bankid` | — | From docs | M/O | Confirm |
| `merchant_code` | — | From docs | M/O | Confirm |
| `account` | — | From docs | M/O | Confirm |
| `ifsc` | — | From docs | M/O | Confirm |
| `pipe` | — | From docs | M/O | Confirm |
| `doctype` | — | From docs | M/O | Confirm |
| `passbook` | — | From docs | M/O | Confirm |
| `panimage` | — | From docs | M/O | Confirm |
| `bene_id` | — | From docs | M/O | Confirm |
| `beneid` | — | From docs | M/O | Confirm |
| `merchantcode` | — | From docs | M/O | Confirm |
| `bankname` | — | From docs | M/O | Confirm |
| `account_type` | — | From docs | M/O | Confirm |
| `verified` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/payout/list' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* bankid, merchant_code, account, ifsc, pipe, doctype, passbook, panimage */ }'
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

- Summary: `GET LIST`
- Required (may be polluted): `bankid, merchant_code, account, ifsc, pipe, doctype, passbook, panimage, bene_id`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. ADD ACCOUNT

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/payout/add` |
| **OpenAPI path** | `/payout/payout/add` |
| **OpenAPI operationId** | `add-account` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `bankid` | — | From docs | M/O | Confirm |
| `merchant_code` | — | From docs | M/O | Confirm |
| `account` | — | From docs | M/O | Confirm |
| `ifsc` | — | From docs | M/O | Confirm |
| `pipe` | — | From docs | M/O | Confirm |
| `doctype` | — | From docs | M/O | Confirm |
| `passbook` | — | From docs | M/O | Confirm |
| `panimage` | — | From docs | M/O | Confirm |
| `bene_id` | — | From docs | M/O | Confirm |
| `beneid` | — | From docs | M/O | Confirm |
| `merchantid` | — | From docs | M/O | Confirm |
| `account_type` | — | From docs | M/O | Confirm |
| `acc_status` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/payout/add' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* bankid, merchant_code, account, ifsc, pipe, doctype, passbook, panimage */ }'
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

- Summary: `ADD ACCOUNT`
- Required (may be polluted): `bankid, merchant_code, account, ifsc, pipe, doctype, passbook, panimage, bene_id, beneid, merchantid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 3. UPLOAD DOCUMENT

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/payout/uploaddocument` |
| **OpenAPI path** | `/payout/payout/uploaddocument` |
| **OpenAPI operationId** | `upload-document` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `doctype` | — | From docs | M/O | Confirm |
| `passbook` | — | From docs | M/O | Confirm |
| `panimage` | — | From docs | M/O | Confirm |
| `bene_id` | — | From docs | M/O | Confirm |
| `beneid` | — | From docs | M/O | Confirm |
| `merchantid` | — | From docs | M/O | Confirm |
| `front_aadhar` | — | From docs | M/O | Confirm |
| `back_aadhar` | — | From docs | M/O | Confirm |
| `accountstatus` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/payout/uploaddocument' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* doctype, passbook, panimage, bene_id, beneid, merchantid, front_aadhar, back_aadhar */ }'
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

- Summary: `UPLOAD DOCUMENT`
- Required (may be polluted): `doctype, passbook, panimage, bene_id, beneid, merchantid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 4. ACCOUNT STATUS CHECK

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/Payout/accountstatus` |
| **OpenAPI path** | `/payout/Payout/accountstatus` |
| **OpenAPI operationId** | `account-status-check` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `beneid` | — | From docs | M/O | Confirm |
| `merchantid` | — | From docs | M/O | Confirm |
| `accountstatus` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/Payout/accountstatus' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* beneid, merchantid, accountstatus */ }'
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

- Summary: `ACCOUNT STATUS CHECK`
- Required (may be polluted): `beneid, merchantid`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 5. DO TRANSACTION

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/payout/dotransaction` |
| **OpenAPI path** | `/payout/payout/dotransaction` |
| **OpenAPI operationId** | `do-transaction` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `bankname` | — | From docs | M/O | Confirm |
| `acno` | — | From docs | M/O | Confirm |
| `benename` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `ifsccode` | — | From docs | M/O | Confirm |
| `mode` | — | From docs | M/O | Confirm |
| `charges` | — | From docs | M/O | Confirm |
| `utr` | — | From docs | M/O | Confirm |
| `dateadded` | — | From docs | M/O | Confirm |
| `txn_status` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/payout/dotransaction' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, ackno, bankname, acno, benename, amount, ifsccode, mode */ }'
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

- Summary: `DO TRANSACTION`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 6. STATUS ENQUIRY

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/payout/payout/status` |
| **OpenAPI path** | `/payout/payout/status` |
| **OpenAPI operationId** | `status-enquiry-7` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Content-Type` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `ackno` | — | From docs | M/O | Confirm |
| `bankname` | — | From docs | M/O | Confirm |
| `acno` | — | From docs | M/O | Confirm |
| `benename` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `ifsccode` | — | From docs | M/O | Confirm |
| `mode` | — | From docs | M/O | Confirm |
| `charges` | — | From docs | M/O | Confirm |
| `utr` | — | From docs | M/O | Confirm |
| `dateadded` | — | From docs | M/O | Confirm |
| `txn_status` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/payout/payout/status' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, ackno, bankname, acno, benename, amount, ifsccode, mode */ }'
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

- Summary: `STATUS ENQUIRY`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

1. `payout/list` — existing accounts
2. `payout/add` — add beneficiary account
3. `uploaddocument` — KYC docs if required
4. `accountstatus` — wait until approved
5. `dotransaction` — send money
6. `status` — enquire
7. Handle [`CALLBACKS`](CALLBACKS.md) payout webhook
