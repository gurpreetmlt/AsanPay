---
title: "Get BBPS Categories API Reference"
description: "Retrieve the list of supported BBPS biller categories (electricity, gas, DTH, etc.)."
canonical: "https://eps.eko.in/docs/bbps-get-categories"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-get-categories

# Get BBPS Categories API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/categories`

Retrieve the list of supported BBPS biller categories (electricity, gas, DTH, etc.).

Returns all BBPS biller categories. Pass an `operator_category_id` from here as the `category` filter on Get Operators, and as the `category` param on Fetch Bill and Pay Bill.

Common ids (examples only — **do not hard-code**; live response is authoritative): 1 Broadband Postpaid · 2 Gas · 4 DTH · 5 Mobile Prepaid · 6 Tax · 7 Credit Card · 8 Electricity · 9 Landline Postpaid · 10 Mobile Postpaid · 11 Water · 12 Housing Society · 13 Subscription · 14 Education · 15 Municipal Taxes · 16 Clubs and Associations · 17 Cable TV · 18 LPG Cylinder · 19 Hospital · 20 Insurance · 21 Loan · 22 FASTag · 23 Municipal Services · 24 Rental Payment · 27+ eChallan, Agent Collection, EV Recharge and others.

**Important:** The category list is returned under `param_attributes.list_elements`, **not** under `data`.

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
| param_attributes | object | Wrapper for category list (**top-level**, not under `data`) |
| param_attributes.list_elements | array | One entry per BBPS biller category |
| param_attributes.list_elements[].operator_category_id | number | Pass as `category` on Operators / Fetch / Pay |
| param_attributes.list_elements[].operator_category_name | string | Human-readable name |
| param_attributes.list_elements[].operator_category_group | string | Grouping code |
| param_attributes.list_elements[].status | string | `1` = active |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2457 | Category list returned — pick one and list its billers | Get Operators |

## Example response

`response_type_id` `2457`

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "operator_category_name": "Broadband Postpaid",
        "operator_category_id": 1,
        "operator_category_group": "0",
        "status": "1"
      },
      {
        "operator_category_name": "Electricity",
        "operator_category_id": 8,
        "operator_category_group": "0",
        "status": "1"
      },
      {
        "operator_category_name": "Water",
        "operator_category_id": 11,
        "operator_category_group": "0",
        "status": "1"
      },
      {
        "operator_category_name": "FASTag",
        "operator_category_id": 22,
        "operator_category_group": "0",
        "status": "1"
      }
    ]
  },
  "response_type_id": 2457,
  "message": "BBPS category fetch success",
  "status": 0
}
```

## AsanPay notes

- Parse **`param_attributes.list_elements`** (top-level) — not `data`.
- Never hard-code category ids; always fetch live list.
- Next: Get Operators with `category=<operator_category_id>`.
