---
title: "Get Operator Code and Circle API Reference"
description: "Auto-detect a mobile number's recharge operator code and telecom circle."
canonical: "https://eps.eko.in/docs/bbps-operator-code-circle"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-operator-code-circle

# Get Operator Code and Circle API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator`

Auto-detect a mobile number's recharge operator code and telecom circle.

Detects the telecom operator and circle for a customer mobile number, returned as name/value pairs under `dependent_params` at the **top level** of the response (not under `data`).

**Watch the rename:** this endpoint returns `circle_area`, but Get Recharge Plans expects that value as the **`circleid`** query parameter. The `phone_operator_code` value carries over under the same name.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Path parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| customer_mobile | string | yes | Customer's mobile number. e.g. 9876543210 |

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
| dependent_params | array | Operator/circle name-value pairs (**top-level**, not under `data`) |
| dependent_params[].name | string | `phone_operator_code` or `circle_area` |
| dependent_params[].value | number \| string | Value — pass `circle_area` as `circleid` on Get Recharge Plans |
| data | object | May include misc fields (e.g. `updates`) |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1804 | Operator and circle detected — list plans | Get Recharge Plans |

## Example response

`response_type_id` `1804`

```json
{
  "response_status_id": 0,
  "dependent_params": [
    {
      "name": "phone_operator_code",
      "value": 1
    },
    {
      "name": "circle_area",
      "value": "23"
    }
  ],
  "data": {
    "updates": ""
  },
  "response_type_id": 1804,
  "message": "success",
  "status": 0
}
```

## AsanPay notes

- Parse top-level **`dependent_params`** (not `data`).
- Rename map for next call: `circle_area` → query **`circleid`**; keep `phone_operator_code` as-is.
- This is the **BBPS recharge helper** path (Eko), separate from BestAPI mobile-operator lookup already wired for prepaid.
- Next: [Get Recharge Plans](https://eps.eko.in/docs/bbps-recharge-plans).
