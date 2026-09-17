---
title: "Get Shop Types API Reference"
description: "List the Merchant Category Codes (MCC) available for AePS Fingpay agent onboarding."
canonical: "https://eps.eko.in/docs/aeps-fingpay-shop-types"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-fingpay-shop-types

# Get Shop Types API Reference

`GET https://staging.eko.in/ekoapi/v3/user/collection/aeps-fingpay/get-Mcc-Category`

List the Merchant Category Codes (MCC) available for AePS Fingpay agent onboarding.

Returns the list of Merchant Category Codes (MCC). Use the `value` of the chosen entry as the `shop_type` in the Activate AePS Fingpay request.

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
| data | object | Payload (see note below on sample shape) |
| data.param_attributes | object | Container for the returned list |
| data.param_attributes.list_elements | array | Available MCC categories |
| list_elements.label | string | Display name |
| list_elements.value | number | MCC code → use as `shop_type` (string) on Activate |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2110 | Shop-type list returned successfully | [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md) |

## Example response

`response_type_id` `2110` — Shop-type list returned successfully.

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "list_elements": [
      {
        "label": "Courier services — air and ground and freight forwarders",
        "value": 4215
      },
      {
        "label": "Travel agencies and tour operators",
        "value": 4722
      },
      {
        "label": "Groceries and supermarkets",
        "value": 5411
      },
      {
        "label": "Electronics Shops",
        "value": 5732
      },
      {
        "label": "Fast food restaurants",
        "value": 5814
      }
    ]
  },
  "response_type_id": 2110,
  "message": "Success",
  "status": 0
}
```

## AsanPay notes

- Activate API expects `shop_type` as **string** (e.g. `"4215"`) even though `value` here is a **number**.
- Sample response puts `param_attributes` at **top level** (not under `data`) — client should read both `data.param_attributes` and root `param_attributes` when wiring.
- Full MCC catalog may be longer than the 5 examples; always fetch live, do not hardcode only these.
