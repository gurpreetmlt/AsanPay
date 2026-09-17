---
title: "Verify OTP (eKYC) API Reference"
description: "Verify the eKYC OTP sent to the agent's Aadhaar-linked mobile number to advance the one-time AePS Fingpay eKYC."
canonical: "https://eps.eko.in/docs/aeps-fingpay-verify-otp-kyc"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-verify-otp-kyc

# Verify OTP (eKYC) API Reference

`PUT https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/otp/verify`

Verify the eKYC OTP sent to the agent's Aadhaar-linked mobile number to advance the one-time AePS Fingpay eKYC.

The second step of the one-time AePS Fingpay eKYC flow (Send OTP → Verify OTP → Biometric). Submits the OTP the agent received, together with the `otp_ref_id` and `reference_tid` returned by the Send OTP API, to validate the agent's identity before biometric capture. Aadhaar must be RSA-encrypted and Base64-encoded.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code from Onboard User. e.g. 20810200 |
| customer_id | string | yes | Agent mobile. e.g. 9123456789 |
| aadhar | string | yes | RSA-encrypted, Base64-encoded Aadhaar. |
| otp | string | yes | OTP from Aadhaar-registered mobile. e.g. 123456 |
| otp_ref_id | string | yes | From Send OTP response. e.g. 2465238 |
| reference_tid | string | yes | From Send OTP response. e.g. EKYKF4719702240123152147525I |
| latlong | string | yes | GPS `latitude,longitude`. |

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
| data.reference_tid | string | Carry forward to Biometric eKYC (may be refreshed) |
| data.otp_ref_id | string | Carry forward to Biometric eKYC (may be refreshed) |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1604 | Validation successful | Biometric eKYC |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "20810200",
  "customer_id": "9123456789",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "otp": "123456",
  "otp_ref_id": "2465238",
  "reference_tid": "EKYKF4719702240123152147525I",
  "latlong": "28.6139,77.2090"
}
```

## Example response

`response_type_id` `1604` — Validation successful.

```json
{
  "response_status_id": 0,
  "data": {
    "reference_tid": "BEKYF4719702240123152147525I",
    "otp_ref_id": "815031"
  },
  "response_type_id": 1604,
  "message": "Validation successful",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 461 | Invalid or expired OTP |

## AsanPay notes

- Prerequisite: [`AEPS_EKYC_SEND_OTP.md`](AEPS_EKYC_SEND_OTP.md) (`response_type_id` 1600).
- **Use the Verify response** `reference_tid` / `otp_ref_id` for Biometric — sample shows they can change (`EKYKF…` → `BEKYF…`, new `otp_ref_id`).
- Same RSA Aadhaar blob as Send OTP / Daily KYC.
- Next page needed: Biometric eKYC.
