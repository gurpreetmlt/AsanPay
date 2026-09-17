---
title: "AePS Cash Withdrawal API Reference"
description: "Withdraw cash from any Aadhaar-linked bank account using biometric fingerprint authentication — no card or PIN required."
canonical: "https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal

# AePS Cash Withdrawal API Reference

`POST https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/cash-withdrawl/{customer_id}`

> **Note:** Official path uses spelling `cash-withdrawl` (missing second `a`).

Withdraw cash from any Aadhaar-linked bank account using biometric fingerprint authentication — no card or PIN required.

Allows a customer to withdraw cash from their bank account at an agent/BC point by providing their Aadhaar number and a live fingerprint scan. The agent's biometric device captures a PID XML blob which is passed verbatim to this API. The customer's Aadhaar is RSA-encrypted before transmission. Requires the agent to have completed AePS Fingpay activation, the one-time eKYC (Send OTP → Verify OTP → Biometric), and the Daily KYC for the current day.

**Above ₹5,000 a transaction OTP is required.** First call Cash Withdrawal OTP, then send its `fp_transaction_id` here as `txn_otp_request_id`, and put the customer's 6-digit SMS OTP in the `otp` attribute of the PidOptions used for the fingerprint capture. For ₹5,000 or less, no OTP step is needed.

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
| piddata | string | yes | Raw PID XML from UIDAI-certified device. `Data type='X'` (XML, not Protobuf). `DeviceInfo` must include `mc`. `fType` must be `2`. For amount > ₹5000, set PidOptions `<Opts otp="...">` to the **SMS OTP** (not `fp_transaction_id`) before capture. |
| amount | number | yes | Withdrawal amount (integer INR). Must be > 0. Above ₹5000 → OTP step first + `txn_otp_request_id`. |
| txn_otp_request_id | string | no | Required when amount > ₹5000: `fp_transaction_id` from Cash Withdrawal OTP. Omit for ≤ ₹5000. |

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
| data.tid | string | Eko internal transaction ID (recon / support) |
| data.amount | string | Withdrawal amount (INR) |
| data.bank | string | Customer bank name |
| data.bank_ref_num | string | Bank/NPCI RRN (empty on failure) |
| data.balance | string | Remaining balance if bank returned it |
| data.customer_balance | string | Customer balance from bank (may be empty) |
| data.tds | string | TDS on agent commission |
| data.commission | string | Agent commission |
| data.fee / service_tax / totalfee | string | Fee components (may be empty) |
| data.shop | string | Agent shop name |
| data.shop_address_line1 | string | Shop address |
| data.sender_name | string | Agent/sender name |
| data.merchantname / merchant_code | string | Merchant details |
| data.user_code | string | Echo of request `user_code` |
| data.aadhar | string | Masked Aadhaar |
| data.auth_code / stan / terminal_id | string | Bank/switch ids (may be empty) |
| data.tx_status | string | 0=Success, 1=Fail, 2=Pending |
| data.transaction_date / transaction_time | string | DD-MM-YY HH:MM:SS |
| data.reason | string | Failure reason (empty on success) |
| data.comment | string | Provider remark |
| data.fp_transaction_id | string | Only with `response_type_id` 1459 (OTP required): use as `txn_otp_request_id` on retry |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1463 | Transaction Successful | — |
| 1464 | Transaction Fail — above ₹5k also covers expired/invalid/used OTP (no separate code). Fresh OTP + re-capture before retry | — |
| 1465 | Transaction Pending | Transaction inquiry |
| 1459 | OTP required — amount > ₹5k but no `txn_otp_request_id`. Nothing withdrawn; OTP sent. Retry with `data.fp_transaction_id` + SMS OTP in PidOptions — **do not** generate another OTP | — |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "10000001",
  "bank_code": "HDFC",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "latlong": "28.6139,77.2090",
  "piddata": "<?xml version='1.0'?><PidData><Data type='X'>...</Data><DeviceInfo mc='...' /></PidData>",
  "amount": 1000
}
```

## Example response

`response_type_id` `1463` — Transaction Successful.

```json
{
  "response_status_id": 0,
  "data": {
    "tx_status": "0",
    "tds": "0.00",
    "shop": "Test User",
    "sender_name": "Test User",
    "tid": "0000000000",
    "bank": "Example Bank",
    "balance": "0.00",
    "user_code": "10000001",
    "merchantname": "Test User",
    "aadhar": "XXXX XXXX 0000",
    "customer_balance": "0.00",
    "transaction_time": "01-01-24 00:00:00",
    "commission": "0.00",
    "bank_ref_num": "0000000000",
    "transaction_date": "01-01-24 00:00:00",
    "amount": "1000.00",
    "comment": "Request Completed"
  },
  "response_type_id": 1463,
  "message": "Transaction Successful",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1464 | Fail — incorrect merchant credentials / invalid bank_code / bad OTP (>₹5k) |
| 200 | 1459 | OTP required — amount > ₹5k without `txn_otp_request_id`; nothing withdrawn |
| 200 | 1465 | Pending — awaiting bank confirmation |

## AsanPay notes

### Prerequisites

1. AePS Fingpay activation
2. One-time eKYC (Send → Verify → Biometric)
3. Daily KYC for current calendar day

### Amount / OTP

| Amount | Flow |
|--------|------|
| ≤ ₹5000 | Direct Cash Withdrawal (no `txn_otp_request_id`) |
| > ₹5000 | CW OTP first → then this API with `txn_otp_request_id` + SMS OTP in PidOptions |

### piddata rules

- Raw XML string, `Data type='X'` (not Protobuf)
- `DeviceInfo` must include `mc`
- `fType` must be `2`
- > ₹5000: PidOptions `otp` = customer SMS OTP (not `fp_transaction_id`)

### Path spelling

Keep `cash-withdrawl` as in official docs (typo in path).
