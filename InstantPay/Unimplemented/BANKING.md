# InstantPay — Banking (Connected Banking)

> Raw InstantPay Banking docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`BANKING_DETAILS.md`](BANKING_DETAILS.md). Jab implement ho → root `InstantPay/BANKING.md` (AEPS-style) banega.

**Provider:** InstantPay (Connected Banking)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

---

## Service-wise status

| # | Page / Service | InstantPay area | Status |
|---|----------------|-----------------|--------|
| 0 | Overview — Virtual Bank Accounts | Banking overview | 📄 Docs captured |
| 1 | Account Statement — Business Wallet | `POST /reports/statement` | 📄 Docs captured |
| 2 | Account Statement — Collect Orders | `POST /reports/statement` (`isOrder: true`) | 📄 Docs captured |
| 3 | Account Statement — Bank Accounts | `POST /reports/statement` (linked bank profile) | 📄 Docs captured |
| 4 | Balance Check — Business Wallet | `POST /accounts/balance` | 📄 Docs captured |
| 5 | Balance Check — Bank Account | `POST /accounts/balance` (linked bank; **chargeable**) | 📄 Docs captured |
| 6 | Contact Book — Overview | CRUD + tags | 📄 Docs captured |
| 7 | Contact Book — Add Tag | `POST /contacts/tag` | 📄 Docs captured |
| 8 | Contact Book — Update Tag | `PATCH /contacts/tag` | 📄 Docs captured |
| 9 | Contact Book — Delete Tag | `DELETE /contacts/tag` | 📄 Docs captured |
| 10 | Contact Book — List Tag | `GET /contacts/tag` | 📄 Docs captured |
| 11 | Contact Book — Add Contact | `POST /contacts/profile` | 📄 Docs captured |
| 12 | Contact Book — Update Contact | `PATCH /contacts/profile` | 📄 Docs captured |
| 13 | Contact Book — Delete Contact | `DELETE /contacts/profile` | 📄 Docs captured |
| 14 | Contact Book — List Contact | `GET /contacts/profile` | 📄 Docs captured |
| 15 | Contact Book — Add Address | `POST /contacts/address` | 📄 Docs captured |
| 16 | Contact Book — Update Address | `PATCH /contacts/address` | 📄 Docs captured |
| 17 | Contact Book — List Address | `GET /contacts/address` | 📄 Docs captured |
| 18 | Contact Book — Delete Address | `DELETE /contacts/address` | 📄 Docs captured |
| 19 | Contact Book — Add Payment Details | `POST /contacts/payment` | 📄 Docs captured |
| 20 | Contact Book — Set Primary Payment | `POST /contacts/payment/primary` | 📄 Docs captured |
| 21 | Contact Book — Delete Payment Details | `DELETE /contacts/payment` | 📄 Docs captured |
| 22 | Contact Book — Verify Payment | `POST /contacts/payment/verify` | 📄 Docs captured |
| 23 | Contact Book — Add Note | `POST /contacts/note` | 📄 Docs captured |
| 24 | Contact Book — Update Note | `PATCH /contacts/note/update` | 📄 Docs captured |
| 25 | Contact Book — Delete Note | `DELETE /contacts/note` | 📄 Docs captured |
| 26 | Contact Book — List Notes | `GET /contacts/note` | 📄 Docs captured |
| 27 | Contact Book — Add Business | `POST /contacts/business` | 📄 Docs captured |
| 28 | Contact Book — Update Business | `PATCH /contacts/business` | 📄 Docs captured |
| 29 | Contact Book — List Business | `GET /contacts/business` | 📄 Docs captured |
| 30 | Contact Book — Add Person | `POST /contacts/person` | 📄 Docs captured |
| 31 | Contact Book — Update Person | `PATCH /contacts/person` | 📄 Docs captured |
| 32 | Contact Book — List Person | `GET /contacts/person` | 📄 Docs captured |
| 33 | Contact Book — Delete Person | `DELETE /contacts/person` | 📄 Docs captured |
| 34 | UPI ATM — Overview | UPI QR Cash Withdrawal (concept + flow) | 📄 Docs captured |
| 35 | UPI ATM — Generate QR | `POST /fi/uatm/generateQr` | 📄 Docs captured |
| 36 | UPI ATM — QR Status | `POST /fi/uatm/qrStatus` | 📄 Docs captured |

---

## 0. Overview — Virtual Bank Accounts

**Title (provider):** Manage High-Value Collections with Virtual Bank Accounts

Simplify payment collection using **Virtual Bank Account Numbers** for seamless transactions with customers and vendors.

### Capabilities (from overview)

| Item | Detail |
|------|--------|
| **Modes** | IMPS, NEFT, RTGS |
| **Settlement** | Direct into bank account, **real time** |
| **Use cases** | Large-value transactions, multiple payments, high-value collections |
| **Benefits** | Streamlined collection, fewer delays, better cash flow, less manual reconciliation, better partner payment experience |

### Provider positioning

Virtual Bank Accounts enable real-time settlement so businesses prioritizing efficiency and precision can reduce reconciliation effort and improve financial operations.

Docs link (from InstantPay catalog): [Banking overview](https://developers.instantpay.in/reference/banking-overview)

---

## Account Statement

Shared InstantPay statement API: `POST https://api.instantpay.in/reports/statement`.
`bankProfileId` distinguishes wallet vs linked bank accounts (`"0"` = Business Wallet).

### Shared headers (statement APIs)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client ID | M | Y |
| `X-Ipay-Client-Secret` | String | Unique secret key | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End Customer IP Address | M | **N** |

### Common response envelope

| Name | Type | Description |
|------|------|-------------|
| `statuscode` | String | InstantPay Status Code |
| `actcode` | String | Action Code |
| `status` | String | Status Message |
| `data` | Object | Response Data |
| `timestamp` | String | `YYYY-MM-DD HH:II:SS` |
| `ipay_uuid` | String | Request reference |
| `orderid` | String | Txn id or null |
| `environment` | String | Live / Sandbox |
| `internalCode` | String | Usually null |

---

## 1. Account Statement — Business Wallet

Fetch statement of InstantPay **Business Wallet** linked to the InstantPay account.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/reports/statement` |
| **OpenAPI operationId** | `reporting-bank-accounts` (shared path; title may say Bank Accounts) |
| **Summary** | Business Wallet statement |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `bankProfileId` | String | M | **`"0"` (Fixed)** for Business Wallet |
| `accountNumber` | String | M | Wallet / account number |
| `pagination` | Object | M | Pagination |
| `pagination.pageNumber` | String/Number | M | Current page |
| `pagination.recordsPerPage` | String/Number | M | Page size |
| `filters` | Object | M | Date filters |
| `filters.txnDateFrom` | String | M | From date `YYYY-MM-DD` |
| `filters.txnDateTo` | String | M | To date `YYYY-MM-DD` |

> **Filter key inconsistency:** request-params table + curl use `txnDateFrom` / `txnDateTo`; one HTTP sample uses `fromDate` / `toDate`. Prefer **`txnDateFrom` / `txnDateTo`** unless staging proves otherwise.
> OpenAPI marks `externalRef` required for bank-accounts variant — Business Wallet request table does **not** list it; curl sample also omits it.

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/reports/statement' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-12-01",
    "txnDateTo": "2022-12-02"
  }
}'
```

```http
POST /reports/statement HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-04-28",
    "txnDateTo": "2022-04-29"
  }
}
```

### Sample success response (Business Wallet shape)

> Provider sample missing comma before `internalCode` — fixed below. Prefer this **meta + records** shape for Business Wallet (OpenAPI example shows alternate `data.statements` bank shape — see gotchas).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "meta": {
      "totalPages": 1,
      "currentPage": 1,
      "totalRecords": 2,
      "recordsOnCurrentPage": 0,
      "recordFrom": 0,
      "recordTo": 0
    },
    "records": [
      {
        "status": "SUCCESS",
        "txnDateTime": "2022-04-28 17:16:47",
        "ipayOrderId": "1220**********QBQV",
        "clientOrderId": "999*********7239",
        "transactionId": "13*******56",
        "reversalIpayOrderId": "",
        "productCode": "RJP",
        "productName": "Reliance Jio",
        "subProductCode": "ALL",
        "subProductName": null,
        "txnMode": "DR",
        "txnChargedValue": "19.79",
        "orderValue": "20.00",
        "convenienceFee": "0.00",
        "txnSurcharge": "0.0000",
        "txnCashback": "0.2200",
        "txnTds": "0.0110",
        "closingBalance": "4*****7.67",
        "narrationValue0": "70*****49",
        "narrationValue1": "",
        "narrationValue2": "",
        "narrationValue3": "",
        "narrationValue4": "",
        "narrationValue5": "",
        "narrationValue6": "",
        "narrationValue7": "",
        "narrationValue8": "CASH",
        "narrationValue9": "13.0414,80.2520|600018",
        "responseCode": "TXN",
        "responseMsg": "Transaction Successful"
      }
    ]
  },
  "timestamp": "2022-04-29 14:58:48",
  "ipay_uuid": "h005962d9122-cd7c-4e36-***6-1483cdc7ec4c",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (Business Wallet)

**`data.meta`**

| Field | Notes |
|-------|-------|
| `totalPages`, `currentPage`, `totalRecords` | |
| `recordsOnCurrentPage`, `recordFrom`, `recordTo` | |

**`data.records[]`**

| Field | Notes |
|-------|-------|
| `status` | e.g. `SUCCESS` |
| `txnDateTime` | |
| `ipayOrderId`, `clientOrderId`, `transactionId`, `reversalIpayOrderId` | |
| `productCode`, `productName`, `subProductCode`, `subProductName` | Wallet product line |
| `txnMode` | `DR` / `CR` |
| `txnChargedValue`, `orderValue`, `convenienceFee`, `txnSurcharge`, `txnCashback`, `txnTds` | Money fields (strings) |
| `closingBalance` | May be masked |
| `narrationValue0` … `narrationValue9` | Free-form narrations |
| `responseCode`, `responseMsg` | |

### OpenAPI notes

- Spec title: `reporting-statements` v1.0
- Server: `https://api.instantpay.in/reports` · Path: `POST /statement`
- OpenAPI example/schema lean toward **linked bank** shape (`data.statements.records` with `txnDate`/`txnId`/`amount`/`type`/`balance`) — **not** the Business Wallet sample above. Implement against **page sample** for `bankProfileId: "0"`.
- `400` → `{}`

---

## 2. Account Statement — Collect Orders

Fetch statement of InstantPay **Collect Orders** linked to the InstantPay account.

