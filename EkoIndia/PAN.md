# Eko — PAN Verification

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## PAN Verification

### Fetch PAN Details

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/fetch-pan`
- **Description:** Fetch the PAN holder's registered full name and category from the PAN number alone.

### PAN Lite

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/pan-lite`
- **Description:** Instant PAN validation with name and DOB match scores plus Aadhaar seeding status.

### PAN Advanced

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/pan-advanced`
- **Description:** Rich PAN verification returning registered name, PAN type, gender, DOB, masked Aadhaar, address, email, and mobile.

### Bulk PAN Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/pan/bulk`
- **Description:** Async batch PAN verification — submit multiple PANs in one call and poll for results via the Bulk PAN Status API.

### Check Bulk PAN Verification Status

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/pan/bulk/status?initiator_id=9962981729&client_ref_id=2026010100123456789&reference_id=123456&bulk_reference_id=BULK-PAN-20240101-001`
- **Description:** Poll the result of a Bulk PAN Verification batch using the reference_id returned when the batch was submitted.

---

More official response samples / error codes: drop into `Incoming/` when available.
