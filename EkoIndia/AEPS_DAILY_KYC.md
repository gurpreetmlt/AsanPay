---
title: "Daily KYC API Reference"
description: "Perform the mandatory daily biometric re-verification that authorises an agent to carry out AePS transactions for the current calendar day."
canonical: "https://eps.eko.in/docs/aeps-fingpay-daily-auth"
source: "Owner paste — 2026-09-17 (reconfirmed)"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-daily-auth

# Daily KYC API Reference

`PUT https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/biometric/daily`

Perform the mandatory daily biometric re-verification that authorises an agent to carry out AePS transactions for the current calendar day.

Biometric-only re-verification for the days after the one-time eKYC — no OTP step is required. AePS Fingpay requires every agent to re-authenticate themselves biometrically at the start of each working day, before their first transaction of the day.

If this fails with reason `Please complete bank eKYC to process the transaction.`, re-run the full first-time eKYC sequence — Send OTP → Verify OTP → Biometric — before retrying.

To capture the `piddata` PID block with an RDService-compliant fingerprint scanner, see the [Aadhaar Biometric Authentication guide](https://eps.eko.in/docs/aadhaar-biometric-rdservice).

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code from Onboard User. e.g. 20810200 |
| aadhar | string | yes | RSA-encrypted, Base64-encoded Aadhaar of the agent. |
| customer_id | string | yes | Agent mobile. e.g. 9123456789 |
| latlong | string | yes | GPS `latitude,longitude`. |
| piddata | string | yes | Agent's own fingerprint PID XML (fType=2, Data type='X'). For custom PID: **`wadh` must be blank/empty**. |
| bank_code | string | yes | Eko bank code (Get List of Banks). e.g. HDFC |

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
| data.user_code | string | Agent whose daily KYC is complete for today |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1713 | Daily KYC successful — agent may transact today | — |
| 1714 | Daily KYC failed — if `data.reason` is bank eKYC pending, re-run full eKYC from Send OTP | [`AEPS_EKYC_SEND_OTP.md`](AEPS_EKYC_SEND_OTP.md) |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "20810200",
  "aadhar": "BASE64_ENCRYPTED_AADHAAR",
  "customer_id": "9123456789",
  "latlong": "28.6139,77.2090",
  "piddata": "<?xml version='1.0'?><PidData><Data type='X'>...</Data><DeviceInfo mc='...' /></PidData>",
  "bank_code": "HDFC"
}
```

## Example response

`response_type_id` `1713` — Daily KYC successful.

```json
{
  "response_status_id": 0,
  "data": {
    "user_code": "20810200"
  },
  "response_type_id": 1713,
  "message": "KYC sucess",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1714 | KYC failed — no reason returned |
| 200 | 1714 | Invalid biometric — check `wadh` in PID (must be **empty** for Daily KYC) |
| 200 | 1714 | Bank eKYC pending — re-run Send OTP → Verify OTP → Biometric first |

## AsanPay notes

Already indexed in [`AEPS_INDEX.md`](AEPS_INDEX.md). Contrast with first-time bio: [`AEPS_EKYC_BIOMETRIC.md`](AEPS_EKYC_BIOMETRIC.md) needs non-empty `wadh`; Daily KYC needs **empty `wadh`**.
