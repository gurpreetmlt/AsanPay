---
title: "Pay BBPS Bill API Reference"
description: "Process a bill payment or recharge for any BBPS-connected biller."
canonical: "https://eps.eko.in/docs/bbps-pay-bill"
source: "Owner paste — 2026-09-17"
---

> **Canonical URL:** https://eps.eko.in/docs/bbps-pay-bill

# Pay BBPS Bill API Reference

`POST https://staging.eko.in/ekoapi/v3/customer/payment/bbps`

Process a bill payment or recharge for any BBPS-connected biller.

The money-debit call that pays a bill or submits a recharge on the BBPS network. For a bill payment, send the `amount` confirmed at Fetch Bill and the `utilitycustomername` it returned. A prepaid recharge skips Fetch Bill, so it sends the chosen plan's amount and omits `utilitycustomername`.

**Pay the exact amount returned by Fetch Bill** — a mismatch is rejected with status `208`. On `208`, re-fetch the bill and retry with a **fresh** `client_ref_id`; a `client_ref_id` identifies one payment attempt and must never be reused across retries. Persist `tid` and your `client_ref_id` before any retry — status `208` still returns a `tid`.

**Parameters vary by operator.** The fields below are the common set; pass every `param_name` returned by Get Operator Parameters as well. The parameter set sent here must match the set sent to Fetch Bill for the same operator.

> View product & pricing details: [Bharat Bill Payment System (BBPS)](https://eps.eko.in/products/bbps-api.md)

## Body parameters

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| initiator_id | string | yes | Registered mobile number of the API user. e.g. 9962981729 |
| phone_operator_code | string | yes | Biller id = `operator_id` from Get Operators. e.g. 53 |
| utility_acc_no | string | yes | Bill / account number. Prepaid recharge → customer mobile. |
| confirmation_mobile_no | string | yes | Customer mobile. e.g. 9903457748 |
| sender_name | string | yes | Customer name. e.g. Asaad |
| category | number | yes | `operator_category_id` from Get Categories. e.g. 8 |
| amount | number | yes | INR — must equal Fetch Bill `amount` for bill pay. e.g. 2870 |
| utilitycustomername | string | no | From Fetch Bill — **required** when bill fetch was done. Omit for prepaid recharge. |
| client_ref_id | string | yes | Same as matching Fetch Bill; **fresh** on every retry. |
| source_ip | string | yes | Originating client IP. |
| district_discome | string | no | Operator **190 (UPPCL)** only — same as Fetch Bill. |
| communication | number | no | `0` online (default) / `1` offline — same as Fetch Bill. |
| *(dynamic)* | — | varies | Every `param_name` from Get Operator Parameters (same as Fetch) |

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
| data.tid | string | Eko txn id — store always (including failures / 208) |
| data.tx_status | string | `0` = success |
| data.txstatus_desc | string | Human-readable status |
| data.status_text | string | Biller status label |
| data.amount | string | Amount paid |
| data.totalamount | string | Total debited incl. fee |
| data.fee / tds / commission | string | Fee components |
| data.balance | string | Agent wallet balance after payment |
| data.operator_name | string | Biller name |
| data.utilitycustomername | string | Customer name on bill |
| data.customermobilenumber | string | Customer mobile |
| data.account | string | Account / consumer number paid |
| data.approvalreferencenumber | string | Biller approval ref (if any) |
| data.payment_mode_desc | string | Payment mode |
| data.user_code | string | Agent user code |
| data.last_used_okekey | string | Last used OkeKey |
| data.timestamp | string | Transaction timestamp |

## Response types

| response_type_id | Meaning | Next step |
| --- | --- | --- |
| 333 | Payment successful — persist `tid` + `client_ref_id` | — |
| 208 | Amount mismatch — re-fetch bill, new `client_ref_id`; persist `tid` first | Fetch Bill |
| -1 | Required field missing | Fix body |

## Example request

```json
{
  "initiator_id": "9962981729",
  "phone_operator_code": "53",
  "utility_acc_no": "3287820071",
  "confirmation_mobile_no": "9903457748",
  "sender_name": "Asaad",
  "category": 8,
  "amount": 2870,
  "utilitycustomername": "Amit Kumar",
  "client_ref_id": "2026010100123456789",
  "source_ip": "192.168.1.1",
  "district_discome": "Lucknow-MVVNL",
  "communication": 0
}
```

## Example response

`response_type_id` `333`

```json
{
  "response_status_id": 0,
  "data": {
    "tx_status": "0",
    "txstatus_desc": "Success",
    "status_text": "SUCCESS",
    "tid": "3570553488",
    "amount": "2870.0",
    "totalamount": "2870.0",
    "fee": "0.0",
    "tds": "0.024",
    "commission": "1.2",
    "balance": "46537.3",
    "user_code": "35739001",
    "operator_name": "B.E.S.T Mumbai",
    "utilitycustomername": "Amit Kumar",
    "customermobilenumber": "9903457748",
    "payment_mode_desc": "CASH",
    "last_used_okekey": "203",
    "account": "3287820071",
    "timestamp": "2026-07-25T09:52:57.428Z"
  },
  "response_type_id": 333,
  "message": "Success Last_used_OkeyKey: 203",
  "status": 0
}
```

## Error scenarios

| Status | response_type_id | Scenario |
| --- | --- | --- |
| 200 | 208 | Amount ≠ fetched bill — re-fetch + fresh `client_ref_id` |
| 200 | -1 | Required field missing |

## AsanPay notes

### Bill pay vs prepaid recharge

| Flow | Fetch Bill | `utilitycustomername` | `amount` source |
|------|------------|----------------------|-----------------|
| Bill pay | Required (when `fetchBill=1`) | From Fetch | Exact Fetch `amount` |
| Prepaid / DTH recharge | Skip | Omit | Plan amount or manual |

### Idempotency / retry

- Same `client_ref_id` for Fetch → Pay of one attempt.
- On **208** or retry: **new** `client_ref_id`; always save `tid` first.
- Param set must match Fetch Bill (including `district_discome` / `communication`).
