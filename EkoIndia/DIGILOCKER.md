# Eko — DigiLocker Integration

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## DigiLocker Integration

### Create DigiLocker URL

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/digilocker`
- **Description:** Generate a DigiLocker redirect URL to initiate consent-based Aadhaar document retrieval.

### Get DigiLocker Document

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/digilocker/document`
- **Description:** Retrieve verified Aadhaar details from DigiLocker after the customer completes the consent journey.

### DigiLocker Verification Status

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/digilocker/status?initiator_id=9962981729&client_ref_id=2026010100123456789&reference_id=12345`
- **Description:** Check whether a user has completed the DigiLocker consent and verification flow.

---

More official response samples / error codes: drop into `Incoming/` when available.
