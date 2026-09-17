---
title: "Get BBPS Operators API Reference"
description: "List all active BBPS billers, optionally filtered by category and/or state."
canonical: "https://eps.eko.in/docs/bbps-get-operators"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-get-operators

# Get BBPS Operators API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators`

List all active BBPS billers, optionally filtered by category and/or state.

Returns the list of billers. Filter by `category`, `location`, or both, using the identifiers from Get Categories and Get Locations; omit both to list every biller.

The `operator_id` returned here is what you pass as **`phone_operator_code`** to Fetch Bill and Pay Bill — the names differ. `billFetchResponse` tells you whether the biller supports a live bill fetch. The list is returned under `param_attributes.list_elements`, **not** under `data`.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Query parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID (max 20 characters). |
| category | number | no | `operator_category_id` from Get Categories. e.g. 11 |
| location | number | no | `operator_location_id` from Get Locations. e.g. 35 |

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
| param_attributes | object | Wrapper for biller list (**top-level**, not under `data`) |
| param_attributes.list_elements | array | One entry per matching biller |
| param_attributes.list_elements[].operator_id | number | Pass as **`phone_operator_code`** on Fetch / Pay |
| param_attributes.list_elements[].name | string | Biller name |
| param_attributes.list_elements[].operator_category | number | Category id |
| param_attributes.list_elements[].location_id | number | Location served; `0` = pan-India |
| param_attributes.list_elements[].kyc_required | number | Customer KYC required? |
| param_attributes.list_elements[].billFetchResponse | number | `1` = live bill fetch supported |
| param_attributes.list_elements[].high_commission_channel | number | Higher-commission channel available? |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2461 | Biller list returned — read chosen operator's input fields next | Get Operator Parameters |
| -1 | Invalid or missing `initiator_id` | Fix query |

## Example response

`response_type_id` `2461`

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "operator_id": 159,
        "name": "ACT Fibernet",
        "billFetchResponse": 0,
        "high_commission_channel": 0,
        "kyc_required": 1,
        "operator_category": 1,
        "location_id": 0
      },
      {
        "operator_id": 541,
        "name": "Port Blair Municipal Council - Water",
        "billFetchResponse": 0,
        "high_commission_channel": 0,
        "kyc_required": 0,
        "operator_category": 11,
        "location_id": 35
      }
    ]
  },
  "response_type_id": 2461,
  "message": "BBPS operators fetch success",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | -1 | Invalid or missing initiator_id |

## AsanPay notes

- List = top-level `param_attributes.list_elements`.
- **Name mismatch:** response `operator_id` → request field `phone_operator_code` on Fetch Bill / Pay Bill.
- Locations doc returns `operator_location_id` as zero-padded **string** (`"35"`); this page types query `location` as **number**. Prefer sending the string form from Locations (`location=35` or `location=06`) and verify live if zero-padding is required.
- `billFetchResponse === 1` → call Fetch Bill; else may be payment-without-fetch flow.
- Next: Get Operator Parameters for chosen `operator_id`.