Same endpoint as Business Wallet; set **`isOrder: true`**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/reports/statement` |
| **Summary** | Collect Orders statement |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `bankProfileId` | String | M | **`"0"` (Fixed)** |
| `accountNumber` | String | M | Account number |
| `pagination.pageNumber` | String/Number | M | Current page |
| `pagination.recordsPerPage` | String/Number | M | Page size |
| `filters.txnDateFrom` | String | M | From `YYYY-MM-DD` |
| `filters.txnDateTo` | String | M | To `YYYY-MM-DD` |
| `isOrder` | Boolean | M | **Must be `true`** |

> Same filter-key inconsistency as Business Wallet (`txnDateFrom`/`txnDateTo` vs sample `fromDate`/`toDate`). Prefer **`txnDateFrom` / `txnDateTo`**.

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/reports/statement' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-04-26",
    "txnDateTo": "2022-04-26"
  },
  "isOrder": true
}'
```

```http
POST /reports/statement HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-04-28",
    "txnDateTo": "2022-04-29"
  },
  "isOrder": true
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "meta": {
      "totalPages": 1,
      "currentPage": 1,
      "totalRecords": 2,
      "recordsOnCurrentPage": 0,
      "recordFrom": 0,
      "recordTo": 0
    },
    "records": [
      {
        "status": "SUCCESS",
        "txnDateTime": "2022-04-28 17:16:47",
        "ipayOrderId": "12****************QV",
        "clientOrderId": "99**********39",
        "transactionId": "13********56",
        "settlementIpayOrderId": "1220********QBQV",
        "productCode": "RJP",
        "productName": "Reliance Jio",
        "subProductCode": "ALL",
        "subProductName": null,
        "txnMode": "DR",
        "txnChargedValue": "19.79",
        "orderValue": "20.00",
        "convenienceFee": "0.00",
        "txnSurcharge": "0.0000",
        "txnCashback": "0.2200",
        "txnTds": "0.0110",
        "narrationValue0": "70******49",
        "narrationValue1": "",
        "narrationValue2": "",
        "narrationValue3": "",
        "narrationValue4": "",
        "narrationValue5": "",
        "narrationValue6": "",
        "narrationValue7": "",
        "narrationValue8": "CASH",
        "narrationValue9": "13.0414,80.2520|600018",
        "responseCode": "TXN",
        "responseMsg": "Transaction Successful"
      }
    ]
  },
  "timestamp": "2022-04-29 14:58:48",
  "ipay_uuid": "h00596*******-cd7c-4e36-****-1483cdc7ec4c",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response vs Business Wallet

Same `data.meta` + `data.records[]` envelope. Differences in record fields:

| Collect Orders | Business Wallet |
|----------------|-----------------|
| `settlementIpayOrderId` | `reversalIpayOrderId` |
| No `closingBalance` in sample | Has `closingBalance` |

Other money / product / narration fields align with wallet records.

### OpenAPI notes

- Same shared `/reports/statement` OpenAPI as Business Wallet / Bank Accounts — `isOrder` not in OpenAPI schema; rely on this page.
- `400` → `{}`

---

## 3. Account Statement — Bank Accounts

Fetch statement of **linked bank accounts** (not InstantPay Business Wallet) tied to the InstantPay account.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/reports/statement` |
| **OpenAPI operationId** | `reporting-bank-accounts` |
| **Summary** | Bank Accounts |

> **Chargeable API** — confirm pricing with InstantPay KAM.
> **`externalRef`:** unique, **alphanumeric** only.

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `bankProfileId` | String | M | Linked bank profile id (sample `"10910"` — **not** wallet `"0"`) |
| `accountNumber` | String | M | Linked current account number |
| `externalRef` | String | M | Unique alphanumeric reference |
| `pagination` | Object | M | See notes |
| `filters.txnDateFrom` | String | M | From `YYYY-MM-DD` |
| `filters.txnDateTo` | String | M | To `YYYY-MM-DD` |

**Pagination inconsistency**

| Source | Fields |
|--------|--------|
| Request params table / OpenAPI | `pagination.pageReference` |
| Curl / HTTP samples | `pagination.pageNumber` + `pagination.recordsPerPage` |

Prefer **sample shape** (`pageNumber` / `recordsPerPage`) unless staging requires `pageReference`.

> Params table wrongly says `bankProfileId` = `0 (Fixed)` — that is wallet. Bank Accounts samples use a **non-zero** profile id (e.g. `10910`).

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/reports/statement' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "bankProfileId": "10910",
  "accountNumber": "7428585742",
  "externalRef": "PROD12378",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-04-26",
    "txnDateTo": "2022-04-26"
  }
}'
```

```http
POST /reports/statement HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "bankProfileId": "10910",
  "accountNumber": "7428585742",
  "externalRef": "PROD12378",
  "pagination": {
    "pageNumber": 1,
    "recordsPerPage": 20
  },
  "filters": {
    "txnDateFrom": "2022-03-18",
    "txnDateTo": "2022-03-21"
  }
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "statements": {
      "pageReference": "",
      "records": [
        {
          "txnDate": "2022-03-18 17:40:30",
          "txnId": "S60778063",
          "amount": "104814.09",
          "type": "CR",
          "balance": "31311795.24",
          "narration1": "BC ACQ AEPS COMMISSION_170322",
          "narration2": ""
        },
        {
          "txnDate": "2022-03-19 08:14:13",
          "txnId": "S73994678",
          "amount": "4000000.00",
          "type": "DR",
          "balance": "27311795.24",
          "narration1": "RTGS|ICICR42022031900500690|TJSB0000155|INSTANTPAY INDIA LIMITED",
          "narration2": ""
        }
      ]
    }
  },
  "timestamp": "2022-03-21 18:46:52",
  "ipay_uuid": "h00595df6e53-5f93-4a95-b69c-2dcb52cb8c80",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (Bank Accounts)

**`data.statements`**

| Field | Notes |
|-------|-------|
| `pageReference` | Pagination cursor / page ref (string; may be empty) |
| `records[]` | Statement lines |

**`data.statements.records[]`**

| Field | Notes |
|-------|-------|
| `txnDate` | Datetime string |
| `txnId` | Bank/txn id |
| `amount` | String amount |
| `type` | `CR` / `DR` |
| `balance` | Running balance |
| `narration1`, `narration2` | |

> Different from wallet/orders (`data.meta` + rich product records).

### OpenAPI notes

- Spec title: `reporting-statements` v1.0
- Server: `https://api.instantpay.in/reports` · Path: `POST /statement`
- Required in OpenAPI: `bankProfileId`, `accountNumber`, `externalRef`
- `400` → `{}`

---

## Balance Check

Shared balance API: `POST https://api.instantpay.in/accounts/balance`.
`bankProfileId: "0"` = Business Wallet; non-zero = linked bank (fee may apply — see bank page when pasted).

Same headers as Account Statement (`X-Ipay-Endpoint-Ip` = partner-supplied).

---

## 4. Balance Check — Business Wallet

Check balance of InstantPay **Business Wallet**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/accounts/balance` |
| **OpenAPI operationId** | `balance-bank-account` (shared path; OpenAPI title may say Bank Account) |
| **Summary** | Business Wallet balance |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `bankProfileId` | String | M | **`"0"` (Fixed)** |
| `accountNumber` | String | M | InstantPay **registered mobile number** |
| `externalRef` | String | M | Unique alphanumeric reference |
| `latitude` | String | M | Current lat — **4 digits after decimal** |
| `longitude` | String | M | Current long — **4 digits after decimal** |

### Provider notes

1. Lat/long in degrees with **4 decimal places**
2. `externalRef` unique + alphanumeric
3. Call **at most once per hour** to sync (provider recommendation)

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/accounts/balance' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "externalRef": "PROD1",
  "latitude": "20.1236",
  "longitude": "78.3228"
}'
```

```http
POST /accounts/balance HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "bankProfileId": "0",
  "accountNumber": "7428585742",
  "externalRef": "PROD1",
  "latitude": "20.1236",
  "longitude": "78.3228"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "bankId": "0",
    "bankProfileId": 0,
    "accountNumber": "7428585742",
    "accountShortNumber": "5742",
    "balance": {
      "total": "16.82",
      "lien": "0.00",
      "available": "16.82"
    },
    "poolReferenceId": "",
    "pool": {
      "account": "7428585742",
      "openingBal": "16.82",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "16.82"
    }
  },
  "timestamp": "2022-03-21 10:20:36",
  "ipay_uuid": "h00695deb945-3def-42ba-8857-2ff7bac93fe6",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|-------|
| `bankId` | `"0"` for wallet |
| `bankProfileId` | `0` (number in sample) |
| `accountNumber` | Full |
| `accountShortNumber` | Last 4 |
| `balance.total` / `balance.lien` / `balance.available` | Strings |
| `poolReferenceId` | May be empty on wallet sample |
| `pool.account`, `openingBal`, `mode`, `amount`, `closingBal` | Pool debit info |

### OpenAPI notes

- Spec title: `balance-check` v1.0
- Server: `https://api.instantpay.in/accounts` · Path: `POST /balance`
- OpenAPI summary/description oriented to **linked bank** (fee applicable) — Business Wallet page is the authority for `bankProfileId: "0"`
- `400` → `{}`

---

## 5. Balance Check — Bank Account

Check balance of **linked bank accounts**. **A fee is applicable** on balance checks via API (confirm with InstantPay KAM).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/accounts/balance` |
| **OpenAPI operationId** | `balance-bank-account` |
| **Summary** | Bank Account balance |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `bankProfileId` | String | M | From InstantPay portal (sample `"10910"` — **not** `"0"`) |
| `accountNumber` | String | M | Linked **current account** number |
| `externalRef` | String | M | Unique alphanumeric reference |
| `latitude` | String | M | Current lat — **4 digits after decimal** |
| `longitude` | String | M | Current long — **4 digits after decimal** |

### Provider notes

1. Lat/long: degrees, **4 decimal places**
2. `externalRef`: unique + alphanumeric
3. **Chargeable** API call

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/accounts/balance' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data-raw '{
  "bankProfileId": "10910",
  "accountNumber": "7428585742",
  "externalRef": "PROD1",
  "latitude": "20.1236",
  "longitude": "78.3228"
}'
```

```http
POST /accounts/balance HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "bankProfileId": "10910",
  "accountNumber": "7428585742",
  "externalRef": "PROD1",
  "latitude": "20.1236",
  "longitude": "78.3228"
}
```

### Sample success response

