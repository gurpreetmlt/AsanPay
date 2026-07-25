# InstantPay — Payouts

> Raw InstantPay Payouts docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`PAYOUTS_DETAILS.md`](PAYOUTS_DETAILS.md). Jab implement ho → root `InstantPay/PAYOUTS.md` (AEPS-style) banega.

**Provider:** InstantPay (Payouts)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (when APIs paste)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | **N** on Bank List (still send) — confirm others |

### Common response envelope

| Parameter | Type | Description |
|-----------|------|-------------|
| `statuscode` | String | InstantPay Status Code |
| `actcode` | String | Action Code |
| `status` | String/Array | Status message |
| `data` | Object/String | Response Data (if present) |
| `timestamp` | String | Response time (`YYYY-MM-DD HH:II:SS`) |
| `ipay_uuid` | String | Request reference number |
| `orderid` | String | Transaction Id (null if not a transaction) |
| `environment` | String | Live / Sandbox |
| `internalCode` | String | Usually null |

---

## Service-wise status

> Sidebar order under **PAYOUTS** — fill as pages paste.

| # | Service | InstantPay endpoint / area | Status |
|---|---------|------------------------------|--------|
| 1 | Payouts — Overview | Product overview (no REST on this page) | 📄 Docs captured |
| 2 | Bank List | `GET /payments/payout/banks` | 📄 Docs captured |
| 3 | Bank Accounts (initiate) | `POST /payments/payout` (`IMPS`/`NEFT`/`RTGS`) | 📄 Docs captured |
| 4 | Credit Cards (bill pay) | `POST /payments/payout` (`CREDITCARD`) | 📄 Docs captured |
| 5 | Payout Links — Overview | Product overview (share link; no bank details upfront) | 📄 Docs captured |
| 6 | Payout Links — Link List | `GET /payments/payout/link/list` | 📄 Docs captured |
| 7 | Payout Links — Create Link | `POST /payments/payout/link/create` | 📄 Docs captured |
| 8 | Payout Links — Cancel Link | `POST /payments/payout/link/cancel` | 📄 Docs captured |
| 9 | Payout Links — Notify Link | `POST /payments/payout/link/notify` | 📄 Docs captured |
| 10 | Payout Links — Track Link | `GET /payments/payout/link/track/{linkId}` | 📄 Docs captured |
| 11 | Tax Payments (GST) | `POST /tax/payments` | 📄 Docs captured |
| 12 | UPI VPA (initiate) | `POST /payments/payout` (`UPI`) | 📄 Docs captured |
| 13 | Wallets (initiate) | `POST /payments/payout` (`PAYTM`/`AMAZON`) | 📄 Docs captured |
| 14 | Beneficiary (Axis) — Add | `POST /payments/payout/addBeneficiary` | 📄 Docs captured |
| 15 | Beneficiary (Axis) — Fetch | `POST /payments/payout/fetchBeneficiary` | 📄 Docs captured |
| 16 | Beneficiary (Axis) — Delete | `POST /payments/payout/deleteBeneficiary` | 📄 Docs captured |

---

## 1. Payouts — Overview

**Title (provider):** Payouts

**Positioning:** Payouts API helps businesses handle payments with speed and reliability — salaries, vendor pay, customer refunds. Payments to **bank accounts**, **UPI IDs**, or **wallets**.

### Key features (provider)

| # | Feature | Detail |
|---|---------|--------|
| 1 | **Fast Payments, Anytime** | Instant send including weekends / public holidays |
| 2 | **Multiple Payment Options** | Bank via **IMPS / NEFT / RTGS**; **UPI**; wallets (e.g. Paytm, Amazon Pay) |
| 3 | **Bulk Transfers** | Thousands of txns without manual file uploads |
| 4 | **Live Transaction Tracking** | Real-time monitoring via dashboard |
| 5 | **Built for Business Growth** | Scalable long-term payout management |

### Why InstantPay Payouts (provider)

- Strong data protection / security
- Fits startups through enterprises
- API + InstantPay dashboard for consolidated payment control

### Use cases

| Use case | Detail |
|----------|--------|
| Vendor payments | Automate supplier / partner payouts |
| Employee salaries | Direct to bank, including non-working days |
| Customer refunds | Instant refunds |
| Loan disbursements | Fast fund release for FIs |

### Beyond Payouts (cross-sell on page)

| Area | Detail |
|------|--------|
| **Mandates** | Automated collection — eNACH or UPI AutoPay |
| **Collections** | Request/receive via UPI or payment links (SMS / WhatsApp) |

> Mandates / Collect may already have (or get) separate Unimplemented docs — do not duplicate full archive here from this overview alone.

### Getting started (provider)

1. Review API documentation
2. **Test in Sandbox**
3. **Go Live**

> Overview only — no endpoint / sample on this page. Next pastes: concrete Payout API pages (transfer, status, bulk, etc.).

### Gotchas

- Product marketing page — rails (IMPS/NEFT/RTGS/UPI/wallet) named but paths/fees unknown until API pastes.
- Distinct from AePS / DMT / Nepal remittance already in AsanPay — confirm overlap vs new InstantPay Payout rail before wiring.
- “Beyond Payouts” points at Mandates + Collections — separate product areas.

### Related

- Bank List (#2)
- Next Payouts sidebar pages (pending paste)

---

## 2. Bank List

**Title (provider):** Bank List

Access InstantPay’s payout **bank master** (identifiers + rail enablement / failure rates). Cache locally; keep fresh (see sync notes).

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/payments/payout/banks` |
| **OpenAPI operationId** | `payouts-bank-list` |
| **OpenAPI title** | `bank-list` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/payments/payout` + path `/banks` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) — OpenAPI wrongly types as integer |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP — still required; OpenAPI wrongly types as integer |

