---
title: "Get District Discome (UPPCL) API Reference"
description: "Resolve the district-level distribution company code required by UPPCL (operator 190)."
canonical: "https://eps.eko.in/docs/bbps-district-discome"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-district-discome

# Get District Discome (UPPCL) API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operators/190/district-discome`

Resolve the district-level distribution company code required by UPPCL (operator 190).

Some electricity billers require a district-level distribution company (discome) code. This applies to **operator 190 (UPPCL) only** — no other biller needs it, and the path is fixed to `190` rather than parameterised.

Show the agent each `label` and send the matching `value` as `district_discome` on both Fetch Bill and Pay Bill.

The list is returned under `param_attributes.list_elements`, **not** under `data`.

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
| status | number | 0 = success (also 0 on some failures — branch on `response_type_id`) |
| message | string | Human-readable message |
| response_status_id | number | Granular status id |
| response_type_id | number | Response shape id |
| param_attributes | object | Wrapper (**top-level**, not under `data`) |
| param_attributes.list_elements | array | One entry per UPPCL district |
| param_attributes.list_elements[].label | string | District name for UI |
| param_attributes.list_elements[].value | string | Pass as `district_discome` on Fetch / Pay |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2110 | District list returned — pass chosen `value` as `district_discome` | Fetch Bill |
| 2434 | Districts could not be fetched (`status` may still be `0`) | Retry / show error |

## Example response

`response_type_id` `2110`

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "label": "Agra",
        "value": "Agra-DVVNL"
      },
      {
        "label": "Lucknow",
        "value": "Lucknow-MVVNL"
      },
      {
        "label": "Kanpur Nagar",
        "value": "Kanpur Nagar-KESCO"
      },
      {
        "label": "Varanasi",
        "value": "Varanasi-PUVNL"
      }
    ]
  },
  "response_type_id": 2110,
  "message": "Success",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 2434 | Districts unavailable — still `status: 0`; branch on `response_type_id` |

## AsanPay notes

- Only when selected biller is **operator_id 190 (UPPCL)**.
- Path is hard-coded `/operators/190/district-discome` — not parameterized.
- UI: dropdown of `label` → submit `value` as `district_discome` on Fetch Bill **and** Pay Bill.
- Failure id **2434** can still return `status: 0` — do not treat `status === 0` alone as success.
