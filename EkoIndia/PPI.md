# Eko — PPI Wallet (Levin + DigiKhata)

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## PPI Wallet

### Validate Aadhaar

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/aadhaar/otp`
- **Description:** Submit sender's Aadhaar number for OTP-based validation in the PPI Levin wallet onboarding flow.

### Validate Aadhaar OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/aadhaar/otp/verify`
- **Description:** Verify the Aadhaar OTP to complete identity validation in the PPI Levin wallet onboarding flow.

### Get Sender Information

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Fetch a PPI Levin sender's wallet profile and onboarding/OTP state by mobile number.

### Onboard Sender

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}`
- **Description:** Register a new customer as a PPI Levin wallet sender using basic KYC details.

### Verify Sender OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/otp/verify`
- **Description:** Verify the sender OTP to authenticate the PPI Levin wallet and return the sender's profile and balance.

### Validate PAN

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/pan`
- **Description:** Validate the sender's PAN to complete PPI Levin KYC and return the updated wallet profile.

### Get List of Recipients

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/recipients?initiator_id=9962981729&client_ref_id=2026010100123456789&wallet_token=`
- **Description:** Retrieve the list of saved beneficiaries for a PPI Levin sender.

### Add Recipient

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/recipient`
- **Description:** Register a new beneficiary under a PPI Levin sender's account.

### Add Recipient Bank

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/sender/{customer_id}/bank/recipient`
- **Description:** Register a bank beneficiary for an existing PPI Levin recipient.

### Send Transaction OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin/otp`
- **Description:** Request an OTP to the sender's mobile to authorise a PPI Levin transfer.

### Initiate Transaction

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-levin`
- **Description:** Execute a PPI Levin wallet transfer to a recipient after OTP verification.

### Get Sender Information

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Fetch a DigiKhata wallet sender's profile and onboarding/OTP state by mobile number.

### Onboard Sender

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}`
- **Description:** Register a new customer as a PPI DigiKhata wallet sender using basic KYC details.

### Generate Sender Verification OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/otp`
- **Description:** Send a verification OTP to a DigiKhata sender's registered mobile number.

### Verify Sender OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/otp/verify`
- **Description:** Verify the sender OTP to authenticate the DigiKhata wallet and return the sender's profile and balance.

### Get Aadhaar KYC Consent Languages

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/consent/languages?initiator_id=9962981729&org_id=1&client_ref_id=ref_20250121_001`
- **Description:** List the languages available for the DigiKhata Aadhaar eKYC consent.

### Get Aadhaar KYC Consent Details

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/consent/details?initiator_id=9962981729&org_id=1&client_ref_id=ref_20250121_001&consent_language=1`
- **Description:** Fetch the DigiKhata Aadhaar eKYC consent text and audio for a chosen language.

### Generate Sender Aadhaar OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/otp`
- **Description:** Validate a DigiKhata sender's Aadhaar number and trigger an OTP to the linked mobile.

### Validate Sender Aadhaar OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/otp/verify`
- **Description:** Verify the Aadhaar OTP to complete DigiKhata sender Aadhaar eKYC.

### Validate Sender PAN

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/pan`
- **Description:** Validate the sender's PAN to complete DigiKhata KYC and return the updated wallet profile.

### Load Sender DigiKhata Wallet

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/wallet/loadwallet`
- **Description:** Load funds into a DigiKhata sender's prepaid wallet.

### Get List of Recipients

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/recipients?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of saved beneficiaries for a DigiKhata sender.

### Add Recipient

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/recipient`
- **Description:** Register a new beneficiary under a DigiKhata sender's account.

### Generate Add Recipient Bank OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/recipient/bank/otp`
- **Description:** Generate an OTP to register a recipient's bank for a DigiKhata sender.

### Validate OTP to Add Recipient

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/sender/{customer_id}/recipient/bank/otp/verify`
- **Description:** Verify the OTP to complete recipient bank registration for a DigiKhata sender.

### Send Transaction OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata/otp`
- **Description:** Request an OTP to the sender's mobile to authorise a DigiKhata transfer.

### Initiate Transaction

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/ppi-digikhata`
- **Description:** Execute a DigiKhata wallet transfer to a recipient after OTP verification.

---

More official response samples / error codes: drop into `Incoming/` when available.
