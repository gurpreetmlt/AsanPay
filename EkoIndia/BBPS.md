# Eko — Bharat Bill Payment System (BBPS)

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## Bharat Bill Payment System (BBPS)

### Get BBPS Categories

- **Official:** [`BBPS_CATEGORIES.md`](BBPS_CATEGORIES.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/categories?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of supported BBPS biller categories (electricity, gas, DTH, etc.). List lives under `param_attributes.list_elements` (not `data`).

### Get BBPS Locations

- **Official:** [`BBPS_LOCATIONS.md`](BBPS_LOCATIONS.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/locations?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Retrieve the list of supported state/location IDs for filtering BBPS operators. `operator_location_id` is a zero-padded string under `param_attributes.list_elements`.

### Get BBPS Operators

- **Official:** [`BBPS_OPERATORS.md`](BBPS_OPERATORS.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators?initiator_id=9962981729&client_ref_id=2026010100123456789&category=11&location=35`
- **Description:** List all active BBPS billers, optionally filtered by category and/or state. `operator_id` is passed later as `phone_operator_code`.

### Get Operator Parameters

- **Official:** [`BBPS_OPERATOR_PARAMETERS.md`](BBPS_OPERATOR_PARAMETERS.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operator/{operator_id}/parameters?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Fetch the custom input fields required by a specific biller before payment. Every `param_name` must be sent to both Fetch Bill and Pay Bill.

### Get District Discome (UPPCL)

- **Official:** [`BBPS_DISTRICT_DISCOME.md`](BBPS_DISTRICT_DISCOME.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators/190/district-discome?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Resolve the district-level distribution company code required by UPPCL (operator 190 only). Pass chosen `value` as `district_discome` on Fetch / Pay.

### Get Operator Code and Circle

- **Official:** [`BBPS_OPERATOR_CODE_CIRCLE.md`](BBPS_OPERATOR_CODE_CIRCLE.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** Auto-detect a mobile number's recharge operator code and telecom circle. Top-level `dependent_params`; `circle_area` → `circleid` on plans.

### Get Recharge Plans

- **Official:** [`BBPS_RECHARGE_PLANS.md`](BBPS_RECHARGE_PLANS.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator/plans?initiator_id=9962981729&client_ref_id=2026010100123456789&phone_operator_code=400&circleid=5`
- **Description:** List the prepaid mobile / DTH recharge plans available for an operator and circle. Plans in `dependent_params` → `req_list.value`; `circleid` = prior `circle_area`.

### Fetch BBPS Bill

- **Official:** [`BBPS_FETCH_BILL.md`](BBPS_FETCH_BILL.md)
- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps/bill?initiator_id=9962981729&phone_operator_code=53&utility_acc_no=3287820071&confirmation_mobile_no=9903457748&sender_name=Asaad&category=8&client_ref_id=2026010100123456789&source_ip=192.168.1.1&district_discome=Lucknow-MVVNL&state=1&communication=0`
- **Description:** Retrieve outstanding bill details from a biller before processing payment. Carry exact `amount` + `utilitycustomername` + same `client_ref_id` to Pay Bill. Success may have `response_status_id: -1`.

### Pay BBPS Bill

- **Official:** [`BBPS_PAY_BILL.md`](BBPS_PAY_BILL.md)
- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/customer/payment/bbps`
- **Description:** Process a bill payment or recharge for any BBPS-connected biller. Exact Fetch amount; 208 = mismatch → re-fetch + new client_ref_id; always persist tid.

---

More official response samples / error codes: drop into `Incoming/` when available.