> Provider sample missing comma after `data` object — fixed below.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "bankProfileId": "10910",
    "accountNumber": "7428585742",
    "accountShortNumber": "2161",
    "balance": {
      "total": "17838.64",
      "lien": "0.00",
      "available": "17838.64"
    },
    "poolReferenceId": "1220123145065KVYEE",
    "pool": {
      "account": "7428585742",
      "openingBal": "214.50",
      "mode": "DR",
      "amount": "0.30",
      "closingBal": "214.20"
    }
  },
  "timestamp": "2022-02-18 11:36:07",
  "ipay_uuid": "h00695deb945-3def-42ba-8857-2ff7bac93fe6",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response vs Business Wallet balance

| | Bank Account | Business Wallet |
|--|--------------|-----------------|
| `bankProfileId` | Non-zero (e.g. `"10910"`) | `0` / `"0"` |
| `accountNumber` | Linked current account | InstantPay registered mobile |
| `bankId` | Not in sample | Present (`"0"`) |
| Fee | **Chargeable** (`pool.amount` e.g. `0.30`) | Sample shows `amount: "0.00"` |
| `poolReferenceId` | Often set | May be empty |

Same `balance.total` / `lien` / `available` + pool shape.

### OpenAPI notes

- Spec title: `balance-check` v1.0
- Server: `https://api.instantpay.in/accounts` · Path: `POST /balance`
- Description explicitly: fee applicable on balance checks via API
- `400` → `{}`

---

## Contact Book

Manage customers, vendors, and employees via InstantPay Contact Book.

### Shared headers (Contact Book)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client ID | M | Y |
| `X-Ipay-Client-Secret` | String | Unique secret key | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End Customer IP Address | M | **N** |

---

## 6. Contact Book — Overview

**Title (provider):** Transform Contact Management with Instantpay’s Contact Book API

Efficient contact management for business communication — organize, update, and interact with contacts; keep lists accurate and up to date.

### Capabilities (from overview)

| Capability | Detail |
|------------|--------|
| **CRUD** | Add, update, delete contact information |
| **Tags** | Categorize and filter contacts by criteria |
| **Outcomes** | Targeted communication, personalized interactions, stronger relationships |

### Who it’s for

Customers, vendors, employees (and similar contact types managed in one book).

> Base path: `https://api.instantpay.in/contacts/*`

---

## 7. Contact Book — Add Tag

Create a tag (name + color) for categorizing contacts / data.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/tag` |
| **OpenAPI operationId** | `banking-contact-book-add-tag` |
| **Summary** | Add Tag |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `name` | String | Mandatory | Tag Name |
| `hexColorCode` | String | Mandatory | Color Code (e.g. `#FF1934`) |

Headers: Contact Book shared headers (Client-Id / Client-Secret / Auth-Code / Endpoint-Ip).

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/tag' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "name": "Sample Name",
  "hexColorCode": "#FF1934"
}'
```

```http
POST /contacts/tag HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "name": "Sample Name",
  "hexColorCode": "#FF1934"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Tag Added Successfully",
  "data": {
    "userId": 432352,
    "name": "Testing",
    "hexColorCode": "#FF1934",
    "updated_at": "2023-05-04T09:22:32.581000Z",
    "created_at": "2023-05-04T09:22:32.581000Z",
    "_id": "645379580f08b4af410594f2"
  },
  "timestamp": "2023-05-04 14:52:32",
  "ipay_uuid": "h0069915df07-b290-4b6f-9fd0-84e7601a52e9",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Integer | InstantPay user id |
| `name` | String | Tag name |
| `hexColorCode` | String | e.g. `#FF1934` |
| `created_at` / `updated_at` | String | ISO datetime |
| `_id` | String | Tag id (use for update/delete later) |

### OpenAPI notes

- Spec title: `tag` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /tag`
- `400` → `{}`

---

## 8. Contact Book — Update Tag

Update an existing tag’s name and/or color.

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/tag` |
| **OpenAPI operationId** | `banking-contact-book-update-tag` |
| **Summary** | Update Tag |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `tagId` | String | Mandatory | From Add Tag response (`data._id`) |
| `name` | String | Mandatory | Tag Name |
| `hexColorCode` | String | Mandatory | Color Code |

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/tag' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "tagId": "6448ea5c1a1767723d055995",
  "name": "Sample Name",
  "hexColorCode": "#FF1931"
}'
```

```http
PATCH /contacts/tag HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "tagId": "6448ea5c1a1767723d055995",
  "name": "Sample Name",
  "hexColorCode": "#FF1931"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Tag Updated Successfully",
  "data": 1,
  "timestamp": "2023-05-04 15:09:44",
  "ipay_uuid": "h0689915e52c-dcbe-4d2e-960e-ef9a43d6a4e6",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes

- Success: `statuscode: "TXN"`, `status: "Tag Updated Successfully"`
- `data` is integer **`1`** (not a tag object) — treat as success flag / affected count

### OpenAPI notes

- Spec title: `tag` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `PATCH /tag`
- `400` → `{}`

---

## 9. Contact Book — Delete Tag

Remove an unused tag.

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/tag` |
| **OpenAPI operationId** | `banking-contact-book-delete-tag` |
| **Summary** | Delete Tag |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `tagId` | String | Mandatory | Tag id (`data._id` from Add Tag) |

> DELETE with JSON body (`tagId`) — not path param.

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/tag' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "tagId": "6422ae859f43afe1ee0319d6"
}'
```

```http
DELETE /contacts/tag HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "tagId": "6422ae859f43afe1ee0319d6"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Tag Deleted successfully",
  "data": null,
  "timestamp": "2023-05-04 15:13:27",
  "ipay_uuid": "h0069915e681-b17b-427c-a47a-cf0c59fbf119",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes

- Success: `statuscode: "TXN"`, `status: "Tag Deleted successfully"`
- `data` is **`null`**

### OpenAPI notes

- Spec title: `tag` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /tag`
- Response params table typo: `enviroment` → actual field is `environment`
- `400` → `{}`

---

## 10. Contact Book — List Tag

List all tags for the InstantPay account.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/contacts/tag` |
| **OpenAPI operationId** | `banking-contact-book-list-tag` |
| **Summary** | List Tag |

### Request parameters

None (headers only). Sample shows empty body — ignore body on GET.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/tag' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json'
```

```http
GET /contacts/tag HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "_id": "645381c92c8e9e093406ccb2",
      "name": "Sample 1",
      "hexColorCode": "#1EB626"
    },
    {
      "_id": "645382c19e8fbf278408c4c3",
      "name": "Sample 2",
      "hexColorCode": "#FF9123"
    }
  ],
  "timestamp": "2023-05-04 16:21:48",
  "ipay_uuid": "h0689915fef3-836b-4826-ac0f-f0f9d92d9a5e",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

| Field | Type | Notes |
|-------|------|-------|
| `_id` | String | Tag id |
| `name` | String | |
| `hexColorCode` | String | |

> List items are leaner than Add Tag response (no `userId` / timestamps in sample).

### OpenAPI notes

- Spec title: `tag` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /tag`
- `400` → `{}`

---

## 11. Contact Book — Add Contact

Add a contact profile with optional company and one or more tags.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/profile` |
| **OpenAPI operationId** | `banking-contact-book-add-contact` |
| **Summary** | Add Contact |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `name` | String | Mandatory | Contact name |
| `email` | String | Mandatory | Email |
| `mobile` | String | Mandatory | Mobile number |
| `companyName` | String | Optional | Company name |
| `tagDetails` | Array | Mandatory | Tag assignments |
| `tagDetails[].tagId` | String | Mandatory | Tag id (from Add/List Tag) |

> Request uses `tagDetails: [{ tagId }]`; response returns `tagId: string[]`.

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/profile' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "companyName": "Business Name",
  "tagDetails": [
    { "tagId": "645b280e95335f08eb021aa2" }
  ]
}'
```

```http
POST /contacts/profile HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "name": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "companyName": "Business Name",
  "tagDetails": [
    { "tagId": "645b280e95335f08eb021aa2" }
  ]
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Contact Added Successfully",
  "data": {
    "userId": 189590,
    "name": "Sample Name",
    "email": "help@instantpay.in",
    "mobile": "7428585742",
    "callingCode": "91",
    "companyName": "XYZ",
    "updated_at": "2023-05-10T05:14:35.381000Z",
    "created_at": "2023-05-10T05:14:35.381000Z",
    "_id": "645b283b9b2e242ec80dd5c2",
    "tagId": ["645b280e95335f08eb021aa2"]
  },
  "timestamp": "2023-05-10 10:44:35",
  "ipay_uuid": "h00599219842-6eda-44a4-bb0d-f23353f11f62",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Type | Notes |
|-------|------|-------|
| `_id` | String | Contact id (use for update/delete) |
| `userId` | Integer | |
| `name`, `email`, `mobile` | String | |
| `callingCode` | String | e.g. `"91"` (echoed; not in request sample) |
| `companyName` | String | |
| `tagId` | String[] | Assigned tag ids |
| `created_at` / `updated_at` | String | ISO datetime |

### OpenAPI notes

- Spec title: `list-contact` v1.0 (misnamed; this op is Add)
- Server: `https://api.instantpay.in/contacts` · Path: `POST /profile`
- `400` → `{}`

---

## 12. Contact Book — Update Contact

Update an existing contact profile and its tags.

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/profile` |
| **OpenAPI operationId** | `banking-contact-book-update-contact` |
| **Summary** | Update Contact |

> Provider page description incorrectly copies **Add Contact** marketing text — treat as Update.

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `contactId` | String | Mandatory | Contact id (`data._id` from Add Contact) |
| `name` | String | Mandatory | Contact name |
| `email` | String | Mandatory | Email |
| `mobile` | String | Mandatory | Mobile |
| `tagDetails[].tagId` | String | Mandatory | Tag id(s) |

> `companyName` not in request params table; may still appear on response from prior value. Curl sample duplicates `X-Ipay-Auth-Code` — send once.

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/profile' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contactId": "645383ba4acec95a32089822",
  "name": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "tagDetails": [
    { "tagId": "645381c92c8e9e093406ccb2" }
  ]
}'
```

```http
PATCH /contacts/profile HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "contactId": "645383ba4acec95a32089822",
  "name": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "tagDetails": [
    { "tagId": "645381c92c8e9e093406ccb2" }
  ]
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Contact Updated Successfully",
  "data": {
    "_id": "645b283b9b2e242ec80dd5c2",
    "userId": 189590,
    "name": "Sample Name",
    "email": "help@instantpay.in",
    "mobile": "7428585742",
    "callingCode": "91",
    "companyName": "Business Name",
    "updated_at": "2023-05-10T08:59:19.384000Z",
    "created_at": "2023-05-10T05:14:35.381000Z",
    "tagId": ["645b280e95335f08eb021aa2"]
  },
  "timestamp": "2023-05-10 14:29:19",
  "ipay_uuid": "h0059921e8a1-89ff-4b4a-b42e-c27893d64057",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

Same as Add Contact profile object: `_id`, `userId`, `name`, `email`, `mobile`, `callingCode`, `companyName`, `tagId[]`, timestamps.

### OpenAPI notes

- Spec title: `list-contact` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `PATCH /profile`
- `400` → `{}`

---

## 13. Contact Book — Delete Contact

Remove a contact from the Contact Book.

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/profile` |
| **OpenAPI operationId** | `banking-contact-book-delete-contact` |
| **Summary** | Delete Contact |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `contactId` | String | Mandatory | Contact id (`data._id`) |