> No request body / query params in samples.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/payments/payout/banks' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}'
```

```http
GET /payments/payout/banks HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: {{authCode}}
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
```

### Sample success response (truncated)

> Provider paste is a **very long** `data[]` (hundreds of banks). Archive keeps **3 illustrative rows**; full list comes from live API. Response was truncated mid-array in the paste as well.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Banks fetched successfully",
  "data": [
    {
      "bankId": 109005,
      "name": "STATE BANK OF INDIA",
      "ifscGlobal": "SBIN0000001",
      "ifscAlias": "SBIN",
      "rtgsEnabled": 1,
      "rtgsFailureRate": "0",
      "neftEnabled": 1,
      "neftFailureRate": "0",
      "impsEnabled": 1,
      "impsFailureRate": "2",
      "upiEnabled": 0,
      "upiFailureRate": "0",
      "visaDirectCredit": "ACTIVE-INSTANT",
      "visaDirectDebit": "ACTIVE-INSTANT",
      "mastercardSendCredit": "ACTIVE-INSTANT",
      "mastercardSendDebit": "INACTIVE",
      "creditCardUpi": 0,
      "creditCardImps": 0,
      "creditCardNeft": 1
    },
    {
      "bankId": 134121,
      "name": "PAYTM PAYMENTS BANK",
      "ifscGlobal": "PYTM0123456",
      "ifscAlias": "PYTM",
      "rtgsEnabled": 1,
      "rtgsFailureRate": "0",
      "neftEnabled": 1,
      "neftFailureRate": "0",
      "impsEnabled": 1,
      "impsFailureRate": "7",
      "upiEnabled": 0,
      "upiFailureRate": "0",
      "visaDirectCredit": "INACTIVE",
      "visaDirectDebit": "ACTIVE",
      "mastercardSendCredit": "INACTIVE",
      "mastercardSendDebit": "INACTIVE",
      "creditCardUpi": 0,
      "creditCardImps": 0,
      "creditCardNeft": 1
    },
    {
      "bankId": 15910,
      "name": "ICICI Bank",
      "ifscGlobal": "ICIC0000011",
      "ifscAlias": "ICIC",
      "rtgsEnabled": 1,
      "rtgsFailureRate": "0",
      "neftEnabled": 1,
      "neftFailureRate": "0",
      "impsEnabled": 1,
      "impsFailureRate": "2",
      "upiEnabled": 0,
      "upiFailureRate": "0",
      "visaDirectCredit": "ACTIVE",
      "visaDirectDebit": "ACTIVE-INSTANT",
      "mastercardSendCredit": "INACTIVE-WIP",
      "mastercardSendDebit": "ACTIVE-INSTANT",
      "creditCardUpi": 1,
      "creditCardImps": 0,
      "creditCardNeft": 1
    }
  ]
}
```

### Bank object fields

| Field | Notes |
|-------|-------|
| `bankId` | Numeric InstantPay bank id |
| `name` | Display name |
| `ifscGlobal` | Sample / global IFSC |
| `ifscAlias` | IFSC prefix / alias (e.g. SBIN) |
| `rtgsEnabled` / `neftEnabled` / `impsEnabled` / `upiEnabled` | `0` \| `1` |
| `*FailureRate` | String percent-like (e.g. `"2"`, `"89"`) |
| `visaDirectCredit` / `visaDirectDebit` | e.g. `ACTIVE`, `ACTIVE-INSTANT`, `INACTIVE` |
| `mastercardSendCredit` / `mastercardSendDebit` | e.g. `ACTIVE-INSTANT`, `INACTIVE`, `INACTIVE-WIP` |
| `creditCardUpi` / `creditCardImps` / `creditCardNeft` | `0` \| `1` |

### Sync guidance (provider conflict)

| Source | Advice |
|--------|--------|
| Overview “Getting Started” | Cache data; **refresh daily** |
| Callout on Bank List page | Call API **once a week** to sync |

> Implement: cache + scheduled refresh; prefer **weekly** callout for production load unless product needs daily; document chosen cadence.

### Gotchas

- Path under **`/payments/payout/`** — not `/identity/…`.
- Distinct from Financial Verification Bank List (`GET /identity/verifyBankAccount/banks`).
- Endpoint-Ip **Provided = N** but header mandatory.
- OpenAPI types Auth-Code / Endpoint-Ip as **integer** — send **strings**.
- `data` is a **top-level array** (not nested under `banks`).
- Sample list truncated in provider paste / this archive — always fetch live for complete master.

### Related

