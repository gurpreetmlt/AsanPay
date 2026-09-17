---
title: "Biometric eKYC API Reference"
description: "Complete one-time AePS Fingpay eKYC by submitting the agent's Aadhaar and live biometric fingerprint capture."
canonical: "https://eps.eko.in/docs/aeps-fingpay-biometric-ekyc"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-biometric-ekyc

# Biometric eKYC API Reference

`PUT https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/biometric`

Complete one-time AePS Fingpay eKYC by submitting the agent's Aadhaar and live biometric fingerprint capture.

The final step in the one-time AePS Fingpay eKYC flow, called after OTP verification. Submits the agent's RSA-encrypted Aadhaar and live biometric PID to UIDAI; on success the agent is eligible for AePS transactions.

If you generate the PID block with your own code rather than the RD service default, set `wadh=E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=` alongside `fCount`, `fType` and the other attributes.

To capture the `piddata` PID block with an RDService-compliant fingerprint scanner, see the [Aadhaar Biometric Authentication guide](https://eps.eko.in/docs/aadhaar-biometric-rdservice).

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code from Onboard User. e.g. 20810200 |
| aadhar | string | yes | RSA-encrypted, Base64-encoded Aadhaar. |
| customer_id | string | yes | Agent mobile. e.g. 9123456789 |
| latlong | string | yes | GPS `latitude,longitude`. |
| piddata | string | yes | PID XML from UIDAI-certified device (fType=2, Data type='X', mc in DeviceInfo). |
| bank_code | string | yes | Eko bank code (Get List of Banks). e.g. HDFC |
| otp_ref_id | string | yes | From **Verify OTP** response (prefer Verify over Send if refreshed). |
| reference_tid | string | yes | From **Verify OTP** response. |

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
| data.user_code | string | Agent whose eKYC is now complete |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1605 | eKYC successful — agent may now complete Daily KYC | [`AEPS_DAILY_KYC.md`](AEPS_DAILY_KYC.md) |

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
  "bank_code": "HDFC",
  "otp_ref_id": "2465238",
  "reference_tid": "EKYKF4719702240123152147525I"
}
```

## Example response

`response_type_id` `1605` — eKYC successful — agent may now complete Daily KYC.

```json
{
  "response_status_id": 0,
  "data": {
    "user_code": "20810200"
  },
  "response_type_id": 1605,
  "message": "Congratulations! eKYC successful",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 461 | OTP steps skipped — Send OTP and Verify OTP must both succeed first |

## AsanPay notes

### Present

- Final one-time eKYC step after [`AEPS_EKYC_VERIFY_OTP.md`](AEPS_EKYC_VERIFY_OTP.md)
- Required `piddata`, RSA Aadhaar, `bank_code`, session ids
- Success → Daily KYC before transacting
- Custom PID: fixed `wadh=E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=`

### Critical contrast vs Daily KYC

| | First-time Biometric eKYC | Daily KYC |
|--|---------------------------|-----------|
| `wadh` | Non-empty (value above if custom PID) | **Must be blank/empty** |
| OTP refs | Required (`otp_ref_id`, `reference_tid`) | Not used |
| Endpoint | `/kyc/biometric` | `/kyc/biometric/daily` |

### Still needed

- RDService / PidData capture guide
- RSA encrypt public key steps
- Get List of Banks (`bank_code`)