> DELETE with JSON body (`contactId`) — same pattern as Delete Tag.

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/profile' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "contactId": "6447f86b1a1767723d055989"
}'
```

```http
DELETE /contacts/profile HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "contactId": "6447f86b1a1767723d055989"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Contact Deleted successfully",
  "data": null,
  "timestamp": "2023-05-10 14:30:36",
  "ipay_uuid": "h0059921e917-b16b-4f29-be48-8a43276da585",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes

- Success: `statuscode: "TXN"`, `status: "Contact Deleted successfully"`
- `data` is **`null`**

### OpenAPI notes

- Spec title: `list-contact` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /profile`
- `400` → `{}`

---

## 14. Contact Book — List Contact

List contacts in the Contact Book (with embedded tag details).

| | |
|--|--|
| **Method** | `GET` (per OpenAPI) |
| **URL** | `https://api.instantpay.in/contacts/profile` |
| **OpenAPI operationId** | `banking-contact-book-list-contact` |
| **Summary** | List Contact |

### ⚠️ Provider doc bugs (important)

| Source | What it shows | Likely truth |
|--------|---------------|--------------|
| OpenAPI | `GET /contacts/profile` | **Use this** for List Contact |
| Sample request | `DELETE /contacts/person` + `gcId` / `personId` | Copy-paste from **Delete Person** — ignore for List |
| Request params table | `gcId`, `personId` mandatory | Same — **ignore** for List; matches Person API, not profile list |
| Response sample | `data[]` of contacts + `tags[]` | Matches List Contact |

**Implement against:** `GET /contacts/profile` + headers only (no body), until staging confirms otherwise.

### Sample request (corrected)

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/profile' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json'
```

```http
GET /contacts/profile HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "_id": "645b283b9b2e242ec80dd5c2",
      "userId": 189590,
      "name": "Sample Name",
      "email": "help@instantpay.in",
      "mobile": "7428585742",
      "callingCode": "91",
      "companyName": "XYZ",
      "tagId": ["645b280e95335f08eb021aa2"],
      "tags": [
        {
          "_id": "645b280e95335f08eb021aa2",
          "userId": 189590,
          "name": "Employee1",
          "hexColorCode": "#FF1934",
          "updated_at": "2023-05-10T05:13:50.517000Z",
          "created_at": "2023-05-10T05:13:50.517000Z"
        }
      ]
    }
  ],
  "timestamp": "2023-05-10 10:45:08",
  "ipay_uuid": "h00599219875-45b5-485f-8dfb-9ed9ed5b37fd",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

Contact fields same as Add/Update, plus:

| Field | Type | Notes |
|-------|------|-------|
| `tagId` | String[] | Tag id list |
| `tags` | Object[] | Expanded tag objects |

**`tags[]`**

| Field | Notes |
|-------|-------|
| `_id`, `userId`, `name`, `hexColorCode` | |
| `created_at`, `updated_at` | ISO |

### Erroneous sample (do not use for List)

Provider mistakenly pasted Delete Person:

```
DELETE /contacts/person
{ "gcId", "personId" }
```

Save for when **Person** pages are pasted; not List Contact.

### OpenAPI notes

- Spec title: `list-contact` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /profile`
- `x-readme` code samples wrongly show Delete Person — ignore
- `400` → `{}`

---

## 15. Contact Book — Add Address

Add a postal address linked to a contact (`gcId` = contact `_id`).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/address` |
| **OpenAPI operationId** | `banking-contact-book-add-address` |
| **Summary** | Add Address |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (from Add Contact `data._id`) |
| `addressType` | String | Mandatory | e.g. `Shipping` |
| `address` | String | Mandatory | Street / line address |
| `city` | String | Mandatory | City |
| `state` | String | Mandatory | State |
| `pincode` | String | Mandatory | Pincode |
| `countryCode` | String | Mandatory | e.g. `IN` for India |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/address' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "gcId": "6447f86b1a1767723d055989",
  "addressType": "Shipping",
  "address": "Mohan Cooperative Industrial Estate",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110044",
  "countryCode": "IN"
}'
```

```http
POST /contacts/address HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "gcId": "6447f86b1a1767723d055989",
  "addressType": "Shipping",
  "address": "Mohan Cooperative Industrial Estate",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110044",
  "countryCode": "IN"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Address Added Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "addressType": "Shipping",
    "address": "Mohan Cooperative Industrial Estate",
    "city": "New Delhi",
    "state": "Delhi",
    "pincode": "110044",
    "countryCode": "IN",
    "updated_at": "2023-05-04T10:26:03.447000Z",
    "created_at": "2023-05-04T10:26:03.447000Z",
    "_id": "6453883b1b3f10b8f1093092"
  },
  "timestamp": "2023-05-04 15:56:03",
  "ipay_uuid": "h0059915f5be-9d37-492c-9424-2146b3ad97f5",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|-------|
| `_id` | Address id (for update/delete later) |
| `gcId` | Parent contact id |
| `addressType`, `address`, `city`, `state`, `pincode`, `countryCode` | Echo |
| `created_at` / `updated_at` | ISO |

### OpenAPI notes

- Spec title: `address` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /address`
- Response table typo: `enviroment` → field is `environment`
- `400` → `{}`

---

## 16. Contact Book — Update Address

Update an existing address on a contact.

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/address` |
| **OpenAPI operationId** | `banking-contact-book-update-address` |
| **Summary** | Update Address |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `addressId` | String | Mandatory | From Add Address `data._id` |
| `gcId` | String | Mandatory | Contact id |
| `addressType` | String | Mandatory | e.g. `Billing`, `Shipping` |
| `address` | String | Mandatory | Street / line |
| `city` | String | Mandatory | |
| `state` | String | Mandatory | |
| `pincode` | String | Mandatory | |
| `countryCode` | String | Mandatory | e.g. `IN` |

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/address' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "addressId": "6448ea7c1a1767723d055996",
  "gcId": "6447f86b1a1767723d055989",
  "addressType": "Billing",
  "address": "Sarita Vihar",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110044",
  "countryCode": "IN"
}'
```

```http
PATCH /contacts/address HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "addressId": "6448ea7c1a1767723d055996",
  "gcId": "6447f86b1a1767723d055989",
  "addressType": "Billing",
  "address": "Sarita Vihar",
  "city": "New Delhi",
  "state": "Delhi",
  "pincode": "110044",
  "countryCode": "IN"
}
```

### Sample success response

> Provider sample `status` says `"Address Added Successfully"` (likely copy-paste from Add). Treat `statuscode: "TXN"` as success; expect wording may be “Updated” in live.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Address Added Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "addressType": "Shipping",
    "address": "Sarita Vihar",
    "city": "New Delhi",
    "state": "Delhi",
    "pincode": "110044",
    "countryCode": "IN",
    "updated_at": "2023-05-04T10:26:03.447000Z",
    "created_at": "2023-05-04T10:26:03.447000Z",
    "_id": "6453883b1b3f10b8f1093092"
  },
  "timestamp": "2023-05-04 15:56:03",
  "ipay_uuid": "h0059915f5be-9d37-492c-9424-2146b3ad97f5",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

Same as Add Address (no `addressId` echo in sample — use `_id`).

### OpenAPI notes

- Spec title: `address` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `PATCH /address`
- `400` → `{}`

---

## 17. Contact Book — List Address

List addresses for a contact (`gcId`).

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/contacts/address` |
| **OpenAPI operationId** | `banking-contact-book-list-address` |
| **Summary** | List Address |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |

> Samples send `gcId` in **JSON body on GET** (unusual). Confirm on staging whether query `?gcId=` also works; implement body first to match docs.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/address' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822"
}'
```

```http
GET /contacts/address HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822"
}
```

### Sample success response

> Provider sample JSON has a trailing comma after the array item — cleaned below.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "gcId": "645383ba4acec95a32089822",
      "addressType": "Shipping",
      "address": "Sarita Vihar",
      "city": "New Delhi",
      "state": "Delhi",
      "pincode": "110044",
      "countryCode": "IN",
      "updated_at": "2023-05-04T10:26:03.447000Z",
      "created_at": "2023-05-04T10:26:03.447000Z",
      "_id": "6453883b1b3f10b8f1093092"
    }
  ],
  "timestamp": "2023-05-04 16:23:13",
  "ipay_uuid": "h0059915ff76-3a56-4a6d-ae8f-83526a5de99e",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

Same address object as Add/Update: `_id`, `gcId`, `addressType`, `address`, `city`, `state`, `pincode`, `countryCode`, timestamps.

### OpenAPI notes

- Spec title: `address` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /address`
- `400` → `{}`

---

## 18. Contact Book — Delete Address

Remove an address from a contact.

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/address` |
| **OpenAPI operationId** | `banking-contact-book-delete-address` |
| **Summary** | Delete Address |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `addressId` | String | Mandatory | Address unique id (param table label: `AddressId`; JSON/samples use camelCase `addressId`) |

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/address' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822",
  "addressId": "6453883b1b3f10b8f1093092"
}'
```

```http
DELETE /contacts/address HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "addressId": "6453883b1b3f10b8f1093092"
}
```

### Sample success response

> Provider paste omitted closing `}`; OpenAPI example includes `internalCode`.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Address Deleted successfully",
  "data": null,
  "timestamp": "2023-05-04 16:31:13",
  "ipay_uuid": "h00699160252-2be9-4df2-b032-647b27d2fa2c",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Notes

- Success: `data: null`, status `"Address Deleted successfully"`.
- Same path as Add/Update/List — distinguish by HTTP method.

### OpenAPI notes

