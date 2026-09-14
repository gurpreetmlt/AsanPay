# VyaparAPI — Partner API reference

Source: VyaparAPI portal docs (screenshots, 14 Sep 2026).

**Base URL:** `https://api.vyaparapi.com`

Auth for recharge / wallet / status / dispute / vendor callback: query `api_key` (string, required) — unique key from the Vyapar API Portal.

**Do not mark a transaction failed** unless VyaparAPI returns a **fail `statusCode` from the response-code table below**. HTTP can still be `200` with a business `statusCode`. Separate HTTP errors (`400`–`500`) are listed at the end.

Transaction `status` values: `SUCCESS` | `PENDING` | `FAILED` | `DISPUTE` | `REFUND`.

---

## 1. Get Wallet Balance

Current buyer (partner) and seller (vendor) wallet balances.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/balance?api_key={{API}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | API key from Vyapar API Portal |

**Example response** (HTTP `200`):

```json
{
  "status": true,
  "partnerBalance": "592951.23",
  "partnerHold": "12410.00",
  "vendorBalance": "1100",
  "vendorHold": "100"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | boolean | API success (`true` / `false`) |
| `partnerBalance` | string | Partner / buyer current balance |
| `partnerHold` | string | Partner / buyer amount on hold |
| `vendorBalance` | string | Vendor / seller current balance |
| `vendorHold` | string | Vendor / seller amount on hold |

---

## 2. Recharge Request

Recharge a mobile or DTH number (query parameters).

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/recharge?amount={{AMOUNT}}&operator={{OPERATOR}}&partnerid={{UNIQUE_REQUEST_ID}}&number={{NUMBER}}&api_key={{API}}&circle={{CIRCLE}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | API key |
| `partnerid` | string | Yes | Unique request / transaction id (must be unique; duplicate → `106`) |
| `amount` | string | Yes | Recharge amount |
| `number` | string | Yes | Number to recharge (mobile or DTH) |
| `operator` | string | Yes | VyaparAPI operator code (see Operators) |
| `circle` | string | No | VyaparAPI circle code (see Circles) |

**Example response** (HTTP `200`):

```json
{
  "statusCode": 200,
  "status": "SUCCESS | PENDING | FAILED | DISPUTE | REFUND",
  "message": "",
  "liveid": "",
  "tid": "VYAPAR API RESPONSE/TRANSACTION ID",
  "partnerid": "Your UNIQUE REQUEST ID",
  "ipAddress": "",
  "requestTime": 1736098874458,
  "responseTime": 1736098874650,
  "operator": "Jio",
  "number": "",
  "amount": "",
  "debited": 0,
  "credited": "",
  "partnerBalance": 9933128.56,
  "partnerHold": "0.00",
  "circle": "ALL"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | Business response code (see tables below) |
| `status` | string | `SUCCESS`, `FAILED`, `REFUND`, `PENDING`, `DISPUTE` |
| `message` | string | Message; may be empty |
| `liveid` | string | Recharge live id / OP id after success |
| `tid` | string | VyaparAPI unique transaction id |
| `partnerid` | string | Your unique request id |
| `ipAddress` | string | Request IP |
| `requestTime` | epoch | When the request was sent |
| `responseTime` | epoch | When VyaparAPI responded |
| `operator` | string | Operator name |
| `circle` | string | Circle name |
| `number` | string | Number recharged |
| `amount` | string | Amount requested |
| `debited` | string / number | Rupees debited from wallet for this txn |
| `credited` | string | Credit amount if any |
| `partnerBalance` | string / number | Partner / buyer balance after deduction |
| `partnerHold` | string | Partner / buyer hold balance (else `0`) |

---

## 3. Get Transaction Status

Current status of a recharge.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/transaction/status?partnerid={{UNIQUE_REQUEST_ID}}&tid={{TID}}&api_key={{YOUR_API_KEY}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | API key |
| `partnerid` | string | Yes | Partner unique request id sent at recharge |
| `tid` | string | No | VyaparAPI `tid` from recharge. **`tid` or `partnerid` — at least one required** |

**Example response** (HTTP `200`):

```json
{
  "statusCode": 118,
  "status": "PENDING",
  "message": "Some error occured (C) VyaparAPI",
  "liveid": "",
  "tid": "e8767f8c-330a-4d2d-9ae5-0875f480d9ed",
  "partnerid": "1234567890",
  "ipAddress": "",
  "requestTime": 1736936102558,
  "responseTime": 1736936102559
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | Business response code |
| `status` | string | `SUCCESS`, `FAILED`, `REFUND`, `PENDING`, `DISPUTE` |
| `message` | string | Message; may be empty |
| `liveid` | string | Live id / OP id after success |
| `tid` | string | VyaparAPI transaction id |
| `partnerid` | string | Your request id |
| `ipAddress` | string | Request IP |
| `requestTime` | epoch | Request time |
| `responseTime` | epoch | Response time |

---

## 4. Raise Dispute

Raise a dispute on a transaction (portal copy also says “get current status”).

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/dispute?partnerid={{UNIQUE_REQUEST_ID}}&api_key={{API_KEY}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `api_key` | string | Yes | API key |
| `partnerid` | string | Yes | Partner unique request id sent at recharge |

**Example response** (HTTP `200`):

```json
{
  "statusCode": 121,
  "message": "Transaction Disputed!",
  "requestTime": 1736964982896,
  "tid": "ac46be5a-2116-437b-8fe6-7d1efdb4c610",
  "status": "DISPUTE",
  "responseTime": 1736964982947,
  "ipAddress": ""
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | Business response code |
| `status` | string | `SUCCESS`, `FAILED`, `REFUND`, `PENDING`, `DISPUTE` |
| `message` | string | Message; may be empty |
| `tid` | string | VyaparAPI transaction id |
| `ipAddress` | string | Request IP |
| `requestTime` | epoch | Request time |
| `responseTime` | epoch | Response time |

Note: the portal **example** uses `statusCode` `121` with message `Transaction Disputed!`. The **response-code table** maps `121` to “already refunded” and success dispute to `134` / `135`. Treat the table as the canonical mapping; confirm live behaviour before coding fail/success on `121`.

---

## 5. Vendor Callback

Update transaction status **at** the VyaparAPI portal (vendor → Vyapar).

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/callback/<YOUR_API_KEY>`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `[PARAM]` | string | Yes | Same parameters sent at recharge time |

**Example response** (HTTP `200`):

```json
{
  "statusCode": 128,
  "status": "SUCCESS",
  "message": "Status Updated",
  "ipAddress": "::1",
  "tid": "",
  "requestTime": 1737018126129,
  "responseTime": 1737018126164,
  "savedAPIData": {
    "tid": "",
    "vendorid": "",
    "liveid": "",
    "status": "",
    "success": "",
    "failed": "",
    "pending": "",
    "refund": "",
    "dispute": "",
    "error": "",
    "message": "",
    "errorKey": ""
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | string | Business response code |
| `status` | string | `SUCCESS`, `FAILED`, `REFUND`, `PENDING`, `DISPUTE` |
| `message` | string | Message; may be empty |
| `tid` | string | VyaparAPI transaction id |
| `ipAddress` | string | Request IP |
| `requestTime` | epoch | Request time |
| `responseTime` | epoch | Response time |
| `savedAPIData` | object | Keys/codes saved at the portal — use these when sending callback |

AsanPay as a **buyer/partner** typically receives **Partner Callback** (section 6), not this vendor-to-Vyapar endpoint.

---

## 6. Partner Callback API

VyaparAPI **pushes** status updates to the URL you configure as Partner Callback.

- **Method:** Configurable (`GET` or `POST`)
- **URL:** Provided by you when integrating Partner Callback

If you only give a domain with **no** custom parameter mapping, they send default keys (example below). You can customise keys/values per scenario in the portal.

**Example payload from VyaparAPI:**

```json
{
  "tid": "af4d7a98-7686-40ca-8482-fa6ccf14b262",
  "partnerid": "697044",
  "liveid": "123",
  "status": "SUCCESS",
  "message": "Recharge Processing"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `SUCCESS`, `FAILED`, `REFUND`, `PENDING`, `DISPUTE` |
| `liveid` | string | Live id on success |
| `partnerid` | string | Your unique request id from recharge |
| `message` | string | Associated message |
| `tid` | string | VyaparAPI transaction id |

---

## 7. Number Info APIs

Operator, circle, plans, and offers for mobile and DTH. These URLs in the portal docs **do not** show `api_key` on the query string.

### 7.1 Mobile Operator Circle

Lookup operator and circle for a mobile number. Checks internal mapping first, then PlanAPI.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/mobile?number={{MOBILE_NUMBER}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `number` | string | Yes | Mobile number to look up |

**Example response:**

```json
{
  "status": true,
  "data": {
    "number": "9876543210",
    "type": "MOBILE",
    "operator": "Jio",
    "operatorCode": "JIO",
    "circle": "Mumbai",
    "circleCode": "MUM"
  }
}
```

### 7.2 Mobile Plans

Plans for an operator and circle.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/mobile/plans?operator_code={{OP_CODE}}&circle_code={{CIRCLE_CODE}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operator_code` | string | Yes | VyaparAPI operator code |
| `circle_code` | string | No | VyaparAPI circle code |

**Example response:** `{ "status": true, "data": {} }`

### 7.3 Mobile Roffer

Exclusive offers for a number + operator.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/mobile/roffer?operator_code={{OP_CODE}}&mobile={{MOBILE_NUMBER}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operator_code` | string | Yes | VyaparAPI operator code |
| `mobile` | string | Yes | Mobile number |

**Example response:** `{ "status": true }` — `data` may be an object.

### 7.4 DTH Operator Circle

Lookup operator for a DTH number. Internal mapping first, then PlanAPI.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/dth?number={{DTH_NUMBER}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `number` | string | Yes | DTH subscriber id |

**Example response:**

```json
{
  "status": true,
  "data": {
    "number": "1234567890",
    "type": "DTH",
    "operator": "Tata Sky",
    "operatorCode": "TATA",
    "circle": null,
    "circleCode": null
  }
}
```

### 7.5 DTH Plans

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/dth/plans?operator_code={{OP_CODE}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operator_code` | string | Yes | VyaparAPI operator code |

**Example response:** `{ "status": true, "data": {} }`

### 7.6 DTH Info

Subscriber info for operator + DTH number.

- **Method:** `GET`
- **URL:** `https://api.vyaparapi.com/public/dth/info?operator_code={{OP_CODE}}&mobile={{DTH_NUMBER}}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operator_code` | string | Yes | VyaparAPI operator code |
| `mobile` | string | Yes | DTH subscriber number (query key is `mobile`) |

**Example response:** `{ "status": true, "data": {} }`

---

## 8. Operators

Use the **API Code** in recharge `operator`. Send the correct code.

| Name | API Code | Type | Amount blocked (₹) |
|------|----------|------|--------------------|
| AIRTEL | `AT` | Mobile | 299, 296, 319, 398, 579, 619, 649, 799, 859 |
| BSNL | `BL` | Mobile | 199 |
| Reliance JIO | `JIO` | Mobile | 299, 799, 189, 75, 355, 198, 199, 179, 122, 26, 339 |
| Voda & Idea (VI) | `VI` | Mobile | 509, 1849 |
| Airtel Digital Tv | `ATV` | DTH | 10–249 |
| DISH TV & (V D2H) | `DTV` | DTH | 10–199 |
| SUN DIRECT | `STV` | DTH | 10–199 |
| TATA PLAY | `TTV` | DTH | 10–199 |
| V D2H & (DISH TV) | `VTV` | DTH | 10–199 |
| JIO Lite | `JPL` | Mobile | 9 |
| TestOperator | `TESTOP` | Mobile | 0 |

Blocked amounts: recharge of that amount is not allowed for that operator (`statusCode` amount-blocked — portal lists this as `105`; see note under response codes).

---

## 9. Circles

Use **API Code** in recharge `circle` (optional).

| Name | API Code |
|------|----------|
| ALL | `0` |
| DELHI | `10` |
| UP(West) | `97` |
| PUNJAB | `02` |
| HP | `03` |
| HARYANA | `96` |
| J&K | `55` |
| UP(East) | `54` |
| MUMBAI | `92` |
| MAHARASHTRA | `90` |
| GUJARAT | `98` |
| MP | `93` |
| RAJASTHAN | `70` |
| KOLKATTA | `31` |
| West Bengal | `51` |
| ORISSA | `53` |
| ASSAM | `56` |
| NESA | `16` |
| BIHAR | `52` |
| KARNATAKA | `06` |
| CHENNAI | `40` |
| TAMIL NADU | `94` |
| KERALA | `95` |
| AP | `49` |
| SIKKIM | `99` |
| TRIPURA | `100` |
| CHHATTISGARH | `101` |
| GOA | `102` |
| MEGHALAY | `103` |
| MIZZORAM | `104` |
| JHARKHAND | `105` |

Mobile operator-circle lookup may return a **name** code (example `circleCode`: `MUM`) that is **not** the same as this numeric table. Map before sending recharge `circle` if required.

---

## 10. VyaparAPI response / status codes

Network HTTP is **always `200`** for these business codes. Use **`statusCode`**, not HTTP status, for txn outcome.

### Recharge

| Type | Code | Description |
|------|------|-------------|
| ERROR | `104` | Invalid operator/circle code |
| ERROR | `105` | Operator down — operator not active on VyaparAPI |
| ERROR | `105` | Amount blocked for that operator (portal lists **same code** as operator-down; confirm live) |
| ERROR | `106` | Duplicate request — `partnerid` must be unique |
| ERROR | `107` | Insufficient funds in partner wallet |
| ERROR | `108` | Partner margin not added for this operator/circle |
| ERROR | `109` | Phone number less or more than 10 digits |
| ERROR | `110` | Operator sent does not match the number’s operator |
| ERROR | `111` | Request out of defined margin for operator |
| ERROR | `112` | No stock for this recharge |
| ERROR | `114` | Failed after all attempts — no stock / cannot continue |
| SUCCESS | `131` | Recharge accepted. Result may be **Pending or Success**. If pending, wait for callback or poll status API |
| ERROR | `129` | Duplicate recharge — already success in the past |

### Status check

| Type | Code | Description |
|------|------|-------------|
| ERROR | `115` | Transaction not found for `partnerid` / `tid` |
| ERROR | `116` | Already success / failed / refund — use callback; this response still has latest status |
| ERROR | `117` | Error checking status with vendor |
| ERROR | `118` | Error at VyaparAPI while fetching status |
| SUCCESS | `132` | Status fetch OK, **no new updates** |
| SUCCESS | `133` | Status fetch OK, **new status returned** |

### Dispute

| Type | Code | Description |
|------|------|-------------|
| ERROR | `119` | `partnerid` missing |
| ERROR | `120` | Transaction not found for `partnerid` |
| ERROR | `121` | Transaction already refunded |
| SUCCESS | `134` | Marked disputed; vendors **not** notified yet |
| SUCCESS | `135` | Marked disputed; vendors notified |

### Vendor callback

| Type | Code | Description |
|------|------|-------------|
| ERROR | `122` | Vendor API not found — login and verify |
| ERROR | `123` | Vendor API / status key mismatch vs recharge API |
| ERROR | `124` | `vendorid` missing or different from recharge `tid` |
| ERROR | `125` | Transaction not found for given vendor id |
| ERROR | `126` | Already failed / refund / success — cannot update |
| ERROR | `127` | Live id missing or not configured |
| ERROR | `128` | Error at VyaparAPI (example JSON still shows `"status": "SUCCESS"` / `"Status Updated"` — trust `statusCode`) |
| SUCCESS | `136` | Status updated for the transaction |

### System

| Type | Code | Description |
|------|------|-------------|
| INFO | `171` | VyaparAPI scheduled downtime |
| ERROR | `172`–`180` | Generic error — contact admin with the code |

---

## 11. HTTP API error codes

These are **standard HTTP** statuses (not always `200`). They are **not** Vyapar-specific business codes.

**Never fail a transaction** unless a **fail `statusCode`** from section 10 is present. Any HTTP error can occur **and the txn may still have been processed**.

| HTTP | Type | Description |
|------|------|-------------|
| `400` | ERROR | Invalid request — mandatory fields missing |
| `401` | ERROR | Authentication failed |
| `403` | ERROR | Authentication failed |
| `404` | ERROR | Wrong API URL / domain / not found |
| `405` | ERROR | Method not allowed |
| `500` | ERROR | Server error at VyaparAPI |

---

## Integration notes (AsanPay)

1. Generate a unique `partnerid` per recharge; never reuse (`106` / `129`). AsanPay sends `transactions.txnRef` as `partnerid`.
2. On `131`, treat as **accepted**, not final success — poll status and/or wait for partner callback (`PENDING` vs `SUCCESS`).
3. On HTTP `4xx`/`5xx` **without** a fail `statusCode`, **do not** auto-fail the ledger — check status API.
4. Partner callback URL must be configured in the Vyapar portal (GET or POST).
5. Operator codes (`JIO`, `AT`, …) are recharge `operator`. Number-info `operatorCode` may differ (example DTH `TATA` vs recharge `TTV`) — map before calling recharge.
6. Keep `api_key` in Coolify env only; never commit it.

### Coolify / env (where to put the API key)

Backend service on Coolify → Environment variables:

```
VYAPARAPI_API_KEY=<your VyaparAPI portal api_key>
VYAPARAPI_BASE_URL=https://api.vyaparapi.com
VYAPARAPI_CALLBACK_SECRET=<long random secret, 16+ chars>
```

Partner Callback URL in Vyapar portal:

```
https://<your-backend-host>/api/webhooks/vyaparapi/callback?token=<same as VYAPARAPI_CALLBACK_SECRET>
```

Admin → Developer Options → Providers → **Bill Payment (BBPS)** → enable **VyaparAPI** on Mobile Prepaid / DTH (seeded inactive). Disable Eko for those services when going live.

```bash
npm run seed:providers -w @asanpay/backend
```

(On prod: run migrate if any, then seed providers via **EC2 SSH** inside the backend container / app dir.)
