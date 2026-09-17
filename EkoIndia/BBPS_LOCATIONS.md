---
title: "Get BBPS Locations API Reference"
description: "Retrieve the list of supported state/location IDs for filtering BBPS operators."
canonical: "https://eps.eko.in/docs/bbps-get-locations"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-get-locations

# Get BBPS Locations API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/locations`

Retrieve the list of supported state/location IDs for filtering BBPS operators.

Returns every operating location (state / UT). Pass an `operator_location_id` from here as the `location` filter on Get Operators to narrow the biller list to one state.

`operator_location_id` is a **zero-padded string** (`"06"`, `"35"`), not a number — keep it as a string when you pass it back. The list is returned under `param_attributes.list_elements`, **not** under `data`.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Query parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID (max 20 characters). |

## Headers

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| developer_key | string | yes | Static API key. |
| secret-key | string | yes | base64(HMAC-SHA256(timestamp, base64(access_key))). |
| secret-key-timestamp | string | yes | Unix ms timestamp. |
| content-type | string | yes | application/json |

## Response

| Field | Type | Description |
| --- | --- | --- |
| status | number | 0 = success |
| message | string | Human-readable message |
| response_status_id | number | Granular status id |
| response_type_id | number | Response shape id |
| param_attributes | object | Wrapper for location list (**top-level**, not under `data`) |
| param_attributes.list_elements | array | One entry per state / UT |
| param_attributes.list_elements[].operator_location_id | string | Zero-padded id — pass as `location` on Get Operators |
| param_attributes.list_elements[].operator_location_name | string | State / UT name |
| param_attributes.list_elements[].abbreviation | string | Two-letter state code |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2459 | Location list returned — use as `location` filter on Get Operators | Get Operators |

## Example response

`response_type_id` `2459`

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "operator_location_name": "Haryana",
        "operator_location_id": "06",
        "abbreviation": "HR"
      },
      {
        "operator_location_name": "Madhya Pradesh",
        "operator_location_id": "23",
        "abbreviation": "MP"
      },
      {
        "operator_location_name": "Andaman and Nicobar",
        "operator_location_id": "35",
        "abbreviation": "AN"
      }
    ]
  },
  "response_type_id": 2459,
  "message": "BBPS location fetch success",
  "status": 0
}
```

## AsanPay notes

- List = top-level `param_attributes.list_elements` (same pattern as Categories).
- Keep `operator_location_id` as **string** (`"06"` not `6`).
- Optional filter on Get Operators — not always required for every category.