- Spec title: `address` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /address`
- `400` → `{}`

---

## 19. Contact Book — Add Payment Details

Add VPA / bank account / wallet payment method on a contact.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/payment` |
| **OpenAPI operationId** | `banking-contact-book-add-payment-details` |
| **Summary** | Add Payment Details |
| **OpenAPI title** | `payments` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `accountType` | String | Mandatory | `VPA`, `WALLET`, or `Account` (docs also say `ACCOUNT` for conditional fields) |
| `upiId` | String | Optional (Mandatory if `accountType` is `VPA`) | UPI ID |
| `accountNumber` | String | Optional (Mandatory if `accountType` is `ACCOUNT`) | Bank account number |
| `accountIfsc` | String | Optional (Mandatory if `accountType` is `ACCOUNT`) | Bank IFSC |
| `beneficiaryName` | String | Optional (Mandatory if `accountType` is `ACCOUNT`) | Beneficiary name |
| `isVerificationOn` | boolean | Optional | `true` / `false` — verify before add |
| `phoneNumber` | String | Optional (Mandatory if `accountType` is `WALLET`) | Wallet phone number |
| `externalRef` | String | Optional (Mandatory if `isVerificationOn` is `true`) | Unique transaction id |
| `latitude` | String | Optional (Mandatory if `isVerificationOn` is `true`) | Current latitude |
| `longitude` | String | Optional (Mandatory if `isVerificationOn` is `true`) | Current longitude |

### Verification note (provider)

- `isVerificationOn: true` → Account/VPA verified then added.
- `isVerificationOn: false` → added without verification; verify later via **Verify Payment API**.

### Sample request

> Provider samples use `http://api.localhost` + hash/test headers (`X-Ipay-Request-Hash`, `X-Ipay-Hash-Check: OFF`, etc.). Production: `https://api.instantpay.in` + standard InstantPay auth headers.

```bash
curl --location 'https://api.instantpay.in/contacts/payment' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "gcId": "6447f86b1a1767723d055989",
  "accountType": "VPA",
  "upiId": "7428585742@ybl",
  "accountNumber": "",
  "accountIfsc": "",
  "beneficiaryName": "",
  "isVerificationOn": true,
  "phoneNumber": "",
  "latitude": "",
  "longitude": "",
  "externalRef": ""
}'
```

```http
POST /contacts/payment HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "gcId": "6447f86b1a1767723d055989",
  "accountType": "VPA",
  "upiId": "7428585742@ybl",
  "accountNumber": "",
  "accountIfsc": "",
  "beneficiaryName": "",
  "isVerificationOn": true,
  "phoneNumber": "",
  "latitude": "",
  "longitude": "",
  "externalRef": ""
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Payment Method Added Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "accountType": "VPA",
    "isPrimary": false,
    "isVerified": false,
    "accountNumber": "7428585742@ybl",
    "accountIfsc": "",
    "beneficiaryName": "Instantpay India Ltd.",
    "updated_at": "2023-05-04T11:56:11.027000Z",
    "created_at": "2023-05-04T11:56:11.027000Z",
    "_id": "64539d5be8c166242100ce72"
  },
  "timestamp": "2023-05-04 17:26:11",
  "ipay_uuid": "h068991615f9-fdf9-4b61-8ce9-0df4ecd1c891",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `_id` | Payment method id (use for update/delete/verify) |
| `gcId` | Contact id |
| `accountType` | e.g. `VPA` |
| `isPrimary` | boolean |
| `isVerified` | boolean |
| `accountNumber` | For VPA sample, UPI id stored here |
| `accountIfsc` | |
| `beneficiaryName` | |
| `created_at` / `updated_at` | ISO timestamps |

### Gotchas

- Param table: `accountType` = `VPA`, `WALLET`, or `Account`; conditional fields say `ACCOUNT` (casing inconsistency — confirm on staging).
- Response table typo: `enviroment` → actual sample uses `environment`.
- VPA success stores UPI in `accountNumber` (not a separate `upiId` field in response).
- Sample request with `isVerificationOn: true` still shows empty `externalRef` / lat / long — when implementing, require those if verification is on.

### OpenAPI notes

- Spec title: `payments` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /payment`
- `400` → `{}`

---

## 20. Contact Book — Set Primary Payment

Mark a payment method as the contact’s primary.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/payment/primary` |
| **OpenAPI operationId** | `banking-contact-book-set-primary-payment` |
| **Summary** | Set Primary Payment |
| **OpenAPI title** | `payments-primary` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `paymentId` | String | Mandatory | Payment unique id (Add Payment `data._id`) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/payment/primary' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822",
  "paymentId": "64539d55f60d424cb90b89a2"
}'
```

```http
POST /contacts/payment/primary HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "paymentId": "64539d55f60d424cb90b89a2"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Primary Account Set Successfully",
  "data": null,
  "timestamp": "2023-05-04 17:26:53",
  "ipay_uuid": "h0069916163a-4348-4424-8efb-313bb38886a7",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- OpenAPI `servers` is `https://api.instantpay.in/contacts/payment/primary` with path `/primary` (would double `/primary`) — **trust curl/http samples**: `POST /contacts/payment/primary`.
- OpenAPI `x-readme` code samples wrongly show `POST /contacts/payment` (no `/primary`) — ignore those.
- Success: `data: null`, status `"Primary Account Set Successfully"`.

### OpenAPI notes

- Spec title: `payments-primary` v1.0
- Prefer full URL from samples: `POST https://api.instantpay.in/contacts/payment/primary`
- `400` → `{}`

---

## 21. Contact Book — Delete Payment Details

Remove a payment method from a contact.

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/payment` |
| **OpenAPI operationId** | `banking-contact-book-delete-payment-details` |
| **Summary** | Delete Payment Details |
| **OpenAPI title** | `payments` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `paymentId` | String | Mandatory | Payment unique id (Add Payment `data._id`) |

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/payment' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822",
  "paymentId": "64539d55f60d424cb90b89a2"
}'
```

```http
DELETE /contacts/payment HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "paymentId": "64539d55f60d424cb90b89a2"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Payment Method Deleted successfully",
  "data": null,
  "timestamp": "2023-05-04 17:27:27",
  "ipay_uuid": "h0069916166e-8e69-4caf-83ad-70bc51743fd5",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- Provider **http** sample wrongly shows `POST /contacts/payment/primary` (Set Primary paste) — trust **curl**: `DELETE /contacts/payment`.
- OpenAPI `x-readme` samples also show `POST` / omit `--request DELETE` — ignore; OpenAPI path is `delete` on `/payment`.
- Status casing varies: sample `"successfully"` vs OpenAPI `"Successfully"`.
- OpenAPI example JSON missing comma after `"data":null`.

### OpenAPI notes

- Spec title: `payments` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /payment`
- `400` → `{}`

---

## 22. Contact Book — Verify Payment

Verify a previously added (unverified) payment method. Used when Add Payment had `isVerificationOn: false`, or to re-verify.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/payment/verify` |
| **OpenAPI operationId** | `banking-contact-book-verify-payment` |
| **Summary** | Verify Payment |
| **OpenAPI title** | `verify-payments` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `paymentId` | String | Mandatory | Payment unique id (Add Payment `data._id`) |
| `externalRef` | String | Mandatory | Unique transaction id |
| `latitude` | String | Mandatory | Current location latitude |
| `longitude` | String | Mandatory | Current location longitude |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/payment/verify' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645b7f3ef38ef6dff80d3e72",
  "paymentId": "645b7f57c6860001c2077422",
  "externalRef": "1234567",
  "latitude": "27.897394",
  "longitude": "78.088013"
}'
```

```http
POST /contacts/payment/verify HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645b7f3ef38ef6dff80d3e72",
  "paymentId": "645b7f57c6860001c2077422",
  "externalRef": "1234567",
  "latitude": "27.897394",
  "longitude": "78.088013"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Account Verfication Successful",
  "data": {
    "externalRef": "1234567",
    "poolReferenceId": "1230510165657CBCGZ",
    "txnValue": "1.00",
    "txnReferenceId": "313016709903",
    "pool": {
      "account": "7428585742",
      "openingBal": "73.33",
      "mode": "DR",
      "amount": "2.18",
      "closingBal": "71.15"
    },
    "payer": {
      "account": "7428585742",
      "name": "Business Name"
    },
    "payee": {
      "account": "7770007428585742",
      "name": "Instantpay India limited"
    },
    "isCached": false
  },
  "timestamp": "2023-05-10 16:56:59",
  "ipay_uuid": "h00599221d6d-ad4c-4e1a-8859-458c7e611720",
  "orderid": "1230510165657CBCGZ",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `externalRef` | Echo of request |
| `poolReferenceId` | Often same as top-level `orderid` |
| `txnValue` | Verification txn amount (string) |
| `txnReferenceId` | Bank/provider txn ref |
| `pool` | `account`, `openingBal`, `mode` (`DR`/`CR`), `amount`, `closingBal` |
| `payer` / `payee` | `account`, `name` |
| `isCached` | boolean |

### Gotchas

- Status typo in provider docs: `"Account Verfication Successful"` (missing ‘i’).
- Response table typo: `enviroment` → sample uses `environment`.
- HTTP sample headers malformed (curl `--header` lines pasted into HTTP) — cleaned above.
- OpenAPI `servers` = `…/contacts/payment/verify` with path `/verify` (would double) — **trust curl**: `POST /contacts/payment/verify`.
- Looks chargeable / penny-drop style (wallet debit in `pool`); confirm pricing on staging.
- Pairs with Add Payment when `isVerificationOn: false`.

### OpenAPI notes

- Spec title: `verify-payments` v1.0
- Prefer full URL from samples: `POST https://api.instantpay.in/contacts/payment/verify`
- `400` → `{}`

---

## 23. Contact Book — Add Note

Attach a note (and files) to a contact. **multipart/form-data** (not JSON).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/note` |
| **Content-Type** | `multipart/form-data` |
| **OpenAPI operationId** | `banking-contact-book-add-note` |
| **Summary** | Add Note |
| **OpenAPI title** | `notes` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `note` | String | Mandatory | Note text |
| `files` / `files[]` | Array (file parts) | Mandatory | Uploaded files — form field name `files[]` |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/note' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--form 'gcId="111111111111"' \
--form 'note="Added Successfully"' \
--form 'files[]=@"/path/to/file"'
```

