---
title: "Cash Withdrawal OTP API Reference"
description: "Generate the transaction OTP required before an AePS cash withdrawal above ₹5,000."
canonical: "https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal-otp"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal-otp

# Cash Withdrawal OTP API Reference

`POST https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/cash-withdrawal/otp/{customer_id}`

Generate the transaction OTP required before an AePS cash withdrawal above ₹5,000.

Fingpay requires a fresh, transaction-scoped OTP for every cash withdrawal above **₹5,000**. Call this before Cash Withdrawal only when `amount` is greater than ₹5,000 — for ₹5,000 or less, skip it and call Cash Withdrawal directly.

On success the customer receives a 6-digit OTP by SMS on their Aadhaar-linked mobile, and the response returns `data.fp_transaction_id`. Send that id to Cash Withdrawal as `txn_otp_request_id`, and put the SMS OTP in the `otp` attribute of the PidOptions used to capture the customer's fingerprint. They are two different values, and Cash Withdrawal needs both. The id belongs to this one withdrawal attempt: generate a new one for every attempt and never reuse it.

No biometric capture happens in this call — it takes no `piddata`.

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
| bank_code | string | no | Customer bank short code (e.g. HDFC). Recommended — same as withdrawal. |
| aadhar | string | yes | RSA-encrypted Base64 Aadhaar (same value as Cash Withdrawal). Encrypt 12-digit Aadhaar with Eko RSA public key using **PKCS#1 v1.5** (`Cipher.getInstance("RSA")`), then Base64. |
| latlong | string | yes | Agent GPS `latitude,longitude`. |
| amount | number | yes | Withdrawal amount (integer INR). Only call this API when **> 5000**. e.g. 6000 |

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
| data | object | Payload |
| data.fp_transaction_id | string | OTP **reference** for this attempt → Cash Withdrawal as `txn_otp_request_id`. **Not** the SMS OTP. |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1459 | OTP generated and SMS sent — use `fp_transaction_id` as `txn_otp_request_id` | Cash Withdrawal |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "10000001",
  "bank_code": "HDFC",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "latlong": "28.6139,77.2090",
  "amount": 6000
}
```

## Example response

`response_type_id` `1459`

```json
{
  "response_status_id": 0,
  "data": {
    "fp_transaction_id": "FP2609010001234567"
  },
  "response_type_id": 1459,
  "message": "OTP generated successfully. Use the reference ID for your transaction.",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | — | OTP generation failed — generic; `message` has gateway reason |

## AsanPay notes

### Wire rules

| Amount | Flow |
|--------|------|
| ≤ ₹5000 | Skip this API → Cash Withdrawal directly |
| > ₹5000 | This OTP API → then Cash Withdrawal with both ids |

### Two different OTP values (do not mix)

1. `fp_transaction_id` → body field `txn_otp_request_id` on Cash Withdrawal
2. SMS 6-digit OTP → `otp` inside **PidOptions** when capturing customer fingerprint

- One `fp_transaction_id` per attempt — never reuse.
- No `piddata` on this call.
- First clear RSA hint in AePS docs: **PKCS#1 v1.5** + Eko public key (key material still needed from RDService / credentials page).
