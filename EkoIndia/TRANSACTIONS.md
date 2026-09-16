# Eko — Transactions & Refunds

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## Transactions & Refunds

### Transaction Inquiry

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/reference/transaction/{transaction-reference}?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Get the status of any transaction by Eko TID or your client_ref_id.

### Get Refund OTP

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/refund/{tid}/otp`
- **Description:** Request the refund OTP for a failed transaction (sent to the customer's mobile).

### Initiate Refund

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/refund/{tid}`
- **Description:** Refund a failed transaction to the customer after OTP consent.

---

More official response samples / error codes: drop into `Incoming/` when available.