```http
POST /contacts/note HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="gcId"

111111111111
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="note"

Added Successfully
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="files[]"; filename="file"
Content-Type: application/octet-stream

(data)
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

### Sample success response

> Provider paste omitted opening `{` — fixed below. Response `data` has no file URLs/list.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Note Added Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "note": "test 1 files",
    "updated_at": "2023-05-04T11:38:21.792000Z",
    "created_at": "2023-05-04T11:38:21.792000Z",
    "_id": "6453992d54c74877510e5372"
  },
  "timestamp": "2023-05-04 17:08:23",
  "ipay_uuid": "h00699160f9a-8cd3-4453-a3b1-3d1b41b5373a",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `_id` | Note id (use for update/delete) |
| `gcId` | Contact id |
| `note` | Note text |
| `created_at` / `updated_at` | ISO timestamps |

### Gotchas

- First Contact Book API that is **multipart** — do not send JSON body.
- `files` marked Mandatory; confirm on staging whether empty / no-file is allowed.
- Form field is `files[]` (array-style name).
- HTTP sample headers malformed (curl `--header` lines) — cleaned above.
- OpenAPI x-readme curl has a stray `\\'` after Endpoint-Ip header.

### OpenAPI notes

- Spec title: `notes` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /note`
- `400` → `{}`

---

## 24. Contact Book — Update Note

Update note text and optionally add/remove files. **multipart/form-data**. Path differs from Add (`/note/update`).

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/note/update` |
| **Content-Type** | `multipart/form-data` |
| **OpenAPI operationId** | `banking-contact-book-update-note` |
| **Summary** | Update Note |
| **OpenAPI title** | `update-notes` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |
| `noteId` | String | Mandatory | Note unique id (Add Note `data._id`) |
| `note` | String | Mandatory | Updated note text |
| `removedFiles` / `removedFiles[]` | Array | Optional | Names of files to remove |
| `files` / `files[]` | Array (file parts) | Optional | New files to upload |

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/note/update' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--form 'gcId="645348b5623454724501cdf7"' \
--form 'noteId="645348b5623454724501cdf7"' \
--form 'note="test 1 file"' \
--form 'removedFiles[]="Files Name in Array"' \
--form 'files[]=@"/path/to/file"'
```

```http
PATCH /contacts/note/update HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="gcId"

645348b5623454724501cdf7
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="noteId"

645348b5623454724501cdf7
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="note"

test 1 file
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="removedFiles[]"

Files Name in Array
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="files[]"; filename="file"
Content-Type: application/octet-stream

(data)
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Note Updated Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "note": "test 1 filedfd"
  },
  "timestamp": "2023-05-04 17:11:42",
  "ipay_uuid": "h005991610cc-8d1c-4fd8-8f38-e169368d9892",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- Path is `/contacts/note/update`, not `PATCH /contacts/note` (unlike Address/Payment which reuse the same path).
- OpenAPI `servers` already ends with `/note/update` and path is `/note/update` (would double) — **trust curl**.
- Sample uses identical placeholder for `gcId` and `noteId` — real calls need distinct ids.
- Response `data` is lean: only `gcId` + `note` (no `_id`, timestamps, or file list).
- `removedFiles[]` values are file **names** (strings), not ids — confirm exact name format via List Note if available.

### OpenAPI notes

- Spec title: `update-notes` v1.0
- Prefer full URL from samples: `PATCH https://api.instantpay.in/contacts/note/update`
- `400` → `{}`

---

## 25. Contact Book — Delete Note

Delete a note. **JSON body** (not multipart — unlike Add/Update).

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/note` |
| **Content-Type** | `application/json` |
| **OpenAPI operationId** | `banking-contact-book-delete-note` |
| **Summary** | Delete Note |
| **OpenAPI title** | `notes` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |
| `noteId` | String | Mandatory | Note unique id (Add Note `data._id`) |

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/note' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822",
  "noteId": "6453992d54c74877510e5372"
}'
```

```http
DELETE /contacts/note HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "noteId": "6453992d54c74877510e5372"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Note Deleted successfully",
  "data": null,
  "timestamp": "2023-05-04 17:18:12",
  "ipay_uuid": "h0689916131c-7155-4e09-ad4c-51f73390208a",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- Provider samples include bogus header `XContent-Type` — ignore; use `Content-Type: application/json`.
- Delete uses JSON on `/contacts/note`; Add uses multipart on same path; Update uses multipart on `/contacts/note/update`.
- Success: `data: null`.

### OpenAPI notes

- Spec title: `notes` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /note`
- `400` → `{}`

---

## 26. Contact Book — List Notes

List notes (with attachments) for a contact.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/contacts/note` |
| **OpenAPI operationId** | `banking-contact-book-list-notes` |
| **Summary** | List Notes |
| **OpenAPI title** | `notes` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |

> Samples send `gcId` in **JSON body on GET** (same pattern as List Address). Confirm query `?gcId=` on staging if needed.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/note' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822"
}'
```

```http
GET /contacts/note HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "_id": "6453992d54c74877510e5372",
      "gcId": "645383ba4acec95a32089822",
      "note": "test 1 filedfd",
      "updated_at": "2023-05-04T11:41:42.283000Z",
      "created_at": "2023-05-04T11:38:21.792000Z",
      "attachment": [
        {
          "fileName": "sample.jpeg",
          "fileLink": "https://api.instantpay.in/downloadmanager?q=...",
          "fileSize": 11226
        }
      ]
    }
  ],
  "timestamp": "2023-05-04 17:15:13",
  "ipay_uuid": "h0059916120f-44cb-455b-805e-b93354adfcc3",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

| Field | Notes |
|-------|--------|
| `_id` | Note id |
| `gcId` | Contact id |
| `note` | Text |
| `created_at` / `updated_at` | ISO |
| `attachment[]` | `fileName`, `fileLink` (downloadmanager URL), `fileSize` |

### Gotchas

- Ignore bogus `XContent-Type` header in provider samples.
- `attachment[].fileName` is what Update Note `removedFiles[]` likely expects.
- Same path `/contacts/note` for POST (multipart), GET (JSON body), DELETE (JSON body).
- Truncate/proxy long `fileLink` tokens in logs; treat as time-limited download URLs.

### OpenAPI notes

- Spec title: `notes` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /note`
- `400` → `{}`
- OpenAPI example JSON missing opening `{` in places — cleaned above.

---

## 27. Contact Book — Add Business

Attach business identity details (PAN / GST / CIN / etc.) to a contact.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/business` |
| **OpenAPI operationId** | `banking-contact-book-add-business` |
| **Summary** | Add Business |
| **OpenAPI title** | `business` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |
| `pan` | String | Optional | PAN number |
| `cin` | String | Optional | CIN number |
| `gstin` | String | Optional | GSTIN |
| `tan` | String | Optional | TAN number |
| `udyam` / `udhyam` | String | Optional | Udyam number — param table `udyam`, samples use `udhyam` |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/business' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "gcId": "645b283b9b2e242ec80dd5c2",
  "pan": "AAOCS6028B",
  "gstin": "",
  "cin": "",
  "tan": "",
  "udhyam": ""
}'
```

```http
POST /contacts/business HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "gcId": "645b283b9b2e242ec80dd5c2",
  "pan": "AAOCS6028B",
  "gstin": "",
  "cin": "",
  "tan": "",
  "udhyam": ""
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Business DetailsAdded Successfully",
  "data": {
    "gcId": "645b283b9b2e242ec80dd5c2",
    "pan": "AAOCS6028B",
    "panVerified": false,
    "updated_at": "2023-05-10T07:17:40.015000Z",
    "created_at": "2023-05-10T07:17:40.015000Z",
    "_id": "645b4514f5f25662ef00f892"
  },
  "timestamp": "2023-05-10 12:47:40",
  "ipay_uuid": "h0069921c446-b52c-4d77-895d-7e244b22fed8",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `_id` | Business record id |
| `gcId` | Contact id |
| `pan` | Echo |
| `panVerified` | boolean |
| `created_at` / `updated_at` | ISO |

### Gotchas

- Param table `udyam` vs sample key `udhyam` — confirm which InstantPay accepts (likely `udhyam` from samples).
- Status string missing space: `"Business DetailsAdded Successfully"`.
- Sample response only returns PAN fields; empty gstin/cin/tan/udhyam may be omitted.
- Only `gcId` mandatory; at least one identity field likely expected in practice — confirm staging.

### OpenAPI notes

- Spec title: `business` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /business`
- `400` → `{}`

---

## 28. Contact Book — Update Business

Update business identity fields on a contact.

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/business` |
| **OpenAPI operationId** | `banking-contact-book-update-business` |
| **Summary** | Update Business |
| **OpenAPI title** | `business` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |
| `pan` | String | Optional | PAN |
| `cin` | String | Optional | CIN |
| `gstin` | String | Optional | GSTIN |
| `tan` | String | Optional | TAN |
| `udyam` / `udhyam` | String | Optional | Udyam — table `udyam`, samples `udhyam` |

> No `businessId` in request — keyed by `gcId` only (unlike Address/Payment updates).

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/business' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "gcId": "645b283b9b2e242ec80dd5c2",
  "pan": "AAOCS6028B",
  "gstin": "",
  "cin": "",
  "tan": "",
  "udhyam": ""
}'
```

```http
PATCH /contacts/business HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "gcId": "645b283b9b2e242ec80dd5c2",
  "pan": "AAOCS6028B",
  "gstin": "",
  "cin": "",
  "tan": "",
  "udhyam": ""
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Business Updated Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "pan": "AAOCS6028B",
    "panVerified": true,
    "cin": "L1710MH1973PLC019786",
    "cinVerified": false,
    "gstin": "29AAOCS6028B9Z9",
    "gstinVerified": false,
    "tan": "",
    "tanVerified": false,
    "udyam": "",
    "udyamVerified": true
  },
  "timestamp": "2023-05-04 16:37:43",
  "ipay_uuid": "h006991604a6-2757-4040-97fb-550a17b7e48e",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `gcId` | Contact id |
| `pan` / `panVerified` | |
| `cin` / `cinVerified` | |
| `gstin` / `gstinVerified` | |
| `tan` / `tanVerified` | |
| `udyam` / `udyamVerified` | Response uses `udyam` (not `udhyam`) |
| (no `_id`) | Update sample omits business `_id` |

### Gotchas

- Request sample key `udhyam` vs response/table `udyam`.
- Same path as Add — method `PATCH` vs `POST`.
- OpenAPI x-readme curl/http samples have malformed headers — trust cleaned samples above.
- Marketing blurb mentions staff/addresses; this API is identity fields only.

### OpenAPI notes

- Spec title: `business` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `PATCH /business`
- `400` → `{}`

---

## 29. Contact Book — List Business

List business records linked to a contact.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/contacts/business` |
| **OpenAPI operationId** | `banking-contact-book-list-business` |
| **Summary** | List Business |
| **OpenAPI title** | `business` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |

> Samples send `gcId` in **JSON body on GET** (same pattern as List Address / List Notes).

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/business' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "gcId": "64466fd613d5c829a60e4cdf"
}'
```

```http
GET /contacts/business HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
Content-Type: application/json

