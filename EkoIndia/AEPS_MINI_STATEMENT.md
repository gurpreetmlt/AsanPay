---
title: "AePS Mini Statement API Reference"
description: "Retrieve the last few transactions from an Aadhaar-linked bank account via biometric authentication."
canonical: "https://eps.eko.in/docs/aeps-fingpay-mini-statement"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-mini-statement

# AePS Mini Statement API Reference

`POST https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/mini-statement/{customer_id}`

Retrieve the last few transactions from an Aadhaar-linked bank account via biometric authentication.

Fetches a mini statement (typically the last 5–10 transactions) from a customer's bank account by authenticating through Aadhaar biometrics. Uses the dedicated `mini-statement` endpoint — the request shape matches Balance Enquiry (no `amount`). No money movement occurs. The response includes a list of recent debit/credit transactions with amounts and dates. Useful for customers who want to verify recent activity at an agent point without visiting a branch.

To capture the `piddata` PID block with an RDService-compliant fingerprint scanner, see the [Aadhaar Biometric Authentication guide](https://eps.eko.in/docs/aadhaar-biometric-rdservice).

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Path parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| customer_id | string | yes | Customer's registered mobile number. e.g. 9000000000 |

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code. e.g. 10000001 |
| bank_code | string | yes | Customer bank short code (e.g. HDFC). From bank list API. |
| aadhar | string | yes | RSA-encrypted Base64 Aadhaar. PKCS#1 v1.5 + Eko public key, then Base64. |
| latlong | string | yes | Agent GPS `latitude,longitude`. |
| piddata | string | yes | PID XML from UIDAI device (`fType=2`, `Data type='X'`, `mc` in DeviceInfo). |

## Headers

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| developer_key | string | yes | Static API key. |
| secret-key | string | yes | base64(HMAC-SHA256(timestamp, base64(access_key))). |
| secret-key-timestamp | string | yes | Unix ms timestamp. |
| content-type | string | yes | application/json |

## Response

| Field | Type | Description |
| --- | --- | --- |
| status | number | 0 = success |
| message | string | Human-readable message |
| response_status_id | number | Granular status id |
| response_type_id | number | Response shape id |
| tx_status | string | 0=Success, 1=Fail, 2=Awaited, 3=Refund Pending, 4=Refunded, 5=On Hold |
| txstatus_desc | string | Human-readable txn status |
| data | object | Payload |
| data.tid | string | Eko internal transaction ID for this enquiry |
| data.mini_statement_list | array | Recent transactions (date, amount, Dr/Cr, narration) |
| data.mini_statement_list[].date | string | Transaction date (DD/MM) |
| data.mini_statement_list[].amount | string | Amount (INR) |
| data.mini_statement_list[].narration | string | Bank narration |
| data.mini_statement_list[].txnType | string | `'Cr'` credit / `'Dr'` debit |
| data.sender_name | string | Agent/sender name |
| data.merchantname / merchant_code | string | Merchant details |
| data.user_code | string | Echo of request `user_code` |
| data.customer_balance | string | Account balance if bank returned it (may be empty) |
| data.commission / service_tax / totalfee | string | Fee / commission components |
| data.terminal_id | string | Terminal id (may be empty) |
| data.bank_ref_num | string | NPCI/bank ref for this fetch (may be empty) |
| data.transaction_date / transaction_time | string | DD-MM-YY HH:MM:SS |
| data.reason | string | Failure reason (empty on success) |
| data.comment | string | Provider remark |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1527 | Transaction Successful | — |
| 1528 | Transaction Fail | — |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "10000001",
  "bank_code": "HDFC",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "latlong": "28.6139,77.2090",
  "piddata": "<?xml version='1.0'?><PidData><Data type='X'>...</Data><DeviceInfo mc='...' /></PidData>"
}
```

## Example response

`response_type_id` `1527` — Transaction Successful.

```json
{
  "response_status_id": 0,
  "data": {
    "transaction_date": "01-01-24 00:00:00",
    "mini_statement_list": [
      {
        "date": "01/01",
        "amount": "0.00",
        "narration": "MAT/W/000000",
        "txnType": "Dr"
      },
      {
        "date": "31/12",
        "amount": "0.00",
        "narration": "MAT/D/000000",
        "txnType": "Cr"
      },
      {
        "date": "28/12",
        "amount": "0.00",
        "narration": "POS/W/000000",
        "txnType": "Dr"
      }
    ],
    "sender_name": "Test User",
    "tid": "0000000000",
    "user_code": "10000001",
    "merchantname": "Test User",
    "customer_balance": "0.00",
    "transaction_time": "01-01-24 00:00:00",
    "commission": "0.00",
    "terminal_id": "",
    "comment": "Request Completed"
  },
  "response_type_id": 1527,
  "message": "Transaction Successful",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1528 | Transaction Fail — e.g. incorrect merchant credentials |

## AsanPay notes

### vs Balance Enquiry

- Same request body (no `amount`)
- Key output: `data.mini_statement_list[]` (`date`, `amount`, `narration`, `txnType`)
- Success **1527** / Fail **1528** (BE uses 1466 / 1464)
- May also return `customer_balance`
