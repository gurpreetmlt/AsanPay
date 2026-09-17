---
title: "Get Settlement Bank Accounts API Reference"
description: "List an agent's registered AePS settlement recipients with unsettled funds and remaining limit."
canonical: "https://eps.eko.in/docs/aeps-get-settlement-accounts"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-get-settlement-accounts

# Get Settlement Bank Accounts API Reference

`GET https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement/accounts`

List an agent's registered AePS settlement recipients with unsettled funds and remaining limit.

Returns the agent's saved settlement bank accounts (each with a `recipient_id`), the total unsettled fund, and the remaining daily settlement limit.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Query parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID (max 20 characters). |
| user_code | string | yes | Agent code. e.g. 20810200 |

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
| data | object | Payload |
| data.unsettled_fund | string | Total unsettled AePS fund available to settle (INR) |
| data.remaining_limit | string | Remaining daily settlement limit (INR) |
| data.fund_transfer_list | array | Registered settlement recipients |
| data.fund_transfer_list[].recipient_id | string | Pass to Initiate Settlement |
| data.fund_transfer_list[].name | string | Account holder name |
| data.fund_transfer_list[].account | string | Bank account number |
| data.fund_transfer_list[].ifsc | string | Bank branch IFSC |

## Example response

```json
{
  "response_status_id": -1,
  "data": {
    "unsettled_fund": "6100.0",
    "remaining_limit": "190000",
    "fund_transfer_list": [
      {
        "name": "Test Recipient",
        "ifsc": "SBIN0000000",
        "account": "00000000000001",
        "recipient_id": "1828"
      },
      {
        "name": "Test Recipient",
        "ifsc": "SBIN0000000",
        "account": "00000000000002",
        "recipient_id": "1829"
      }
    ]
  },
  "response_type_id": 1321,
  "message": "List of fund transfer recipients",
  "status": 0
}
```

## AsanPay notes

- Use before Initiate Settlement to pick `recipient_id` and check `unsettled_fund` / `remaining_limit`
- Example query: `?initiator_id=...&user_code=...&client_ref_id=...`
- Success shape: `response_type_id` **1321**
- Note: sample has `response_status_id: -1` with `status: 0` — branch on `status` / `response_type_id`, not only `response_status_id`
