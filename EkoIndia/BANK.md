# Eko — Bank / IFSC + Bank Account Verification

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## Bank & IFSC

### Get List of Banks

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/reference/banks?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Fetch a list of all banks.

### Get Bank Details

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/reference/bank/{bank_code}?initiator_id=9962981729&client_ref_id=2026010100123456789&ifsc=IDFB0080202`
- **Description:** Fetch a bank's details (id, name, channels) by its Eko bank code.

### Get IFSC Details

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/reference/banks/ifsc/{ifsc}?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Resolve a bank and branch from an IFSC code.

## Bank Account Verification

### Bank Account Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/bank-account/sync`
- **Description:** Verify a bank account by transferring ₹1 (penny drop) and retrieve the account holder name, account status, and branch details in real time.

### Bank Account Verification (Pennyless)

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/bank-acc-verify-pennyless`
- **Description:** Confirm an account number + IFSC and fetch the registered beneficiary name without transferring any money.

### Bulk Bank Account Verification

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/bank-account/bulk`
- **Description:** Submit multiple bank accounts for penny-drop verification in a single API call; poll a status API for per-account results.

### Check Bulk Bank Account Verification Status

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/kyc/bank-account/bulk/status?initiator_id=9962981729&client_ref_id=2026010100123456789&bulk_reference_id=3356655212`
- **Description:** Poll for per-account results of a Bulk Bank Account Verification batch using the bulk_reference_id returned at submit time.

---

More official response samples / error codes: drop into `Incoming/` when available.