{
  "gcId": "64466fd613d5c829a60e4cdf"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "_id": "645390ff45c523e177063342",
      "gcId": "645383ba4acec95a32089822",
      "pan": "business",
      "panVerified": true,
      "cin": "L17110MH1973PLC019786",
      "cinVerified": true,
      "gstin": "",
      "gstinVerified": true,
      "tan": "",
      "tanVerified": true,
      "udyam": "",
      "udyamVerified": true,
      "updated_at": "2023-05-04T11:03:27.688000Z",
      "created_at": "2023-05-04T11:03:27.688000Z"
    }
  ],
  "timestamp": "2023-05-04 16:35:46",
  "ipay_uuid": "h006991603f2-12a3-4452-9614-139d45cb7586",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

Same as Update Business fields, plus `_id`, `created_at`, `updated_at`. Includes `*Verified` for pan/cin/gstin/tan/udyam.

### Gotchas

- `data` is an **array** (marketing implies multiple businesses per contact) even though Update is keyed only by `gcId` — confirm if multiple rows per contact are real or sample-only.
- Sample `pan: "business"` looks like a placeholder, not a real PAN.
- OpenAPI x-readme includes bogus `XContent-Type` — ignore.
- Same path `/contacts/business` for POST / PATCH / GET.

### OpenAPI notes

- Spec title: `business` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /business`
- `400` → `{}`

---

## 30. Contact Book — Add Person

Add a contact person (staff / point of contact) under a Contact Book profile (`gcId`).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/contacts/person` |
| **OpenAPI operationId** | `banking-contact-book-add-person` |
| **Summary** | Add Person |
| **OpenAPI title** | `person` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id (Add Contact `data._id`) |
| `contactPersonName` | String | Mandatory | Name of the contact person |
| `email` | String | Mandatory | Email |
| `mobile` | String | Mandatory | Mobile number |
| `description` | String | Mandatory | Remarks |

### Sample request

```bash
curl --location 'https://api.instantpay.in/contacts/person' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data-raw '{
  "gcId": "645383ba4acec95a32089822",
  "contactPersonName": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "description": "test desc"
}'
```

```http
POST /contacts/person HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "contactPersonName": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "description": "test desc"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Contact Person Added Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "contactPersonName": "Sample Name",
    "email": "help@instantpay.in",
    "mobile": "7428585742",
    "description": "test desc",
    "callingCode": "+91",
    "updated_at": "2023-05-04T11:20:56.115000Z",
    "created_at": "2023-05-04T11:20:56.115000Z",
    "_id": "6453951835fca2f80f074002"
  },
  "timestamp": "2023-05-04 16:50:56",
  "ipay_uuid": "h0059916095e-b71e-4253-a449-2cda8d2429cb",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape

| Field | Notes |
|-------|--------|
| `_id` | Person id (`personId` for update/delete) |
| `gcId` | Parent contact |
| `contactPersonName` | |
| `email` / `mobile` / `description` | |
| `callingCode` | e.g. `+91` (auto) |
| `created_at` / `updated_at` | ISO |

### Gotchas

- Distinct from **Add Contact** (`/contacts/profile`) — Person is a sub-resource of a contact.
- Explains earlier List Contact doc bug that showed `DELETE /contacts/person` — that was Person delete, not List Contact.
- Ignore bogus `XContent-Type` header; HTTP sample has trailing `}'`.
- All five request fields mandatory.

### OpenAPI notes

- Spec title: `person` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `POST /person`
- `400` → `{}`

---

## 31. Contact Book — Update Person

Update a contact person under a Contact Book profile.

| | |
|--|--|
| **Method** | `PATCH` |
| **URL** | `https://api.instantpay.in/contacts/person` |
| **OpenAPI operationId** | `banking-contact-book-update-person` |
| **Summary** | Update Person |
| **OpenAPI title** | `person` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `personId` | String | Mandatory | Person id (Add Person `data._id`) |
| `gcId` | String | Mandatory | Contact id |
| `contactPersonName` | String | Mandatory | Name |
| `email` | String | Mandatory | Email |
| `mobile` | String | Mandatory | Mobile |
| `description` | String | Mandatory | Remarks |

### Sample request

```bash
curl --location --request PATCH 'https://api.instantpay.in/contacts/person' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data-raw '{
  "personId": "6453951835fca2f80f074002",
  "gcId": "645383ba4acec95a32089822",
  "contactPersonName": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "description": "test desc"
}'
```

```http
PATCH /contacts/person HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "personId": "6453951835fca2f80f074002",
  "gcId": "645383ba4acec95a32089822",
  "contactPersonName": "Sample Name",
  "email": "help@instantpay.in",
  "mobile": "7428585742",
  "description": "test desc"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Contact Person Updated Successfully",
  "data": {
    "gcId": "645383ba4acec95a32089822",
    "contactPersonName": "Sample Name",
    "email": "help@instantpay.in",
    "mobile": "7428585742",
    "description": "test desc",
    "callingCode": "+91"
  },
  "timestamp": "2023-05-04 16:51:52",
  "ipay_uuid": "h006991609b4-b4c5-4327-ae8d-77536300adc5",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- Requires `personId` + `gcId` (unlike Update Business which is gcId-only).
- Response omits `_id` / timestamps (leaner than Add).
- OpenAPI `x-readme` samples wrongly show `GET` — trust main curl: `PATCH`.
- Ignore `XContent-Type`; HTTP sample trailing `}'`.

### OpenAPI notes

- Spec title: `person` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `PATCH /person`
- `400` → `{}`

---

## 32. Contact Book — List Person

List contact persons for a Contact Book profile.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/contacts/person` |
| **OpenAPI operationId** | `list-address` (provider copy-paste bug — should be list-person) |
| **Summary** | List Person |
| **OpenAPI title** | `person` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |

> Samples send `gcId` in **JSON body on GET**.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/contacts/person' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822"
}'
```

```http
GET /contacts/person HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": [
    {
      "_id": "6453969c6e9109027e051202",
      "gcId": "645383ba4acec95a32089822",
      "contactPersonName": "Sample Name",
      "email": "help@instantpay.in",
      "mobile": "7428585742",
      "description": "test desc",
      "callingCode": "+91",
      "updated_at": "2023-05-04T11:27:24.956000Z",
      "created_at": "2023-05-04T11:27:24.956000Z"
    }
  ],
  "timestamp": "2023-05-04 16:57:46",
  "ipay_uuid": "h00599160bd1-3f46-4482-91b3-d05c45df1bc1",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data[]` shape

Same as Add Person response fields: `_id`, `gcId`, `contactPersonName`, `email`, `mobile`, `description`, `callingCode`, timestamps.

### Gotchas

- OpenAPI `operationId` is wrongly `list-address` — ignore.
- Ignore `XContent-Type`.
- Same path `/contacts/person` for POST / PATCH / GET / (Delete when pasted).

### OpenAPI notes

- Spec title: `person` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `GET /person`
- `400` → `{}`

---

## 33. Contact Book — Delete Person

Delete a contact person. This is the API that was wrongly pasted into **List Contact** provider samples earlier.

| | |
|--|--|
| **Method** | `DELETE` |
| **URL** | `https://api.instantpay.in/contacts/person` |
| **OpenAPI operationId** | `banking-contact-book-delete-person` |
| **Summary** | Delete Person |
| **OpenAPI title** | `person` v1.0 |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `gcId` | String | Mandatory | Contact id |
| `personId` | String | Mandatory | Person id (Add Person `data._id`) |

### Sample request

```bash
curl --location --request DELETE 'https://api.instantpay.in/contacts/person' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "gcId": "645383ba4acec95a32089822",
  "personId": "6453951835fca2f80f074002"
}'
```

```http
DELETE /contacts/person HTTP/1.1
Host: api.instantpay.in
Content-Type: application/json
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
  "gcId": "645383ba4acec95a32089822",
  "personId": "6453951835fca2f80f074002"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Person Deleted successfully",
  "data": null,
  "timestamp": "2023-05-04 16:53:20",
  "ipay_uuid": "h00699160a3a-fe31-4aa7-a765-4464f9590db0",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Gotchas

- Matches the earlier List Contact doc bug (`DELETE` + `gcId`/`personId`).
- Ignore `XContent-Type`.
- Success: `data: null`. Person CRUD complete (Add / Update / List / Delete).

### OpenAPI notes

- Spec title: `person` v1.0
- Server: `https://api.instantpay.in/contacts` · Path: `DELETE /person`
- `400` → `{}`

---

## 34. UPI ATM — Overview

**Title (provider):** UPI ATM

**UPI QR Cash Withdrawal API** — customer withdraws cash at a merchant outlet by scanning a dynamic UPI QR (instead of visiting a bank ATM).

### How it works (flow)

| Step | Name | Detail |
|------|------|--------|
| 1 | **QR Generation** | Merchant generates a **dynamic QR** via API (`amount` + reference ID) |
| 2 | **Customer Scan** | Customer scans QR in a UPI app (e.g. Google Pay, Cred, Paytm) |
| 3 | **Payment Authorization** | Customer approves with UPI PIN |
| 4 | **Transaction Processing** | Funds move customer bank → merchant account (instant) |
| 5 | **Cash Disbursement** | Merchant hands over equivalent cash to the customer |
| 6 | **Status Check** | API verifies txn status: success / failed / pending |

### Capabilities (from overview)

| Item | Detail |
|------|--------|
| **Product** | UPI QR Cash Withdrawal (cash-out at merchant / “UPI ATM”) |
| **QR type** | Dynamic — amount + reference ID |
| **Customer apps** | Any supporting UPI PSP (examples: Google Pay, Cred, Paytm) |
| **Settlement** | Instant transfer to merchant account, then cash handed over |
| **Status** | Separate status-check API (success / failed / pending) |

### Supported Bank and PSPs

Provider page includes screenshots for **Supported Bank and PSPs** (bank logos + PSP list). Capture exact bank/PSP allowlist from those images when implementing; treat as provider-maintained and confirm on staging.

Docs images (provider CDN):

- Flow diagram: `files.readme.io/…Screenshot_2026-04-15_at_10.05.42.png`
- Supported banks/PSPs: `files.readme.io/…Screenshot_2026-04-15_at_12.52.54.png`

### Adhikari product mapping (when implementing — not yet)

| Surface | Label |
|---------|--------|
| Agent UI area | **UPI Cash Point** |
| Service name | **UPI ATM** |

> Overview only — no endpoint on this page. Next pastes should cover QR generate + status (and any related) APIs.

---

## 35. UPI ATM — Generate QR

