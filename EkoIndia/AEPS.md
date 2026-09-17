# Eko — AePS Cashout (Fingpay)

Source: `postman/eps-collection.json` (staging).

**Official page dumps:** see [`AEPS_INDEX.md`](AEPS_INDEX.md) — Activate, Daily KYC, and more as pasted.

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## AePS Cashout

### Activate AePS Fingpay for Agent

- **Official:** [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md)
- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/admin/network/agent/{user_code}/aeps-fingpay/activate`
- **Description:** Enable AePS Fingpay service for your agent by submitting their biometric device details and KYC documents.

### Get Shop Types

- **Official:** [`AEPS_SHOP_TYPES.md`](AEPS_SHOP_TYPES.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/get-Mcc-Category?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** List the Merchant Category Codes (MCC) available for AePS Fingpay agent onboarding.

### Get States

- **Official:** [`AEPS_STATES.md`](AEPS_STATES.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/get-states?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** List the states (with their state_id) available for AePS Fingpay agent onboarding.

### Send OTP (eKYC)

- **Official:** [`AEPS_EKYC_SEND_OTP.md`](AEPS_EKYC_SEND_OTP.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/otp`
- **Description:** Initiate AePS Fingpay eKYC by sending an OTP to the agent's registered Aadhaar-linked mobile number.

### Verify OTP (eKYC)

- **Official:** [`AEPS_EKYC_VERIFY_OTP.md`](AEPS_EKYC_VERIFY_OTP.md)
- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/otp/verify`
- **Description:** Verify the eKYC OTP sent to the agent's Aadhaar-linked mobile number to advance the one-time AePS Fingpay eKYC.

### Biometric eKYC

- **Official:** [`AEPS_EKYC_BIOMETRIC.md`](AEPS_EKYC_BIOMETRIC.md)
- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/biometric`
- **Description:** Complete one-time AePS Fingpay eKYC by submitting the agent's Aadhaar and live biometric fingerprint capture.

### Daily KYC

- **Official:** [`AEPS_DAILY_KYC.md`](AEPS_DAILY_KYC.md)
- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/kyc/biometric/daily`
- **Description:** Perform the mandatory daily biometric re-verification that authorises an agent to carry out AePS transactions for the current calendar day.

### Cash Withdrawal OTP

- **Official:** [`AEPS_CASH_WITHDRAWAL_OTP.md`](AEPS_CASH_WITHDRAWAL_OTP.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/cash-withdrawal/otp/{customer_id}`
- **Description:** Generate the transaction OTP required before an AePS cash withdrawal above ₹5,000.

### AePS Cash Withdrawal

- **Official:** [`AEPS_CASH_WITHDRAWAL.md`](AEPS_CASH_WITHDRAWAL.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/cash-withdrawl/{customer_id}`
- **Description:** Withdraw cash from any Aadhaar-linked bank account using biometric fingerprint authentication — no card or PIN required.

### AePS Balance Enquiry

- **Official:** [`AEPS_BALANCE_ENQUIRY.md`](AEPS_BALANCE_ENQUIRY.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/balance-enquiry/{customer_id}`
- **Description:** Check a customer's bank account balance using Aadhaar number and biometric fingerprint — no card or PIN required.

### AePS Mini Statement

- **Official:** [`AEPS_MINI_STATEMENT.md`](AEPS_MINI_STATEMENT.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/collection/aeps-fingpay/mini-statement/{customer_id}`
- **Description:** Retrieve the last few transactions from an Aadhaar-linked bank account via biometric authentication.

### Add Settlement Bank Account

- **Official:** [`AEPS_ADD_SETTLEMENT_ACCOUNT.md`](AEPS_ADD_SETTLEMENT_ACCOUNT.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement/account`
- **Description:** Register a bank account as an AePS fund-settlement recipient for an agent.

### Get Settlement Bank Accounts

- **Official:** [`AEPS_GET_SETTLEMENT_ACCOUNTS.md`](AEPS_GET_SETTLEMENT_ACCOUNTS.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement/accounts?initiator_id=9962981729&client_ref_id=2026010100123456789&user_code=20810200`
- **Description:** List an agent's registered AePS settlement recipients with unsettled funds and remaining limit.

### Initiate Settlement

- **Official:** [`AEPS_INITIATE_SETTLEMENT.md`](AEPS_INITIATE_SETTLEMENT.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement`
- **Description:** Settle an agent's AePS funds to a registered bank account via NEFT/IMPS/RTGS.

---

More official response samples / error codes: drop into `Incoming/` when available.