- Payouts Overview (#1)
- Bank Accounts initiate (#3)
- Next payout transfer / status pages (pending paste)

---

## 3. Bank Accounts (initiate payout)

**Title (provider):** Bank Accounts

Initiate payouts to customers / vendors / employees from **InstantPay wallet** or **linked bank**. Rails: bank **IMPS / NEFT / RTGS** (page also mentions UPI + Amazon Pay wallet). **Not for DMT.**

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout` |
| **OpenAPI operationId** | `payouts-wallet` (**misnamed** — page is Bank Accounts; OpenAPI summary “Wallets”) |
| **OpenAPI title** | `bank-accounts` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout` |

> OpenAPI requestBody / code-samples lean **wallet** (`AMAZON`/`PAYTM`, blank IFSC). **Trust “Request Parameter for Bank” + Bank sample** for this section; wallet variants may be a sibling paste.

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body (bank)

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer` | Object | Mandatory | Payer details |
| `payer.bankProfileId` | String | Mandatory | Bank profile id (`0` = InstantPay wallet) |
| `payer.accountNumber` | String | Mandatory | Connected bank a/c **or** InstantPay registered mobile if wallet |
| `payee` | Object | Mandatory | Payee details |
| `payee.name` | String | Mandatory | Account holder name |
| `payee.accountNumber` | String | Mandatory | End-user account number |
| `payee.bankIfsc` | String | Mandatory | IFSC |
| `payee.payeeListId` | String | Optional* | Beneficiary id from Fetch Beneficiary — **mandatory for Axis Connected Banking** |
| `transferMode` | String | Mandatory | `IMPS` · `NEFT` · `RTGS` |
| `transferAmount` | String | Mandatory | Amount |
| `externalRef` | String | Mandatory | Unique txn id (alphanumeric) |
| `latitude` / `longitude` | String | Mandatory | End user coords — **4 digits after decimal** |
| `remarks` | String | Optional | Payment remarks — **alphabet only, max 20** (table label `Remarks`; samples use `remarks`) |
| `purpose` | String | Optional | Case-sensitive: `SALARY` · `REIMBURSEMENT` · `BONUS` · `INCENTIVE` · `CUSTOMER_REFUND` · `OTHERS` |
| `otp` / `otpReference` | String | Optional | Axis Connected Banking only |

### Sample request (bank) — cleaned

> Provider sample had broken JSON (`"payeeListId" " ""`). Fixed below. Mask accounts in logs.

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "payer": {
        "bankProfileId": "10910",
        "accountNumber": "xxxxxxxxxx"
    },
    "payee": {
        "name": "Instantpay India Ltd",
        "accountNumber": "xxxxxxxxxx",
        "bankIfsc": "YESB0CMSNOC",
        "payeeListId": ""
    },
    "transferMode": "IMPS",
    "transferAmount": "1000",
    "externalRef": "IMPS1",
    "latitude": "20.1236",
    "longitude": "78.1228",
    "remarks": "Fund Transfer",
    "purpose": "REIMBURSEMENT",
    "otp": "",
    "otpReference": ""
}'
```

### Sample success response (LIVE)

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "IMPS1",
    "poolReferenceId": "1211112165649WFTYK",
    "txnValue": "1000",
    "txnReferenceId": "13237897641",
    "pool": {
      "account": "xxxxxxxxxx",
      "openingBal": "5.17",
      "mode": "DR",
      "amount": "3.46",
      "closingBal": "1.71"
    },
    "payer": {
      "account": "xxxxxxxxxx",
      "name": "Sample Store"
    },
    "payee": {
      "account": "xxxxxxxxxx",
      "name": "Instantpay India Ltd"
    }
  },
  "timestamp": "2021-11-12 16:56:50",
  "ipay_uuid": "h00695deb945-3def-42ba-8857-2ff7bac93fe6",
  "orderid": "1211112165649WFTYK",
  "environment": "LIVE",
  "internalCode": null
}
```

### Funding source notes (provider)

| Source | `bankProfileId` | `accountNumber` |
|--------|-----------------|-----------------|
| InstantPay wallet | `0` | InstantPay registered mobile |
| Linked current account | From dashboard (`bankId` / `bankProfileId` / a/c) | Connected bank a/c |

Axis Connected Banking: **Add (#14)** · **Fetch (#15)** · **Delete (#16)**; payout may need `payeeListId` + `otp` / `otpReference`.

### Important rules (provider)

1. Lat/long: degrees with **4** digits after decimal
2. `externalRef`: unique, alphanumeric
3. `remarks`: alphabet only, **max 20** chars
4. `purpose`: **case sensitive**
5. No response / timeout → treat as **Pending**; confirm via **Transaction Status API**

### Gotchas

- **Not DMT** — separate InstantPay remittance rail.
- Same `POST /payments/payout` URL likely shared with wallet modes — OpenAPI polluted with wallet schema.
- Sample fee (pool `amount`) **~3.46** on ₹1000 — confirm live tariff.
- Broken `payeeListId` in provider curl — use `"payeeListId": ""`.

### Related

- Bank List (#2)
- Credit Cards (#4)
- Add Beneficiary (#14) — Axis Connected Banking
- Fetch Beneficiary (#15)
- Delete Beneficiary (#16)
- Wallets (#13)
- Transaction Status (pending paste)

**Title (provider):** Credit Cards

One-shot **credit card bill payment** via Payouts API. Supports Visa, Mastercard, Diners, American Express.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout` (same as Bank Accounts) |
| **OpenAPI operationId** | `payouts-credit-card` |
| **OpenAPI title** | `credit-card-payout` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout` |
| **transferMode** | **`CREDITCARD`** (fixed) |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer` | Object | Mandatory | Payer / funding side |
| `payer.bankProfileId` | String | Mandatory | **`0`** |
| `payer.name` | String | Mandatory | Sender name |
| `payer.accountNumber` | String | Mandatory | Sender account details (sample: InstantPay mobile) |
| `payer.paymentMode` | String | Mandatory | `PAY_CARD` · `NETBANKING` · `UPI` |
| `payer.cardNumber` | String | O* | Debit card — **aes-256-cbc**; mandatory if `PAY_CARD` |
| `payer.cardSecurityCode` | String | O | CVV — **aes-256-cbc** |
| `payer.referenceNumber` | String | O* | Mandatory when `paymentMode` is `UPI` |
| `payer.cardExpiry.month` / `.year` | String | O | MM / YY — **aes-256-cbc** |
| `payee.name` | String | Mandatory | Card holder name |
| `payee.accountNumber` | String | Mandatory | **Credit card number** — **aes-256-cbc** |
| `transferMode` | String | Mandatory | `CREDITCARD` |
| `transferAmount` | String | Mandatory | Amount |
| `externalRef` | String | Mandatory | Unique alphanumeric |
| `latitude` / `longitude` | String | Mandatory | **4** decimal places |
| `remarks` | String | Optional | Alphabet, max **20** (table: `Remarks`) |
| `alertEmail` | String | Optional | Email notification to end user |

> Sample also sends `payer.bankId: "0"` — not in param table; harmless extra?

### Sample request

> Secrets → placeholders. `payee.accountNumber` is ciphertext in sample.

```bash
curl --location 'https://api.instantpay.in/payments/payout' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: 1' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
    "payer": {
        "bankId": "0",
        "bankProfileId": "0",
        "accountNumber": "xxxxxxxxxx",
        "name": "Instantpay",
        "paymentMode": "NETBANKING",
        "cardNumber": "",
        "cardSecurityCode": "",
        "cardExpiry": { "month": "", "year": "" },
        "referenceNumber": ""
    },
    "payee": {
        "accountNumber": "{{aes256cbcEncryptedCreditCard}}",
        "name": "Instantpay"
    },
    "transferMode": "CREDITCARD",
    "transferAmount": "1.00",
    "externalRef": "BILLPAY1",
    "latitude": "20.5936",
    "longitude": "78.9628",
    "remarks": "Credit Card BILL",
    "alertEmail": ""
}'
```

### Sample success response (LIVE)

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "TX1223323",
    "poolReferenceId": "1211112165649WFTYK",
    "txnValue": "4.00",
    "txnReferenceId": "00",
    "pool": {
      "account": "xxxxxxxxxx",
      "openingBal": "3697.27",
      "mode": "DR",
      "amount": "9.90",
      "closingBal": "3687.37"
    },
    "payer": {
      "account": "xxxxxxxxxx",
      "name": "Sample Store"
    },
    "payee": {
      "account": "3798XXXXXXXX2004",
      "name": "Instantpay India Ltd"
    }
  },
  "timestamp": "2022-03-15 18:08:13",
  "ipay_uuid": "h00595d34e99-1646-4838-93bc-8ab6ca4d8f06",
  "orderid": "1211112165649WFTYK",
  "environment": "LIVE",
  "internalCode": null
}
```

### Important rules

1. Lat/long: **4** digits after decimal
2. `externalRef`: unique alphanumeric
3. Remarks: alphabet, max **20**
4. Timeout / no response → **Pending** → Transaction Status API
5. **Pre-check** card via **Card BIN Checker** (`POST /identity/binChecker` — see Financial Verification)
6. Encrypt PAN/CVV/expiry/CC number with **aes-256-cbc** using InstantPay credentials-page encryption key

### Gotchas

- Same URL as bank/wallet payouts — distinguish by `transferMode: CREDITCARD`.
- `payer.paymentMode` = how **sender funded** the pay (debit card / NB / UPI), not the credit card network.
- Pool fee sample **~9.90** on `txnValue` **4.00** — confirm tariff (fee ≠ txn value).
- OpenAPI schema omits most `payer.paymentMode` / card fields — trust param table + sample.
- PCI: never log plaintext card data; only ciphertext in transit.

### Related

- Bank Accounts (#3)
- FV Card BIN Checker
- Payout Links (#5+)
- Transaction Status (pending paste)

---

## 5. Payout Links — Overview

**Title (provider):** Overview (under **Payout Links**)

**Headline:** Empower your business with Instantpay’s Payout Links

Flexible disbursement **without needing bank account details upfront**. Share a payout link; recipient picks payment method and completes securely.

### Positioning

| Item | Detail |
|------|--------|
| **Product area** | Payouts → **Payout Links** |
| **Audience** | Customers, vendors, employees |
| **Share channels** | SMS · email · WhatsApp |
| **Value** | Less manual effort, timely transfers, speed / convenience / control |

### Capabilities (from overview)

| Capability | Detail |
|------------|--------|
| No bank details upfront | Sender shares link; payee supplies / chooses method later |
| Multi-channel share | SMS, email, WhatsApp |
| Recipient choice | Preferred payment method at redeem time |
| Business fit | All sizes — streamline payout ops |

> Overview only — no endpoint / sample on this page. Next pastes: create link / status / cancel / etc.

### Gotchas

- Distinct from direct `POST /payments/payout` (Bank Accounts / Credit Cards) where payee account is known at initiate.
- Distinct from Collect payment links (inbound) — this is **outbound** disbursement via link.
- APIs / fees TBD on next Payout Links pastes.

### Related

- Payouts Overview (#1)
- Bank Accounts (#3)
- Link List (#6)
- Next Payout Links API pages (pending paste)

---

## 6. Payout Links — Link List

**Title (provider):** Link List

View / manage active and completed payout links (filter + pagination).

| | |
|--|--|
| **Method** | `GET` (with JSON **body** — unusual) |
| **URL** | `https://api.instantpay.in/payments/payout/link/list` |
| **OpenAPI operationId** | `payout-link-list` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title** — leftover) |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout/link/list` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **Y** | End-customer IP |

> Also send `Content-Type: application/json` when sending body.

### Request body (optional filters)

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `filters` | Object | Optional | Link filters |
| `filters.status` | String or String[] | Optional | `ISSUED` · `CLAIMED` · `CANCELLED` · `PROCESSING` · `EXPIRED` — table says String; sample uses **array** `["ISSUED"]` |
| `filters.contact` | String | Optional | Name, mobile, or email |
| `filters.linkId` | String | Optional | Link id |
| `pagination` | Object | Optional | Page controls |
| `pagination.pageNumber` | String | Optional | Page number |
| `pagination.recordsPerPage` | String | Optional | Page size |

### Sample request

> Secrets → placeholders.

```bash
curl --location --request GET 'https://api.instantpay.in/payments/payout/link/list' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "filters": {
        "status": ["ISSUED"],
        "contact": "",
        "linkId": "657aa9841b8d3897ff0a84fb"
    },
    "pagination": {
        "pageNumber": "1",
        "recordsPerPage": "10"
    }
}'
```

### Sample success response

> `environment`: **`PRODUCTION`** (not LIVE). Phones masked in archive.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "meta": {
      "totalPages": 6,
      "currentPage": 1,
      "totalRecords": 12,
      "recordsOnCurrentPage": 2,
      "recordFrom": 1,
      "recordTo": 2
    },
    "records": [
      {
        "amount": 120.11,
        "purpose": "refund",
        "description": "Giving captch payment",
        "status": "ISSUED",
        "linkId": "657aa9841b8d3897ff0a84fb",
        "contactDetails": {
          "name": "Sample Name",
          "email": "help@instantpay.in",
          "mobile": "xxxxxxxxxx"
        },
        "referenceNo": "NA",
        "orderId": "1231214070644TLWAP",
        "url": "https://instant.pe/LS25FH",
        "qrUrl": "https://api.instantpay.in/payment/payout/link/qr/LS25FH",
        "paymentModes": ["ACCOUNT"],
        "verifyBene": true,
        "activatedAt": "2023-11-20 14:02:00",
        "expiredAt": "2024-03-13 12:36:44"
      },
      {
        "amount": 120.11,
        "purpose": "refund",
        "description": "Giving captch payment",
        "status": "PROCESSING",
        "linkId": "657a9ac51b8d3897ff0a84f9",
        "contactDetails": {
          "name": "Sample Name",
          "email": "developers@instantpay.in",
          "mobile": "xxxxxxxxxx"
        },
        "referenceNo": "NA",
        "orderId": "1231214060349YVGXT",
        "url": "https://instant.pe/CH24wF",
        "qrUrl": "https://api.instantpay.in/payment/payout/link/qr/CH24wF",
        "paymentModes": ["ACCOUNT"],
        "verifyBene": true,
        "activatedAt": "2023-11-20 14:02:00",
        "expiredAt": "2024-03-13 11:33:49"
      }
    ]
  },
  "timestamp": "2023-12-14 16:43:59",
  "ipay_uuid": "h0009ad8a356-b745-4ee2-88bb-0c4abb750ed7-bQQqUjuG4ASN",
  "orderid": null,
  "environment": "PRODUCTION",
  "internalCode": null
}
```

### Record fields

| Field | Notes |
|-------|-------|
| `amount` / `purpose` / `description` | Link payload |
| `status` | ISSUED / PROCESSING / … |
| `linkId` | Id for filters / detail APIs |
| `contactDetails` | name, email, mobile |
| `url` | Short link (`instant.pe/…`) |
| `qrUrl` | QR image URL — path uses **`/payment/`** (singular), not `/payments/` |
| `paymentModes` | e.g. `ACCOUNT` |
| `verifyBene` | Boolean |
| `activatedAt` / `expiredAt` | Timestamps |
| `meta` | Pagination summary |

### Gotchas

- **GET + JSON body** — confirm client/HTTP stack allows body on GET (or try POST if live fails).
- `filters.status`: table String vs sample **array**.
- Endpoint-Ip **Y** here (direct payouts often **N**).
- `qrUrl` host path `payment` vs API `payments` — use returned URL as-is.
- OpenAPI info title wrongly `bank-accounts`.

### Related

- Payout Links Overview (#5)
- Create Link (#7)
- Cancel / detail pages (pending paste)

---

## 7. Payout Links — Create Link

**Title (provider):** Create Link

Generate a unique payout link for disbursement **without collecting bank details** upfront.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/link/create` |
| **OpenAPI operationId** | `payout-link-create` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title**) |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout/link/create` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `contactDetails` | Object | Optional* | Recipient contact |
| `contactDetails.name` | String | O* | Mandatory if `verifyBene` is **true** |
| `contactDetails.mobile` | String | O* | Mandatory if `verifyBene` is **true** |
| `contactDetails.email` | String | O* | Mandatory if `verifyBene` is **true** |
| `verifyBene` | Boolean | Mandatory | Beneficiary validation on/off |
| `amount` | String | Mandatory | Transfer amount |
| `purpose` | String | Mandatory | `Refund` · `Cashback` · `Comission` (provider spelling) · `Incentive` · `Payout` · `Greeting` |
| `description` | String | Mandatory | Description |
| `referenceNo` | String | Optional | Default `NA` if empty |
| `activatedAt` | String | Mandatory | Link activation datetime |
| `expiredAt` | String | Mandatory | Expiry if unclaimed |
| `paymentModes` | String[] | Mandatory | `ACCOUNT` · `VPA` · `AMAZON` · `CREDITCARD` |
| `sendAlert` | Boolean | Optional | Send notification if true |

### Sample request

> Secrets / mobile masked. Prefer **`AMAZON`** (param table + curl); HTTP sample typo **`AMZON`**.

```bash
curl --location 'https://api.instantpay.in/payments/payout/link/create' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "contactDetails": {
        "name": "Instantpay India Limited",
        "mobile": "xxxxxxxxxx",
        "email": "help@instantpay.in"
    },
    "verifyBene": true,
    "amount": "120.11",
    "purpose": "Refund",
    "description": "payment",
    "referenceNo": "",
    "activatedAt": "2023-11-20 14:02:00",
    "expiredAt": "2024-03-13 12:36:44",
    "sendAlert": true,
    "paymentModes": ["ACCOUNT", "VPA", "AMAZON", "CREDITCARD"]
}'
```

### Sample success response

> Status message: **`Link Created Successfully`**. `purpose` echoed lowercase (`refund`). `environment`: **PRODUCTION**.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Link Created Successfully",
  "data": {
    "linkId": "657aa9841b8d3897ff0a84fb",
    "url": "https://instant.pe/LS25FH",
    "status": "ISSUED",
    "contactDetails": {
      "name": "Instantpay India Limited",
      "mobile": "xxxxxxxxxx",
      "email": "help@instantpay.in"
    },
    "amount": 120.11,
    "purpose": "refund",
    "description": "Giving captch payment",
    "referenceNo": "NA",
    "verifyBene": true,
    "paymentModes": ["ACCOUNT", "VPA", "AMAZON", "CREDITCARD"],
    "orderId": "1231214070644TLWAP",
    "activatedAt": "2023-11-20 14:02:00",
    "expiredAt": "2024-03-13 12:36:44"
  },
  "timestamp": "2023-12-14 12:36:45",
  "ipay_uuid": "h0009ad84ae9-ddca-46ae-b631-b7ecda7b33d4-WmhQCUyFnkmi",
  "orderid": "1231214070644TLWAP",
  "environment": "PRODUCTION",
  "internalCode": null
}
```

### Link statuses (provider)

| Status | Meaning |
|--------|---------|
| `ISSUED` | Link issued successfully |
| `CLAIMED` | Recipient claimed amount |
| `CANCELLED` | Link cancelled |
| `PROCESSING` | Claim in progress |
| `EXPIRED` | Link expired |

### Gotchas

- Endpoint-Ip **N** (Create) vs **Y** (Link List) — still send.
- Provider sample `expiredAt` earlier than `activatedAt` — broken; use sensible window.
- `Comission` spelling in docs; response may normalize purpose to lowercase.
- `AMAZON` vs typo `AMZON` in HTTP/response samples — implement **`AMAZON`**; tolerate `AMZON` if returned.
- Amount string may round (e.g. `120.112` → `120.11`).
- OpenAPI title wrongly `bank-accounts`.

### Related

- Link List (#6)
- Payout Links Overview (#5)
- Cancel Link (#8)

---

## 8. Payout Links — Cancel Link

**Title (provider):** Cancel Link

Cancel **unprocessed** payout links to avoid unnecessary payments.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/link/cancel` |
| **OpenAPI operationId** | `payout-link-cancel` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title**) |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout/link/cancel` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **Y** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `linkId` | String | Mandatory | Link id from create / list |

### Sample request

```bash
curl --location 'https://api.instantpay.in/payments/payout/link/cancel' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "linkId": "657a99b961f05879ae06cb56"
}'
```

### Sample success response

> Page sample: `environment` **PRODUCTION**. OpenAPI example: **SANDBOX**. `data` is **`null`**.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Link Cancelled Successfully",
  "data": null,
  "timestamp": "2023-12-14 11:29:45",
  "ipay_uuid": "h0009ad832f4-f43d-40c0-81d3-c04979ab81df-e51WjQG73oSk",
  "orderid": null,
  "environment": "PRODUCTION",
  "internalCode": null
}
```

### Gotchas

- Only **unprocessed** links (typically `ISSUED`) — claimed/processing may fail (confirm live errors).
- Success = message only; no payload in `data`.
- After cancel, list should show `CANCELLED`.
- Endpoint-Ip **Y** (same as Link List; Create was **N**).

### Related

- Create Link (#7)
- Link List (#6)
- Notify Link (#9)

---

## 9. Payout Links — Notify Link

**Title (provider):** Notify Link

Resend / send notifications about a **pending** payout link via SMS, email, or WhatsApp (channels chosen by InstantPay using contact on the link).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/link/notify` |
| **OpenAPI operationId** | `payout-link-notify` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title**) |
| **OpenAPI server** | `https://api.instantpay.in/payments` + path `/payout/link/notify` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **Y** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `linkId` | String | Mandatory | Link id from create / list |

> No channel selector in request — InstantPay notifies using stored contact (mobile/email). Create’s `sendAlert` is separate (at create time).

### Sample request

```bash
curl --location 'https://api.instantpay.in/payments/payout/link/notify' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "linkId": "657aa9841b8d3897ff0a84fb"
}'
```

### Sample success response

> `data` is **`null`**. Status message includes **masked** mobile/email.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Notification Link Sent To *******742 and ******@instantpay.in",
  "data": null,
  "timestamp": "2023-12-14 15:27:40",
  "ipay_uuid": "h0009ad88809-ebd1-49ef-80cf-d2686d11072a-lcvrH7edHrIt",
  "orderid": null,
  "environment": "PRODUCTION",
  "internalCode": null
}
```

### Gotchas

- Requires contact on link (create with name/mobile/email when notifying).
- Same shape as Cancel: success via `status` string, `data: null`.
- Marketing mentions WhatsApp; sample status only shows SMS+email masks — channels may vary.
- Distinct from Create `sendAlert: true` (initial notify).

### Related

- Create Link (#7)
- Cancel Link (#8)
- Link List (#6)
- Track Link (#10)

---

## 10. Payout Links — Track Link

**Title (provider):** Track Link

Real-time status + **activity timeline** for a payout link.

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `https://api.instantpay.in/payments/payout/link/track/{linkId}` |
| **OpenAPI operationId** | `payout-link-track` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title**) |
| **OpenAPI path (stub)** | `/payout/link/track` — samples append **`/{linkId}`** |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **Y** | End-customer IP |

### Path parameter

| Parameter | Requirement | Description |
|-----------|-------------|-------------|
| `linkId` | Mandatory | In URL path (not body) |

> Provider curl/HTTP samples wrongly use `Host: 127.0.0.1:8000` — use **`api.instantpay.in`**. Empty `--data` on GET is noise; omit body.

### Sample request

```bash
curl --location --request GET 'https://api.instantpay.in/payments/payout/link/track/{{linkId}}' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}'
```

```http
GET /payments/payout/link/track/{{linkId}} HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}
```

### Sample success response

> PII masked. Later `linkActivity` rows may include claim/bene fields.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "status": "CLAIMED",
    "amount": 120.11,
    "linkActivity": [
      {
        "status": "Payout link created",
        "activityAt": "2023-12-12 14:51:25"
      },
      {
        "status": "Payout link notification sent to ********** and ***@***.***",
        "activityAt": "2023-12-12 14:51:26"
      },
      {
        "status": "Beneficiary verification successful",
        "activityAt": "2023-12-12 14:51:31",
        "orderId": "1231212092131KTMDF",
        "accountType": "ACCOUNT",
        "accountNumber": "xxxxxxxxxx",
        "accountIfsc": "YESB0CMSNOC"
      },
      {
        "status": "Link Claimed successfully",
        "activityAt": "2023-12-12 14:51:31",
        "orderId": "1231212092131FDBUT",
        "accountType": "ACCOUNT",
        "accountNumber": "xxxxxxxxxx",
        "accountIfsc": "YESB0CMSNOC"
      }
    ]
  },
  "timestamp": "2023-12-14 16:42:49",
  "ipay_uuid": "h0009ad8a2eb-7790-4fe2-a9af-8cdb732d668c-WbrjDVgsp8oy",
  "orderid": null,
  "environment": "PRODUCTION",
  "internalCode": null
}
```

### Link status values

| Status | Meaning |
|--------|---------|
| `ISSUED` | Issued successfully |
| `CANCELLED` | Cancelled |
| `EXPIRED` | Expired |
| `PROCESSING` | Payout under process |
| `CLAIMED` | Claimed successfully |

### `linkActivity[]` fields

| Field | Notes |
|-------|-------|
| `status` | Human-readable event string |
| `activityAt` | Event timestamp |
| `orderId` | Present on verify/claim steps |
| `accountType` | e.g. `ACCOUNT` (matches paymentModes) |
| `accountNumber` / `accountIfsc` | Bene details after claim/verify |

### Gotchas

- **Path param** `linkId` — not JSON body like cancel/notify.
- Docs sample host is localhost — always call production API host.
- OpenAPI omits path `{linkId}` in path key — trust curl.
- Activity may expose full mobile/email in status strings — redact in UI logs.
- Distinct from direct-payout **Transaction Status** API (still pending if separate).

### Related

- Notify Link (#9)
- Link List (#6)
- Create / Cancel (#7–#8)
- Tax Payments (#11)

---

## 11. Tax Payments (GST)

**Title (provider):** Tax Payments

Pay **direct / indirect taxes** via InstantPay. Documented rail so far: **GST** challan via CPIN. (Nav sits under Payouts; API is under `/tax/`.)

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/tax/payments` |
| **OpenAPI operationId** | `tax-payments-gst` |
| **OpenAPI title** | `gst` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/tax` + path `/payments` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `taxType` | String | Mandatory | **`GST`** (fixed for this page) |
| `data` | Object | Mandatory | Tax payload |
| `data.cpin` | String | Mandatory | GST challan CPIN — docs say **14 digit** (online challan) |
| `amount` | String | Mandatory | GST challan amount |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude — table typo **`longitutde`**; sample uses **`longitude`** |
| `externalRef` | String | Mandatory | Unique alphanumeric txn id |
| `remarks` | String | Mandatory | GST remarks |
| `alertEmails` | String[] | Mandatory | Alert emails — table says String; sample is **array** |

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/tax/payments' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data-raw '{
    "taxType": "GST",
    "data": {
        "cpin": "017439876554"
    },
    "amount": "1.00",
    "latitude": "28.6441",
    "longitude": "77.2171",
    "externalRef": "PREPROD1",
    "remarks": "TEST GST PAYMENT",
    "alertEmails": ["help@instantpay.in"]
}'
```

### Sample success response (LIVE)

> `internalCode` may be non-null (`Request submitted to bank`). Pool `amount` matches `txnValue` in sample.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "PROD1",
    "poolReferenceId": "1231214070644TLWAP",
    "txnValue": "10.00",
    "txnReferenceId": "00",
    "pool": {
      "account": "xxxxxxxxxx",
      "openingBal": "3722.21",
      "mode": "DR",
      "amount": "10.00",
      "closingBal": "3712.21"
    },
    "payer": {
      "account": "xxxxxxxxxx",
      "name": "Instantpay India Limited"
    },
    "payee": {
      "account": "0174398765544",
      "name": "Sample Name"
    }
  },
  "timestamp": "2022-04-02 09:45:52",
  "ipay_uuid": "h00595f6d0a7-7fc3-4dfc-8c9b-50457ba29eca",
  "orderid": "1220402094551TVWXW",
  "environment": "LIVE",
  "internalCode": "Request submitted to bank"
}
```

### Important rules (provider notes)

1. Lat/long: **4** digits after decimal
2. `externalRef`: unique alphanumeric
3. Remarks: alphabet, max **20** (sample has spaces — confirm live rules)
4. Note mentions “Purpose are Case Sensitive” but **no `purpose` field** on this page — leftover from payout docs

### Gotchas

- Path **`/tax/payments`**, not `/payments/payout`.
- Table `longitutde` → send **`longitude`**.
- `alertEmails` = **array** in working sample.
- CPIN documented as 14-digit; sample CPIN length may differ — validate against GST challan.
- Response shape similar to payout initiate (`pool` / payer / payee).
- Distinct from bank/CC/link payouts.

### Related

- Bank Accounts (#3)
- UPI VPA (#12)
- Transaction Status (pending — may apply to tax too)

---

## 12. UPI VPA (initiate payout)

**Title (provider):** UPI VPA

Payout to a **UPI VPA** from InstantPay wallet / bank profile via the shared payout endpoint.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout` (same as Bank / Credit Card) |
| **OpenAPI operationId** | `payouts-upi-vpa` |
| **OpenAPI title** | `upi-vpa` v1.0 |
| **transferMode** | **`UPI`** (fixed) |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer.bankProfileId` | String | Mandatory | Bank profile id (sample **`0`** = InstantPay wallet) |
| `payer.accountNumber` | String | Mandatory | InstantPay registered mobile (per table) |
| `payee.name` | String | Mandatory | Account holder name |
| `payee.accountNumber` | String | Mandatory | **UPI VPA** (e.g. `user@icici`) |
| `payee.bankIfsc` | String | Optional | Usually empty for VPA |
| `transferMode` | String | Mandatory | **`UPI`** |
| `transferAmount` | String | Mandatory | Amount |
| `externalRef` | String | Mandatory | Unique alphanumeric |
| `latitude` / `longitude` | String | Mandatory | **4** decimal places |
| `remarks` | String | Optional | Alphabet, max **20** |
| `alertEmail` | String | Optional | Notify payee |
| `purpose` | String | Optional | Case-sensitive: SALARY · REIMBURSEMENT · BONUS · INCENTIVE · CUSTOMER_REFUND · OTHERS |

> Param table lists a nested **`transfer`** object as Mandatory — **not** in working sample. OpenAPI invents `payer.bankProfile` (wrong name) and a top-level `transfer` string — **trust curl sample**.

### Sample request

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "payer": {
        "bankProfileId": "0",
        "accountNumber": "xxxxxxxxxx"
    },
    "payee": {
        "name": "Instantpay India Ltd",
        "accountNumber": "user@icici",
        "bankIfsc": ""
    },
    "transferMode": "UPI",
    "transferAmount": "5.00",
    "externalRef": "UPI1",
    "latitude": "20.1226",
    "longitude": "78.1228",
    "remarks": "UPI Payment",
    "alertEmail": "",
    "purpose": ""
}'
```

### Sample success response (LIVE)

> Provider JSON had a trailing comma after `environment` — cleaned. Request amount sample `5.00` vs response `txnValue` `1000` — illustrative mismatch.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "IMPS1",
    "poolReferenceId": "1231214070644TLWAP",
    "txnValue": "1000",
    "txnReferenceId": "1323896541",
    "pool": {
      "account": "xxxxxxxxxx",
      "openingBal": "5.17",
      "mode": "DR",
      "amount": "3.46",
      "closingBal": "1.71"
    },
    "payer": {
      "account": "xxxxxxxxxx",
      "name": "Sample Name"
    },
    "payee": {
      "account": "user@icici",
      "name": "Instantpay India Ltd"
    }
  },
  "timestamp": "2021-11-12 16:56:50",
  "ipay_uuid": "h00695deb945-3def-42ba-8857-2ff7bac93fe6",
  "orderid": "1211112165649WFTYK",
  "environment": "LIVE"
}
```

### Important rules

1. Lat/long: 4 decimal places
2. `externalRef`: unique alphanumeric
3. Remarks: alphabet, max 20
4. Purpose: case sensitive
5. Timeout / no response → **Pending** → Transaction Status API

### Gotchas

- Same URL as Bank/CC — discriminator `transferMode: UPI`; `payee.accountNumber` = VPA.
- ≠ Mobile Based **Mobile to UPI VPA Lookup** (`/identity/mobile/vpaLookup`) and ≠ FV VPA verify.
- Ignore phantom `transfer` object in param table / OpenAPI `bankProfile` typo.
- Fee sample pool **~3.46** (same ballpark as bank IMPS sample).

### Related

- Bank Accounts (#3)
- Credit Cards (#4)
- Wallets (#13)
- Transaction Status (pending paste)

---

## 13. Wallets (initiate payout)

**Title (provider):** Wallets

Payout to **Paytm** or **Amazon Pay** wallets (registered mobile). Same shared `POST /payments/payout` endpoint.

> **Docs pollution:** Page blurb / OpenAPI description still say “bank accounts (IMPS / UPI / NEFT / RTGS)” — ignore; this page is **wallet** modes `PAYTM` / `AMAZON`.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout` |
| **OpenAPI operationId** | `payouts-wallet` |
| **OpenAPI title** | `bank-accounts` v1.0 (**wrong title**) |
| **transferMode** | **`PAYTM`** or **`AMAZON`** |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer.bankProfileId` | String | Mandatory | **`0`** |
| `payer.accountNumber` | String | Mandatory | InstantPay registered mobile |
| `payee.name` | String | Mandatory | Account holder name |
| `payee.accountNumber` | String | Mandatory | **Wallet-registered mobile** |
| `payee.bankIfsc` | String | Optional | No input — leave empty |
| `transferMode` | String | Mandatory | `PAYTM` · `AMAZON` |
| `transferAmount` | String | Mandatory | Amount |
| `externalRef` | String | Mandatory | Unique alphanumeric |
| `latitude` / `longitude` | String | Mandatory | **4** decimal places |
| `remarks` | String | Optional | Alphabet, max **20** |
| `alertEmail` | String | Optional | Notify end user |
| `purpose` | String | Optional | Case-sensitive enum (SALARY, …) |

### Sample request (`AMAZON`)

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "payer": {
        "bankProfileId": "0",
        "accountNumber": "xxxxxxxxxx"
    },
    "payee": {
        "name": "Instantpay India Ltd",
        "accountNumber": "xxxxxxxxxx",
        "bankIfsc": ""
    },
    "transferMode": "AMAZON",
    "transferAmount": "5.00",
    "externalRef": "WALLET1",
    "latitude": "20.1226",
    "longitude": "78.1228",
    "remarks": "Wallet Transfer",
    "alertEmail": "",
    "purpose": ""
}'
```

> Same shape with `"transferMode": "PAYTM"` for Paytm.

### Sample success response (LIVE)

> Trailing comma in provider JSON cleaned. Request `5.00` vs `txnValue` `1000` — illustrative mismatch (same as UPI sample reuse).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "externalRef": "IMPS1",
    "poolReferenceId": "1231214070644TLWAP",
    "txnValue": "1000",
    "txnReferenceId": "1323896541",
    "pool": {
      "account": "xxxxxxxxxx",
      "openingBal": "5.17",
      "mode": "DR",
      "amount": "3.46",
      "closingBal": "1.71"
    },
    "payer": {
      "account": "xxxxxxxxxx",
      "name": "Sample Name"
    },
    "payee": {
      "account": "xxxxxxxxxx",
      "name": "Instantpay India Ltd"
    }
  },
  "timestamp": "2021-11-12 16:56:50",
  "ipay_uuid": "h00695deb945-3def-42ba-8857-2ff7bac93fe6",
  "orderid": "1211112165649WFTYK",
  "environment": "LIVE"
}
```

### Important rules

Same as Bank / UPI: lat/long 4dp · unique `externalRef` · remarks max 20 alphabet · purpose case-sensitive · timeout → **Pending** + Transaction Status API.

### Gotchas

- Modes **`PAYTM` / `AMAZON`** only on this page — not IMPS/UPI (despite polluted intro).
- Payee account = **wallet mobile**, not bank a/c / VPA / encrypted CC.
- `bankProfileId` always **`0`** per table.
- Same OpenAPI `operationId` as polluted Bank Accounts stub (`payouts-wallet`) — distinguish by `transferMode`.
- Fee sample ~**3.46** (shared illustrative response with UPI/bank).

### Related

- UPI VPA (#12)
- Bank Accounts (#3)
- Payout Links paymentModes include `AMAZON` (#7)
- Transaction Status (pending paste)

---

## 14. Beneficiary (Axis) — Add Beneficiary

**Title (provider):** Add Beneficiary
**Nav:** Payout → Beneficiary (Axis bank)

Store recipient bank details for future Axis Connected Banking payouts. After OTP is received, **call this same API again** with `otpReference` + `otp` to verify (provider note).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/addBeneficiary` |
| **OpenAPI title** | `axis-add-beneficiary` v1.0 |
| **operationId** | `add-beneficiary` |
| **Sample Content-Type** | Docs show `text/plain` — prefer **`application/json`** when implementing |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer.bankProfileId` | String | Mandatory | Unique bank profile id (connected bank — **not** `"0"` wallet) |
| `payer.accountNumber` | String | Mandatory | Connected bank account number |
| `payee.firstName` | String | Mandatory | Beneficiary name |
| `payee.accountNumber` | String | Mandatory | End-user account number |
| `payee.ifsc` | String | Mandatory | IFSC (**`ifsc`**, not `bankIfsc`) |
| `beneficiaryType` | String | Mandatory | **`OTHERS`** or **`AXIS`** |
| `otpReference` | String | Mandatory | Empty on first call; fill when verifying OTP |
| `otp` | String | Mandatory | Empty on first call; fill when verifying OTP |

### Sample request (first call — request OTP)

> Masked accounts. HTTP sample had broken header `-Ipay-Auth-Code` — use full `X-Ipay-Auth-Code`.

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout/addBeneficiary' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "payer": {
        "bankProfileId": "4295906",
        "accountNumber": "xxxxxxxxxxxxxxx"
    },
    "payee": {
        "firstName": "aqqq",
        "accountNumber": "xxxxxxxxxxxx",
        "ifsc": "SBIN0000001"
    },
    "beneficiaryType": "OTHERS",
    "otpReference": "",
    "otp": ""
}'
```

### Response

Standard envelope (`statuscode`, `actcode`, `status`, `data`, `timestamp`, `ipay_uuid`, `orderid`, `environment`). **No success sample** in provider docs / OpenAPI (`{}`).

### Provider note

> When OTP is received for Adding Beneficiary, call this API again for OTP verification (pass `otpReference` + `otp`).

### Gotchas

- Axis Connected Banking only — not required for InstantPay wallet funding (`bankProfileId=0`) bank/UPI/wallet payouts.
- Two-step same endpoint: empty OTP → then verify with OTP fields.
- Field name **`payee.ifsc`** (≠ `bankIfsc` on initiate payout).
- `beneficiaryType`: `OTHERS` \| `AXIS`.
- Docs `Content-Type: text/plain` is likely wrong; OpenAPI has **no requestBody schema**.
- Fetch Beneficiary (#15) — list for `payeeListId`; Delete (#16) to remove.

### Related

- Bank Accounts (#3) — `payeeListId` + OTP on payout
- Fetch Beneficiary (#15)
- Delete Beneficiary (#16)
- Transaction Status (pending paste)

---

## 15. Beneficiary (Axis) — Fetch Beneficiary

**Title (provider):** Fetch Beneficiary
**Nav:** Payout → Beneficiary Bank (typo “Beneficity” in sidebar)

List existing beneficiaries for a connected bank profile (Axis Connected Banking). Use returned ids as `payeeListId` on Bank Accounts payout (#3).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/fetchBeneficiary` |
| **OpenAPI title** | `axis-fetch-beneficiary` v1.0 |
| **operationId** | `add-beneficiary-copy` (**copy-paste pollution** from Add) |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `payer.bankProfileId` | String | Mandatory | Unique bank profile id |
| `payer.accountNumber` | String | Mandatory | Connected bank account number |
| `beneficiaryType` | String | Mandatory | **`OTHERS`** or **`AXIS`** |

### Sample request

> Masked account. HTTP sample had broken header `-Ipay-Auth-Code` — use `X-Ipay-Auth-Code`.

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout/fetchBeneficiary' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "payer": {
        "bankProfileId": "4295906",
        "accountNumber": "xxxxxxxxxxxxxxx"
    },
    "beneficiaryType": "OTHERS"
}'
```

### Response

Standard envelope + `internalCode` (null). **`data`** = beneficiary list when present. **No sample payload** in docs / OpenAPI (`{}`).

### Gotchas

- No OTP on fetch — only payer + `beneficiaryType`.
- OpenAPI `operationId` wrongly `add-beneficiary-copy`.
- No requestBody schema in OpenAPI — trust param table + curl.
- Exact shape of list items (whether id field is `payeeListId`) not documented — confirm against live response before wiring.

### Related

- Add Beneficiary (#14)
- Delete Beneficiary (#16)
- Bank Accounts (#3)
- Transaction Status (pending paste)

---

## 16. Beneficiary (Axis) — Delete Beneficiary

**Title (provider):** Delete Beneficiary
**Nav:** Payout → Beneficiary Bank

Remove a stored beneficiary. Same two-step OTP pattern as Add: empty OTP first → call again with `otpReference` + `otp` when OTP arrives.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/payments/payout/deleteBeneficiary` |
| **OpenAPI title** | `axis-add-beneficiary` (**wrong** — copy of Add) |
| **operationId** | `delete-beneficiary-copy` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | **N** | End-customer IP |

### Request body

| Parameter | Type | Requirement | Description (corrected) |
|-----------|------|-------------|-------------------------|
| `payer.bankProfileId` | String | Mandatory | Connected bank profile id |
| `payer.accountNumber` | String | Mandatory | Connected bank account |
| `payee.beneficiaryId` | String | Mandatory | Beneficiary id (docs table wrongly says “Account Holder Name”; sample often `""`) |
| `payee.payeeListId` | String/Number | Mandatory | Payee list id from Fetch (docs wrongly say “IFS Code”; sample is numeric `317512375`) |
| `payee.accountNumber` | String | Mandatory | End-user account number |
| `beneficiaryType` | String | Mandatory | e.g. `OTHERS` / `AXIS` (table only says “beneficiary Type”) |
| `otpReference` | String | Mandatory | Empty first; fill on OTP verify |
| `otp` | String | Mandatory | Empty first; fill on OTP verify |

### Sample request (first call)

> Masked accounts. Prefer string `payeeListId` if API is inconsistent; sample uses unquoted number.

```bash
curl --location --request POST 'https://api.instantpay.in/payments/payout/deleteBeneficiary' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
    "payer": {
        "bankProfileId": "19993295906",
        "accountNumber": "xxxxxxxxxxxxxxx"
    },
    "payee": {
        "beneficiaryId": "",
        "payeeListId": 317512375,
        "accountNumber": "xxxxxxxxxx"
    },
    "beneficiaryType": "OTHERS",
    "otpReference": "",
    "otp": ""
}'
```

### Response

Standard envelope + `internalCode`. **No success sample** (`{}` in OpenAPI).

### Provider note

> When OTP is received for Deleting Beneficiary, call this API again for OTP verification.

### Gotchas

- Param table descriptions are **swapped/wrong** (`beneficiaryId` ≠ name, `payeeListId` ≠ IFSC) — trust field **names** + curl.
- Two-step OTP same as Add (#14).
- OpenAPI title recycled from Add; HTTP sample typo `OST` / `-Ipay-Auth-Code`.
- Get `payeeListId` from Fetch (#15) before delete.

### Related

- Add Beneficiary (#14)
- Fetch Beneficiary (#15)
- Bank Accounts (#3)
- Transaction Status (pending paste)
