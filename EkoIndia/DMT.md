# Eko — Domestic Money Transfer (DMT-Fino)

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## Domestic Money Transfer (DMT)

### Get Sender Profile

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}?initiator_id=9962981729&client_ref_id=2026010100123456789&user_code=20810200`
- **Description:** Fetch the DMT-Fino profile of a registered sender by mobile number.

### Onboard Sender

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}`
- **Description:** Register a new customer as a DMT-Fino sender using basic KYC details.

### Sender eKYC (Biometric)

- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}/otp`
- **Description:** Initiate biometric Aadhaar eKYC to verify and upgrade a DMT sender's account.

### Validate eKYC OTP

- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}/otp/verify`
- **Description:** Confirm sender eKYC by verifying the OTP sent to the Aadhaar-linked mobile.

### Get Recipients

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}/recipients?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of saved beneficiaries for a DMT sender.

### Add Recipient

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/sender/{customer_id}/recipient`
- **Description:** Register a new beneficiary under a sender's DMT-Fino account.

### Send Transaction OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino/otp`
- **Description:** Request an OTP to the sender's mobile number to authorise an upcoming money transfer.

### Initiate Transfer

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/dmt-fino`
- **Description:** Execute a DMT-Fino money transfer after OTP verification.

---

More official response samples / error codes: drop into `Incoming/` when available.