Generate a **dynamic UPI QR** for cash withdrawal at the merchant outlet (UPI Cash Point / UPI ATM).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/fi/uatm/generateQr` |
| **OpenAPI operationId** | `aeps-aadhaar-pay` ⚠️ (wrong — copied from Aadhaar Pay) |
| **Summary** | Generate QR |
| **OpenAPI title** | `aadhaar-pay` v1.0 ⚠️ (wrong product title) |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Outlet-Id` | String | M | Y | **Merchant unique ID** — must be unique per merchant |
| `X-Ipay-Endpoint-Ip` | String | M | N | End-customer IP |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `latitude` | String | M | Current location latitude |
| `longitude` | String | M | Current location longitude |
| `mobile` | String | M | User mobile number |
| `amount` | String | M | Amount to withdraw |
| `externalRef` | String | M | Unique transaction id |

### Provider notes (timing / NPCI)

| Item | Value |
|------|-------|
| **QR display time** | **30 seconds** (NPCI-mandated; fixed) |
| **Old total window** | 45s = 30s QR display + 15s txn |
| **Current total window** | **90s** = 30s QR display + **60s** txn time |

> Callout: unique `X-Ipay-Outlet-Id` per merchant required — wrong/missing outlet id can cause txn failures and **account suspension**.

### Sample request

```bash
curl --location 'https://api.instantpay.in/fi/uatm/generateQr' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'X-Ipay-Outlet-Id: {{outletId}}' \
--header 'Content-Type: application/json' \
--data '{
  "latitude": "28.50937",
  "longitude": "77.29727",
  "mobile": "7845681234",
  "amount": "100",
  "externalRef": "177616676341"
}'
```

```http
POST /fi/uatm/generateQr HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
X-Ipay-Outlet-Id: {{outletId}}
Content-Type: application/json

{
  "latitude": "28.50937",
  "longitude": "77.29727",
  "mobile": "7845681234",
  "amount": "100",
  "externalRef": "177616676341"
}
```

### Sample success response

> `qrString` / `qrMobile` signatures truncated for readability — keep full string from live API when rendering QR.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "QR Generated Successfully.",
  "data": {
    "externalRef": "1776237698",
    "qrStatus": "INITIATED",
    "qrStatusMsg": "QR Generated Successfully",
    "qrString": "upi://pay?pa=jpbcw.7216@jiomerchant&pn=Jio Payments Bank BC&mc=6013&tr=P260415125138TERTS&tn=CashWithdrawal&am=100.0&cu=INR&mode=15&purpose=00&orgid=JIOP&category=1&QRexpire=2026-04-15T12:52:23.607+05:30&&sign=…",
    "qrMobile": "upi://pay?pa=jpbcw.7216@jiomerchant&pn=Jio Payments Bank BC&mc=6013&tr=P260415125138TERTS&tn=CashWithdrawal&am=100.0&cu=INR&mode=15&purpose=00&orgid=JIOP&category=1&QRexpire=2026-04-15T12:52:23.607+05:30&&sign=…",
    "qrCreatedDt": "2026-04-15 12:51:38",
    "expiryDt": "2026-04-15 12:52:21",
    "displayExpirySec": "30",
    "ipayId": "P260415125138TERTS",
    "transactionMode": "CR",
    "payableValue": "100.39",
    "transactionValue": "100.00",
    "isOnusTxn": false
  },
  "timestamp": "2026-04-15 12:51:38",
  "ipay_uuid": "h000a18c41b4-507b-40b3-8404-d98b686229d2-faOKCZaivqXI",
  "orderid": "P260415125138TERTS",
  "environment": "LIVE",
  "internalCode": ""
}
```

### Response `data` fields (from sample)

| Field | Description |
|-------|-------------|
| `externalRef` | Echo / provider ref (sample may differ from request) |
| `qrStatus` | e.g. `INITIATED` |
| `qrStatusMsg` | Human message |
| `qrString` | Full `upi://pay?…` intent — encode as QR image |
| `qrMobile` | Same UPI deep link (sample identical to `qrString`) |
| `qrCreatedDt` | Created timestamp |
| `expiryDt` | QR expiry (~30s display window) |
| `displayExpirySec` | `"30"` |
| `ipayId` | InstantPay txn id (= `orderid` / `tr` in UPI string) |
| `transactionMode` | e.g. `CR` |
| `payableValue` | Amount customer pays (may include fee — sample `100.39` vs withdraw `100.00`) |
| `transactionValue` | Cash-out amount |
| `isOnusTxn` | Boolean |

### Envelope fields

| Name | Description |
|------|-------------|
| `statuscode` | InstantPay status code |
| `actcode` | Action code |
| `status` | Message |
| `data` | Payload object (docs table says “Array” — sample is **object**) |
| `timestamp` | `YYYY-MM-DD HH:MM:SS` |
| `ipay_uuid` | Request reference |
| `orderid` | Transaction id |
| `environment` | e.g. `LIVE` |

### Gotchas

- Requires **`X-Ipay-Outlet-Id`** (FI rails) — not only the usual four auth headers. Unique per merchant or risk failures / suspension.
- Path product code: **`/fi/uatm/`** (UPI ATM), not Contact Book / accounts.
- `payableValue` ≠ `transactionValue` in sample — likely fee/surcharge; confirm with KAM.
- Request `externalRef` sample (`177616676341`) ≠ response `externalRef` (`1776237698`) — status poll uses **`ipayId`**, not `externalRef` (see #36).
- Use `qrString` (or `qrMobile`) for QR render; `displayExpirySec: 30` — UI countdown must match NPCI.
- OpenAPI metadata is **wrongly copied from Aadhaar Pay** (title, `operationId`, response schema with `bankName` / `miniStatement` / balances). Trust curl + Result example, not the schema.
- Docs table types `data` as Array; live sample is an **object**.

### OpenAPI notes

- Spec title: `aadhaar-pay` v1.0 ⚠️
- Server: `https://api.instantpay.in/fi/uatm` · Path: `POST /generateQr`
- `operationId`: `aeps-aadhaar-pay` ⚠️
- Schema `data` properties look like AEPS mini-statement — **ignore**
- `400` → empty / `{}`

---

## 36. UPI ATM — QR Status

Poll / fetch status of a previously generated UPI ATM QR (cash withdrawal).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/fi/uatm/qrStatus` |
| **OpenAPI operationId** | `aeps-aadhaar-pay-1` ⚠️ (wrong — Aadhaar Pay copy) |
| **Summary** | QR Status (OpenAPI summary wrongly: “Copy of Aadhaar Pay”) |
| **OpenAPI title** | `aadhaar-pay` v1.0 ⚠️ |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Outlet-Id` | String | M | Y | Merchant unique ID |
| `X-Ipay-Endpoint-Ip` | String | M | N | End-customer IP |

### Request parameters

| Parameter | Type | Mandatory | Description |
|-----------|------|-----------|-------------|
| `ipayId` | String | M | InstantPay order id — from Generate QR `data.ipayId` / `orderid` |

### `qrStatus` values (provider callout)

| `qrStatus` | Meaning (provider text) |
|------------|-------------------------|
| `INITIATED` | QR Generated Successfully |
| `SUCCESS` | Cash Withdrawal is Successful |
| `FAILED` | Cash Withdrawal failed, please try again |
| `EXPIRED` | Cash Withdrawal failed due to expired QR, please try again |

> Webhook docs (provider): https://developers.instantpay.in/docs/webhooks — prefer webhook + poll as backup when implementing.

### Sample request

```bash
curl --location 'https://api.instantpay.in/fi/uatm/qrStatus' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'X-Ipay-Outlet-Id: {{outletId}}' \
--header 'Content-Type: application/json' \
--data '{
  "ipayId": "P260413184922ZNTZS"
}'
```

```http
POST /fi/uatm/qrStatus HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
X-Ipay-Outlet-Id: {{outletId}}
Content-Type: application/json

{
  "ipayId": "P260413184922ZNTZS"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Success",
  "data": {
    "qrStatus": "SUCCESS",
    "qrStatusMsg": "Transaction Successful",
    "ipayId": "P260416143515QZZAC",
    "amount": "100.00",
    "payer": {
      "vpa": "837XXXXXXX@pthdfc",
      "mobile": "837XXXXXXX",
      "name": "Full Name",
      "bankName": "",
      "accountNumber": "XXXXXXXX2589"
    },
    "openingBalance": "0.00",
    "closingBalance": "0.00",
    "operatorId": "610634173742",
    "walletIpayId": "1260416143539SCKVT"
  },
  "timestamp": "2026-04-16 14:45:21",
  "ipay_uuid": "h000a18e6d5b-0026-4087-b6fe-777444e6ccbe-7KXLt4Zi8Arp",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` fields (from sample)

| Field | Description |
|-------|-------------|
| `qrStatus` | `INITIATED` / `SUCCESS` / `FAILED` / `EXPIRED` |
| `qrStatusMsg` | Human message |
| `ipayId` | InstantPay order id |
| `amount` | Withdrawal amount |
| `payer` | Object: `vpa`, `mobile`, `name`, `bankName`, `accountNumber` (masked in samples) |
| `openingBalance` / `closingBalance` | Wallet/pool balances (sample often `"0.00"`) |
| `operatorId` | Operator / bank ref |
| `walletIpayId` | Related wallet txn id |

### Envelope fields

| Name | Description |
|------|-------------|
| `statuscode` | InstantPay status code |
| `actcode` | Action code |
| `status` | Message |
| `data` | Payload object (docs table says “Array” — sample is **object**) |
| `timestamp` | `YYYY-MM-DD HH:MM:SS` |
| `ipay_uuid` | Request reference |
| `orderid` | Often `null` on status sample (use `data.ipayId`) |
| `environment` | e.g. `LIVE` |

### Gotchas

- Status key is **`ipayId`**, not `externalRef` — store Generate QR `data.ipayId` / `orderid` for polling.
- Same **`X-Ipay-Outlet-Id`** requirement as Generate QR.
- Request sample `ipayId` (`P260413…`) ≠ response sample `ipayId` (`P260416…`) — provider pasted mismatched examples; treat as illustrative.
- Envelope `orderid` may be `null` even on SUCCESS — rely on `data.ipayId`.
- OpenAPI again wrongly Aadhaar Pay: title `aadhaar-pay`, summary “Copy of Aadhaar Pay”, `operationId` `aeps-aadhaar-pay-1`, AEPS-shaped schema — **ignore**.
- Docs table types `data` as Array; sample is **object**.
- Provider points to **webhooks** for async updates — implement webhook + optional poll within the 90s window.

### OpenAPI notes

- Spec title: `aadhaar-pay` v1.0 ⚠️
- Server: `https://api.instantpay.in/fi/uatm` · Path: `POST /qrStatus`
- Summary: “Copy of Aadhaar Pay” ⚠️ · `operationId`: `aeps-aadhaar-pay-1` ⚠️
- Schema `data` = AEPS leftover — **ignore**
- `400` → `"{}"` / `{}`

---
