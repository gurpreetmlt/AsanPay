---
title: "AePS Balance Enquiry API Reference"
description: "Check a customer's bank account balance using Aadhaar number and biometric fingerprint — no card or PIN required."
canonical: "https://eps.eko.in/docs/aeps-fingpay-balance-enquiry"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-balance-enquiry

# AePS Balance Enquiry API Reference

`POST https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/balance-enquiry/{customer_id}`

Check a customer's bank account balance using Aadhaar number and biometric fingerprint — no card or PIN required.

Retrieves the real-time account balance from any Aadhaar-linked bank. Uses the dedicated `balance-enquiry` endpoint — the request shape matches Cash Withdrawal **without** the `amount` field. No money movement occurs and no debit takes place. The agent must have completed AePS Fingpay activation and the current-day daily authentication before calling this API.

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
| data.amount | string | Echo amount — `'0.0'` / `'0.00'` for balance enquiry |
| data.customer_balance | string | **Key output** — customer bank balance (INR) |
| data.shop / shop_address_line1 | string | Agent shop |
| data.sender_name | string | Agent/sender name |
| data.merchantname / merchant_code | string | Merchant details |
| data.user_code | string | Echo of request `user_code` |
| data.aadhar | string | Masked Aadhaar |
| data.auth_code / stan / terminal_id | string | Bank/switch ids (may be empty) |
| data.fee / service_tax / totalfee | string | Fee components (may be empty) |
| data.transaction_date / transaction_time | string | DD-MM-YY HH:MM:SS |
| data.reason | string | Failure reason (empty on success) |
| data.comment | string | Provider remark |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1466 | Transaction Successful | — |
| 1464 | Transaction Fail | — |

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

`response_type_id` `1466` — Transaction Successful.

```json
{
  "response_status_id": 0,
  "data": {
    "transaction_date": "01-01-24 00:00:00",
    "amount": "0.00",
    "shop": "Test User",
    "sender_name": "Test User",
    "tid": "0000000000",
    "user_code": "10000001",
    "merchantname": "Test User",
    "aadhar": "XXXX XXXX 0000",
    "customer_balance": "0.00",
    "transaction_time": "01-01-24 00:00:00",
    "comment": "Request Completed"
  },
  "response_type_id": 1466,
  "message": "Transaction Successful",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1464 | Transaction Fail — e.g. incorrect merchant credentials |

## AsanPay notes

### Prerequisites

- AePS Fingpay activation
- Current-day Daily KYC

### vs Cash Withdrawal

- Same body shape **minus** `amount` / `txn_otp_request_id`
- No debit — key field is `data.customer_balance`
- Success code: **1466** (CW success is 1463)
- Fail still uses **1464**
