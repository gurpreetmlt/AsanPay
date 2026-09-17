---
title: "Get States API Reference"
description: "List the states (with their state_id) available for AePS Fingpay agent onboarding."
canonical: "https://eps.eko.in/docs/aeps-fingpay-states"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-states

# Get States API Reference

`GET https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/get-states`

List the states (with their state_id) available for AePS Fingpay agent onboarding.

Returns the list of states. Use the `value` of the chosen state as the `state_id` inside the `address_as_per_proof` and `office_address` objects in the Activate AePS Fingpay request.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Query parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user (see Platform Credentials). e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). e.g. 2026010100123456789 |

## Headers

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| developer_key | string | yes | Static API key issued to your account after KYC. |
| secret-key | string | yes | base64(HMAC-SHA256(timestamp, base64(access_key))). |
| secret-key-timestamp | string | yes | Unix ms timestamp used to compute secret-key. |
| content-type | string | yes | application/json |

## Response

| Field | Type | Description |
| --- | --- | --- |
| status | number | 0 = success |
| message | string | Human-readable message |
| response_status_id | number | Granular status id |
| response_type_id | number | Response shape id |
| data | object | Payload (see note on sample shape) |
| data.param_attributes | object | Container for the returned list |
| data.param_attributes.list_elements | array | Available states |
| list_elements.stateCode | string | Two-letter state code (e.g. HR, SK) |
| list_elements.label | string | State name for display |
| list_elements.value | number | Integer state ID → use as `state_id` in address objects |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2127 | State list returned successfully | [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md) |

## Example response

`response_type_id` `2127` — State list returned successfully.

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "stateCode": "HR",
        "label": "Haryana",
        "value": 8
      },
      {
        "stateCode": "KA",
        "label": "Karnataka",
        "value": 12
      },
      {
        "stateCode": "MH",
        "label": "Maharashtra",
        "value": 15
      },
      {
        "stateCode": "SK",
        "label": "Sikkim",
        "value": 23
      },
      {
        "stateCode": "UP",
        "label": "Uttar Pradesh",
        "value": 27
      }
    ]
  },
  "response_type_id": 2127,
  "message": "Success",
  "status": 0
}
```

## AsanPay notes

- Activate sample uses `state_id` as **string** (`"23"`); API returns `value` as **number** — stringify when building `office_address` / `address_as_per_proof`.
- Also send human `state` name (label) alongside `state_id` as in Activate examples.
- Sample response puts `param_attributes` at **top level** (not under `data`) — read both shapes when parsing.
- Fetch live list; do not hardcode only the 5 example states.
