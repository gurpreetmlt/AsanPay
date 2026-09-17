---
title: "Get Operator Parameters API Reference"
description: "Fetch the custom input fields required by a specific biller before payment."
canonical: "https://eps.eko.in/docs/bbps-get-operator-parameters"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-get-operator-parameters

# Get Operator Parameters API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/operator/{operator_id}/parameters`

Fetch the custom input fields required by a specific biller before payment.

Returns the input fields the chosen operator requires — field names, labels, types and validation regex — so you can render the bill-entry form dynamically.

**`list_elements` is the source of truth for this operator's fields.** The documented parameters on Fetch Bill and Pay Bill are only the common set; every `param_name` returned here must also be sent to **both** calls, with identical values. Call this once per operator and cache the result.

The payload is returned under `param_attributes`, **not** under `data`.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Path parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| operator_id | number | yes | The `operator_id` from Get Operators. e.g. 5 |

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
| param_attributes | object | Parameter schema (**top-level**, not under `data`) |
| param_attributes.operator_name | string | Display name |
| param_attributes.operator_id | number | Operator this schema belongs to |
| param_attributes.fetchBill | number | `1` = live bill fetch supported |
| param_attributes.BBPS | number | On BBPS network — show Bharat BillPay branding per NPCI |
| param_attributes.list_elements | array | Required input fields |
| param_attributes.list_elements[].param_name | string | Field name to submit on Fetch / Pay |
| param_attributes.list_elements[].param_label | string | Label for agent UI |
| param_attributes.list_elements[].param_id | string | Field identifier |
| param_attributes.list_elements[].param_type | string | e.g. `Numeric`, `List` |
| param_attributes.list_elements[].regex | string | Client validation pattern |
| param_attributes.list_elements[].error_message | string | Shown when regex fails |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 2463 | Parameter schema returned — collect fields, then fetch bill | Fetch Bill |

## Example response

`response_type_id` `2463`

```json
{
  "response_status_id": 0,
  "param_attributes": {
    "operator_name": "BSNL  Prepaid",
    "list_elements": [
      {
        "param_label": "Mobile Number",
        "param_name": "utility_acc_no",
        "param_id": "1",
        "param_type": "Numeric",
        "regex": "^[0-9]{10}$",
        "error_message": "Please enter a valid 10 digit Mobile Number (eg. 0940763946)"
      },
      {
        "param_label": "Recharge Type",
        "param_name": "Recharge Type",
        "param_id": "99",
        "param_type": "List",
        "regex": "1|3",
        "error_message": "Please enter valid Recharge Type"
      }
    ],
    "operator_id": 5,
    "fetchBill": 0,
    "BBPS": 0
  },
  "response_type_id": 2463,
  "message": "BBPS operator parameters fetch success",
  "status": 0
}
```

## AsanPay notes

- Dynamic form: render from `param_attributes.list_elements`.
- Every `param_name` → send on **both** Fetch Bill and Pay Bill (same values).
- Cache per `operator_id` (schema rarely changes mid-session).
- `fetchBill` / Operators' `billFetchResponse` decide whether Fetch Bill is needed.
- `param_type: List` + `regex: "1|3"` → option list from pipe-separated values.
- Next: Fetch Bill (if supported) then Pay Bill.
