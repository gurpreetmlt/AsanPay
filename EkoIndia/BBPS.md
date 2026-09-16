# Eko — Bharat Bill Payment System (BBPS)

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## Bharat Bill Payment System (BBPS)

### Get BBPS Categories

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/categories?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of supported BBPS biller categories (electricity, gas, DTH, etc.).

### Get BBPS Locations

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/locations?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of supported state/location IDs for filtering BBPS operators.

### Get BBPS Operators

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators?initiator_id=9962981729&client_ref_id=2026010100123456789&category=11&location=35`
- **Description:** List all active BBPS billers, optionally filtered by category and/or state.

### Get Operator Parameters

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operator/{operator_id}/parameters?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Fetch the custom input fields required by a specific biller before payment.

### Get District Discome (UPPCL)

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators/190/district-discome?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Resolve the district-level distribution company code required by UPPCL (operator 190).

### Get Operator Code and Circle

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Auto-detect a mobile number's recharge operator code and telecom circle.

### Get Recharge Plans

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator/plans?initiator_id=9962981729&client_ref_id=2026010100123456789&phone_operator_code=400&circleid=5`
- **Description:** List the prepaid mobile / DTH recharge plans available for an operator and circle.

### Fetch BBPS Bill

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/bill?initiator_id=9962981729&phone_operator_code=53&utility_acc_no=3287820071&confirmation_mobile_no=9903457748&sender_name=Asaad&category=8&client_ref_id=2026010100123456789&source_ip=192.168.1.1&district_discome=Lucknow-MVVNL&state=1&communication=0`
- **Description:** Retrieve outstanding bill details from a biller before processing payment.

### Pay BBPS Bill

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps`
- **Description:** Process a bill payment or recharge for any BBPS-connected biller.

---

More official response samples / error codes: drop into `Incoming/` when available.
