# Eko — KYC & utility tools

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## GST Verification

### GST Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/gstin`
- **Description:** Verify GSTIN details instantly — legal name, trade name, status, address, and filing metadata — for vendor onboarding and compliance checks.

### Fetch GSTINs by PAN

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/gstin-with-pan`
- **Description:** Retrieve all GSTINs linked to a given PAN — with their state and status — in a single API call.

## UPI ID (VPA) Verification

### UPI ID (VPA) Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/upi/validate-vpa`
- **Description:** Validate a UPI Virtual Payment Address (VPA) and retrieve the registered payee name and mobile number in real time.

## Driving Licence Verification

### Driving License Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/driving-license`
- **Description:** Verify driving license details in real time — holder name, DOB, address, validity, COV/badge class, and status.

## Vehicle & RC Verification

### Vehicle & RC Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/vehicle-rc`
- **Description:** Verify a vehicle's registration certificate (RC) in real time — owner details, chassis/engine numbers, insurance validity, blacklist status, permits, fitness, and financier info via the VAHAN national database.

## Employee Verification

### Employee Verification (Advance)

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/advance-employment`
- **Description:** Verify employment history and employee identity by phone number via EPFO/UAN data.

## Reverse Geocoding

### Reverse Geocoding

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/reverse-geocoding`
- **Description:** Convert latitude and longitude coordinates into structured Indian address data including locality, city, state, PIN code, and country.

## Voter ID Verification

### Voter ID Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/voter-id`
- **Description:** Validate EPIC (Voter ID) card details in real time against government records — returns name, age, address, constituency, and polling station information.

## Passport Application Validation

### Passport Application Validation

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/passport`
- **Description:** Validate Indian passport application details using passport file number and date of birth.

## CIN Verification

### CIN Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/cin`
- **Description:** Verify Company Identification Numbers (CIN) against MCA records — returns company name, incorporation details, directors, and CIN status.

## IP Verification

### IP Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/ip`
- **Description:** Geo-locate and risk-score an IP address in real time — detect proxies, VPNs, and assess fraud risk.

## Name Match

### Name Match API

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/name-match`
- **Description:** AI-powered name comparison trained on 100M+ Indian name records — returns a match score (0–1) and match category for automated KYC decisions.

## ITR Compliance Check

### ITR Compliance Check

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/touras/itr-compliance`
- **Description:** Check income tax return filing and compliance status for a PAN holder in real time — ideal for lending, credit assessment, and financial due-diligence workflows.

## DIN Verification

### DIN Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/touras/din-verification`
- **Description:** Verify Director Identification Numbers (DIN) against MCA records — returns director name, DIN status, designation, and associated company information.

## E-Challan Verification

### E-Challan Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/touras/e-challan`
- **Description:** Fetch pending traffic challans for any vehicle using its registration number — challan number, offence, fine amount, date, status, and issuing authority returned in a single API call.

## Email Verification

### Email Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/touras/check-email`
- **Description:** Verify an email address in real time — confirm the domain has live mail infrastructure, detect disposable addresses, and retrieve domain age as a trust signal.

## FSSAI License Verification

### FSSAI License Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/touras/fetch-fssai`
- **Description:** Verify FSSAI food license details and status in real time.

## Mobile/OTP Verification

### Send OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/mobile/otp`
- **Description:** Send a one-time password (OTP) to a customer's primary mobile number to start mobile verification.

### Verify OTP

- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/mobile/otp/verify`
- **Description:** Verify the OTP entered by the customer and receive a signed verification token for downstream use.

### Validate OTP-Verification-Token

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/mobile/otp/validate-token?initiator_id=9962981729&client_ref_id=2026010100123456789&otp_verification_token=YOUR_OTP_VERIFICATION_TOKEN`
- **Description:** Validate an otp_verification_token as proof that OTP verification happened within the 5-minute time limit.

---

More official response samples / error codes: drop into `Incoming/` when available.
