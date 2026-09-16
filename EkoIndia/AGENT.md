# Eko — User & Agent Management

Source: `postman/eps-collection.json` (staging).

Auth: see [`AUTH.md`](AUTH.md). Common fields: `initiator_id`, `client_ref_id`.

## User & Agent Management

### Onboard User

- **Method:** `POST`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/network/eps-agent`
- **Description:** Register a new agent/retailer (merchant) on the EPS platform and receive their user_code.

### Activate Service for User

- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/admin/network/agent/{user_code}/service/{service_code}/activate`
- **Description:** Activate a specific service (by service code) for one of your agents/retailers.

### Deactivate Service for User

- **Method:** `PUT`
- **URL:** `https://staging.eko.in/ekoapi/v3/admin/network/agent/{user_code}/service/{service_code}/deactivate`
- **Description:** Deactivate a specific service (by service code) for one of your agents/retailers.

### Get User's Services

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/account/services?initiator_id=9962981729&client_ref_id=2026010100123456789&user_code=20810200`
- **Description:** Check the activation status of every service for one of your agents.

### Get All Services

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/tools/catalog/service-codes?initiator_id=9962981729&client_ref_id=2026010100123456789`
- **Description:** List every service available on the platform with its service code and provider.

### Get Wallet Balance

- **Method:** `GET`
- **URL:** `https://staging.eko.in/ekoapi/v3/user/account/balance?initiator_id=9962981729&client_ref_id=2026010100123456789&customer_id_type=mobile_number&customer_id=9910028267`
- **Description:** Fetch the wallet balance for a user.

---

More official response samples / error codes: drop into `Incoming/` when available.
