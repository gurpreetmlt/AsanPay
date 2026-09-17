---
title: "Fetch BBPS Bill API Reference"
description: "Retrieve outstanding bill details from a biller before processing payment."
canonical: "https://eps.eko.in/docs/bbps-fetch-bill"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-fetch-bill

# Fetch BBPS Bill API Reference

`GET https://staging.eko.in/ekoapi/v3/customer/payment/bbps/bill`

Retrieve outstanding bill details from a biller before processing payment.

Retrieves the live bill amount and customer name for a biller. Call this before Pay Bill so the agent can confirm the amount with the customer.

**Carry `amount` and `utilitycustomername` from this response into Pay Bill**, and use the **same `client_ref_id`** for the matching Pay Bill call. Paying anything other than the fetched amount is rejected with status `208`.

**Parameters vary by operator.** The fields listed below are the common set — call Get Operator Parameters first and treat its `list_elements` as the source of truth. Every additional `param_name` it returns must be sent here **and** to Pay Bill, with the same values in both.

Note that `response_status_id` is **`-1` on success** for this endpoint. Branch on `status` and `response_type_id`, never on `response_status_id`.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Query parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| phone_operator_code | string | yes | Biller id = `operator_id` from Get Operators. e.g. 53 |
| utility_acc_no | string | yes | Bill / account number. e.g. 3287820071 |
| confirmation_mobile_no | string | yes | Customer mobile linked with the bill. e.g. 9903457748 |
| sender_name | string | yes | Customer name. e.g. Asaad |
| category | number | yes | `operator_category_id` from Get Categories. e.g. 8 |
| client_ref_id | string | yes | Unique partner ref — **reuse on matching Pay Bill**; fresh for each new payment attempt. |
| source_ip | string | yes | Originating client IP. e.g. 192.168.1.1 |
| district_discome | string | no | Required for **operator 190 (UPPCL)** only. e.g. Lucknow-MVVNL |
| state | string | no | State code if operator requires it. e.g. 1 |
| communication | number | no | `0` = online (default, instant, lower commission). `1` = offline (higher commission, ≥6 working hours). Same value on Pay Bill. |
| *(dynamic)* | — | varies | Every extra `param_name` from Get Operator Parameters |

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
| response_status_id | number | **`-1` on success** — do not use as success check |
| response_type_id | number | Response shape id |
| data | object | Payload |
| data.amount | string | Bill due (INR) — present to customer; send **exact** value to Pay Bill |
| data.utilitycustomername | string | Name on bill — echo to Pay Bill |
| data.billDueDate | string | Due date `YYYYMMDD` |
| data.customer_id | string | Account / consumer number from biller |
| data.billdate | string | Bill generation date (if returned) |
| data.billername | string | Biller name (if returned) |
| data.bbpstrxnrefid | string | BBPS txn ref (if returned) |
| data.billDetailsList | array | Extra line items (if returned) |
| data.ifsc_status | number | Biller-side flag |
| data.user_code | string | Agent user code |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 1052 | Bill fetched — confirm amount, then pay | Pay Bill |
| 1468 | Bill fetch failed — do not pay | Fix details / retry |
| -1 | Required field missing | Fix query |

## Example response

`response_type_id` `1052`

```json
{
  "response_status_id": -1,
  "data": {
    "amount": "2870.0",
    "utilitycustomername": "Amit Kumar",
    "ifsc_status": 1,
    "user_code": "35739001",
    "customer_id": "3287820071",
    "billDueDate": "20260728",
    "billdate": "null",
    "billDetailsList": [],
    "bbpstrxnrefid": "",
    "billername": ""
  },
  "response_type_id": 1052,
  "message": "Due Bill Amount For utility",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | -1 | Required field missing |
| 200 | 1468 | Bill fetch failed at the biller |

## AsanPay notes

- Success check: `status === 0` + `response_type_id === 1052` (ignore `response_status_id === -1`).
- Pay Bill must use **same** `client_ref_id`, **exact** `amount`, and `utilitycustomername` from this response.
- Wrong amount → Pay Bill rejects with status **208**.
- Merge common query fields + all Operator Parameters `param_name`s (+ `district_discome` for 190).
- Skip Fetch when operator `fetchBill` / `billFetchResponse` is not supported — Pay Bill may still apply for some flows (confirm on Pay Bill doc).
