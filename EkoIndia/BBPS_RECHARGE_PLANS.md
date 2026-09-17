---
title: "Get Recharge Plans API Reference"
description: "List the prepaid mobile / DTH recharge plans available for an operator and circle."
canonical: "https://eps.eko.in/docs/bbps-recharge-plans"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-recharge-plans

# Get Recharge Plans API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/recharge/{customer_mobile}/operator/plans`

List the prepaid mobile / DTH recharge plans available for an operator and circle.

Lists available recharge plans for an operator and circle. Plans arrive under `dependent_params` at the **top level** (not under `data`): the `req_list` entry's `value` array holds the plans, and its `type_metadata[].headers` describe which field is the price, the validity and the description.

**`circleid` is the `circle_area` value** returned by Get Operator Code and Circle — the parameter is renamed between the two calls. Once the customer picks a plan, submit its `amount` through Pay Bill.

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
| phone_operator_code | string | yes | From Get Operator Code and Circle. e.g. 400 |
| circleid | string | yes | = `circle_area` from Get Operator Code and Circle (renamed). e.g. 5 |

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
| status | number | 0 = success (also 0 on 1805 — branch on `response_type_id`) |
| message | string | Human-readable message |
| response_status_id | number | Granular status id |
| response_type_id | number | Response shape id |
| dependent_params | array | Plan groups (**top-level**). Entry named `req_list` holds plans |
| dependent_params[].name | string | Group name; `req_list` = plan list |
| dependent_params[].value | array | Available plans |
| dependent_params[].value[].amount | string | Plan price (INR) → Pay Bill `amount` |
| dependent_params[].value[].validity | string | Plan validity |
| dependent_params[].value[].plan_description | string | Plan details |
| dependent_params[].type_metadata | array | Column metadata (price / validity / description) |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1804 | Plans returned — customer picks one, submit `amount` | Pay Bill |
| 1805 | Plans unavailable (`status` may still be `0`) — agent can enter amount manually | Pay Bill |

## Example response

`response_type_id` `1804`

```json
{
  "response_status_id": 0,
  "dependent_params": [
    {
      "type_metadata": [
        {
          "headers": [
            {
              "name": "amount",
              "value": "price"
            },
            {
              "name": "validity",
              "value": "validity"
            },
            {
              "name": "plan_description",
              "value": "plan_description"
            }
          ],
          "dependent_params": [
            {
              "name": "amount",
              "value": "amount"
            }
          ]
        }
      ],
      "name": "req_list",
      "value": [
        {
          "amount": "224",
          "validity": "30 Days",
          "plan_description": "Unlimited Calls + 4GB data ..."
        },
        {
          "amount": "349",
          "validity": "28 Days",
          "plan_description": "1.5 GB/day + Unlimited Calls ..."
        }
      ]
    }
  ],
  "response_type_id": 1804,
  "message": "success",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1805 | Plans unavailable — still `status: 0`; allow manual amount |

## AsanPay notes

- Find `dependent_params` entry where `name === "req_list"` → `value[]` = plans.
- Input rename: prior call `circle_area` → query **`circleid`**.
- Fail id **1805**: do not block recharge — agent enters amount manually.
- Chosen plan `amount` → Pay Bill.
- Parallel to BestAPI DTH/mobile plans already on AsanPay recharge UI (different provider).
