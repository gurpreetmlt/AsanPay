# PaySprint — Balance (Main + Cash Wallet)

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`BALANCE_DETAILS.md`](BALANCE_DETAILS.md). Jab implement ho → root `PaySprint/BALANCE.md` (AEPS-style) banega.

**Provider:** PaySprint (Balance (Main + Cash Wallet))
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~19–33)

### Shared headers / auth

| Header | Type | Mandatory | Env | Description |
|--------|------|-----------|-----|-------------|
| `Token` | String | M | UAT+Live | JWT (HS256) signed with partner JWT key |
| `Authorisedkey` | String | M on UAT* | UAT | Required on UAT if partner is not on shared IP; **not required on Live** (provider note) |
| `Content-Type` | String | M | Both | `application/json` (some pages show `text/plain` — prefer JSON) |

> *Header casing in docs varies: `Token`/`token`, `Authorisedkey`/`authorisedkey`/`authorizedkey`. Send the casing shown on each page when debugging; normalize once confirmed live.


### Shared auth (all PaySprint REST)

1. Build JWT payload: `{ "timestamp": <ms or sec — docs conflict>, "partnerId": "<PARTNERID>", "reqid": <unique int> }`
2. Sign with **HS256** using partner JWT secret
3. Pass JWT in header `Token`
4. Some products also require **AES-128** body encryption (key + IV from credentials) — see ONBOARDING / AEPS encryption notes
5. **IP allowlist:** Indian IPs / India server location only
6. UAT credentials table (masked): JWT KEY, AES KEY, AES IV, PARTNERID, Authorisedkey — never commit secrets


### Common response envelope

| Field | Type | Description |
|-------|------|-------------|
| `status` | Boolean/Number | Success flag (often `true`/`false` or `1`/`0` — **varies by product**) |
| `response_code` | Number/String | Provider response code |
| `message` | String | Human-readable status |
| `data` | Object/Array | Payload when present |
| `ackno` / `referenceid` / `utr` | String | Txn identifiers (product-specific) |
| `errorcode` | String | Sometimes present on AePS/MATM failures |


### PDF / OpenAPI pollution (apply to all suites)

- OpenAPI `servers.url` often `https://xyz.xyz.in/...` — replace with `api.paysprint.in` (Live) / PaySprint-provided UAT host
- `operationId` / titles frequently **copy-pasted** across endpoints (e.g. `merchant-activation-api-copy`)
- `required[]` arrays often **bleed** from the next endpoint into the previous
- Many AePS bodies documented only as `RAW_BODY` — trust param tables + partner samples over OpenAPI schema
- Typos in docs: `ENVIORMENT`, `RESTICTION`, `Registartion`, `Withdrawl`, `RESPONSE HANDING`, `bussiness`, `secrect`
- Prefer **param tables + curl** over broken OpenAPI blocks


---

## Product notes

PaySprint exposes wallet balance checks before product transactions.

| Wallet | Endpoint | Response field (sample) |
|--------|----------|-------------------------|
| Main | `POST /balance/balance/mainbalance` | `wallet` |
| Cash | `POST /balance/balance/cashbalance` | `cdwallet` |

OpenAPI operationIds: `main-balance`, `cash-balance`.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Main Balance | `POST /balance/balance/mainbalance` | 📄 Docs captured |
| 2 | Cash Balance | `POST /balance/balance/cashbalance` | 📄 Docs captured |

---


## 1. Main Balance(Credit Balance)

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/balance/balance/mainbalance` |
| **OpenAPI path** | `/balance/balance/mainbalance` |
| **OpenAPI operationId** | `main-balance` |
| **OpenAPI server (polluted)** | `https://xyz.xyz.in/service-api/api/v1/service` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | See shared auth |
| `Authorisedkey` | String | M | See shared auth |
| `Content-Type` | String | M | See shared auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `wallet` | — | See notes | M/O | From OpenAPI / page (confirm) |
| `cdwallet` | — | See notes | M/O | From OpenAPI / page (confirm) |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/balance/balance/mainbalance' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* see param table */ }'
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

- OpenAPI summary: `Main Balance(Credit Balance)`
- Required (OpenAPI, may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT base host with PaySprint before coding.

### Gotchas

- Trust live partner sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN) in logs.
- Timeout → treat Pending + call status/query API where available.

### Related

—


## 2. Cash Balance(Debit Balance)

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/balance/balance/cashbalance` |
| **OpenAPI path** | `/balance/balance/cashbalance` |
| **OpenAPI operationId** | `cash-balance` |
| **OpenAPI server (polluted)** | `https://xyz.xyz.in/service-api/api/v1/service` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | See shared auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `cdwallet` | — | See notes | M/O | From OpenAPI / page (confirm) |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/balance/balance/cashbalance' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* see param table */ }'
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

- OpenAPI summary: `Cash Balance(Debit Balance)`
- Required (OpenAPI, may be polluted): `RAW_BODY / unclear`
- Confirm Live vs UAT base host with PaySprint before coding.

### Gotchas

- Trust live partner sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN) in logs.
- Timeout → treat Pending + call status/query API where available.

### Related

—
