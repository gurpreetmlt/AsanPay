---
title: "Send OTP (eKYC) API Reference"
description: "Initiate AePS Fingpay eKYC by sending an OTP to the agent's registered Aadhaar-linked mobile number."
canonical: "https://eps.eko.in/docs/aeps-fingpay-send-otp-kyc"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-send-otp-kyc

# Send OTP (eKYC) API Reference

`POST https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/otp`

Initiate AePS Fingpay eKYC by sending an OTP to the agent's registered Aadhaar-linked mobile number.

First-time KYC follows three steps in order: `Send OTP` → `Verify OTP` → `Biometric`. On subsequent days, use the Daily KYC (biometric-only) endpoint.

This is the first step in the one-time AePS Fingpay eKYC flow. The OTP is delivered to the number passed in `customer_id`. The eKYC flow — Send OTP → Verify OTP → Biometric — must be completed once per agent before they can perform any AePS transactions. This step is a prerequisite; do not confuse it with the Daily KYC which is required on each calendar day.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user (see Platform Credentials). e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). e.g. 2026010100123456789 |
| user_code | string | yes | Agent/retailer code from Onboard User. e.g. 20810200 |
| aadhar | string | yes | RSA-encrypted, Base64-encoded Aadhaar of the agent. e.g. BASE64_ENCRYPTED_AADHAAR |
| customer_id | string | yes | Agent mobile — OTP is delivered here. e.g. 9123456789 |
| latlong | string | yes | GPS `latitude,longitude`. e.g. 28.6139,77.2090 |

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
| data.reference_tid | string | eKYC session id — pass to Verify OTP |
| data.otp_ref_id | string | OTP session id — pass to Verify OTP |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1600 | OTP request has been sent | Verify OTP (eKYC) |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "20810200",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "customer_id": "9123456789",
  "latlong": "28.6139,77.2090"
}
```

## Example response

`response_type_id` `1600` — OTP request has been sent.

```json
{
  "response_status_id": 0,
  "data": {
    "reference_tid": "EKYKF4719702240123152147525I",
    "otp_ref_id": "2465238"
  },
  "response_type_id": 1600,
  "message": "OTP request has been sent",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 346 | AePS Fingpay service not activated for this agent |
| 200 | -1 | Incorrectly encrypted Aadhaar |

## AsanPay notes

- Prerequisite: [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md) must succeed first (`response_type_id` 346 if not).
- `aadhar` here is **RSA+Base64** (same as Daily KYC) — **not** plain 12-digit like Activate.
- Store `reference_tid` + `otp_ref_id` for Verify OTP; still need RSA encrypt guide + Verify OTP + Biometric pages.
- Flow: Send OTP → Verify OTP → Biometric (once); then [`AEPS_DAILY_KYC.md`](AEPS_DAILY_KYC.md) each day.
