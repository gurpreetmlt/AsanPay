---
title: "Initiate Settlement API Reference"
description: "Settle an agent's AePS funds to a registered bank account via NEFT/IMPS/RTGS."
canonical: "https://eps.eko.in/docs/aeps-initiate-settlement"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/aeps-initiate-settlement

# Initiate Settlement API Reference

`POST https://staging.eko.in/ekoapi/v3/user/payment/aeps/settlement`

Settle an agent's AePS funds to a registered bank account via NEFT/IMPS/RTGS.

Initiates a fund settlement of the requested amount to a registered `recipient_id`. Returns the financial response envelope with `tx_status`, transaction id (`tid`), fee, and updated balance. Settlement is available **Mon–Fri 10am–5pm** (excl. RBI holidays); max **₹2,00,000** per transaction; requests after 5pm settle the next working day.

> View product & pricing details: [AePS Cashout](https://eps.eko.in/products/aeps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| client_ref_id | string | no | Unique reference ID per API call (max 20 characters). |
| user_code | string | yes | Agent code. e.g. 20810200 |
| amount | integer | yes | Settlement amount (INR). Max **200000** per txn. e.g. 100 |
| recipient_id | integer | yes | From Add / Get Settlement Account. e.g. 1829 |
| payment_mode | integer | yes | **4** = NEFT, **5** = IMPS, **13** = RTGS. e.g. 5 |

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
| tx_status | string | 0=Success, 1=Fail, 2=Awaited, 3=Refund Pending, 4=Refunded, 5=On Hold |
| txstatus_desc | string | Human-readable txn status |
| data | object | Payload |
| data.tx_status | string | Transaction status code (0 = success) |
| data.amount | string | Settled amount (INR) |
| data.txstatus_desc | string | Human-readable status |
| data.fee | string | Base fee (INR) |
| data.gst | string | GST on fee (INR) |
| data.sender_name | string | Settling agent name |
| data.tid | string | Eko transaction ID |
| data.client_ref_id | string | Echoed client ref |
| data.balance | string | Agent balance after settlement (INR) |
| data.user_code | string | Agent code |
| data.totalfee | string | Total fee incl. GST |
| data.recipient_name | string | Destination account name |
| data.ifsc | string | Destination IFSC |
| data.bank_ref_num | string | Bank UTR — empty until bank confirms |
| data.account | string | Destination account number |
| data.timestamp | string | Settlement timestamp (may be empty initially) |

## Example request

```json
{
  "initiator_id": "9962981729",
  "client_ref_id": "2026010100123456789",
  "user_code": "20810200",
  "amount": 100,
  "recipient_id": 1829,
  "payment_mode": 5
}
```

## Example response

```json
{
  "response_status_id": 0,
  "data": {
    "tx_status": "0",
    "amount": "5000.00",
    "txstatus_desc": "Success",
    "fee": "17.70",
    "gst": "2.70",
    "sender_name": "Test User",
    "tid": "0000000000",
    "client_ref_id": "00000000000000000000",
    "balance": "0.00",
    "user_code": "10000001",
    "totalfee": "17.70",
    "recipient_name": "Test Recipient",
    "ifsc": "SBIN0000000",
    "bank_ref_num": "",
    "account": "00000000000000",
    "timestamp": ""
  },
  "response_type_id": 1477,
  "message": "Transaction processed successfully",
  "status": 0
}
```

## AsanPay notes

### Window / limits

| Rule | Value |
|------|-------|
| Hours | Mon–Fri 10:00–17:00 IST (excl. RBI holidays) |
| After 5pm | Settles next working day |
| Max per txn | ₹2,00,000 |

### payment_mode

| Code | Rail |
|------|------|
| 4 | NEFT |
| 5 | IMPS |
| 13 | RTGS |

### Flow

1. Add Settlement Account → `recipient_id`
2. Get Settlement Accounts → check `unsettled_fund` / `remaining_limit`
3. Initiate Settlement with `amount`, `recipient_id`, `payment_mode`

Success sample: `response_type_id` **1477**. Store `tid`; `bank_ref_num` may fill later.
