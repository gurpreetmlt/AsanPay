---
title: "Add Settlement Bank Account API Reference"
description: "Register a bank account as an AePS fund-settlement recipient for an agent."
canonical: "https://eps.eko.in/docs/aeps-add-settlement-account"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-add-settlement-account

# Add Settlement Bank Account API Reference

`POST https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement/account`

Register a bank account as an AePS fund-settlement recipient for an agent.

Adds and name-verifies a bank account to which an agent can settle AePS funds. On success a `recipient_id` is returned — pass it to Initiate Settlement. If the account holder name does not match, the response reports the mismatch. An agent can register up to **3** settlement accounts, and only banks that offer account verification are accepted.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code. e.g. 20810200 |
| bank_id | integer | yes | Unique bank identifier. e.g. 12 |
| ifsc | string | yes | IFSC of the bank account. e.g. SBIN0000000 |
| service_code | integer | yes | AePS fund settlement service code. **Value: 39** |
| account | string | yes | Bank account number. e.g. 00000000000002 |

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
| data.recipient_id | number | Settlement recipient id → pass to Initiate Settlement |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "20810200",
  "bank_id": 12,
  "ifsc": "SBIN0000000",
  "service_code": 39,
  "account": "00000000000002"
}
```

## Example response

```json
{
  "response_status_id": 0,
  "data": {
    "recipient_id": 1893
  },
  "response_type_id": 1336,
  "message": "Account added",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 1335 | Account verification failed — name mismatch |
| 200 | 1334 | Account verification failed — name not returned by bank |

## AsanPay notes

- Max **3** settlement accounts per agent
- `service_code` fixed **39** for AePS settlement
- Success → store `recipient_id` for Initiate Settlement
- Name mismatch / no name from bank → `1335` / `1334`
- Still need: list settlement accounts, initiate settlement, banks (`bank_id`)
