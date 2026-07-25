# InstantPay — Collect

> Raw InstantPay Collect docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`COLLECT_DETAILS.md`](COLLECT_DETAILS.md). Jab implement ho → root `InstantPay/COLLECT.md` (AEPS-style) banega.

**Provider:** InstantPay (Collect)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

---

## Service-wise status

| # | Page / Service | InstantPay area | Status |
|---|----------------|-----------------|--------|
| 0 | Overview | Collect — virtual accounts + inbound payments | 📄 Docs captured |
| 1 | UPI Stack — QR (Static) | Static BHIM UPI QR (construct URI + webhook) | 📄 Docs captured |
| 2 | Virtual Accounts | VBA collect — IMPS/NEFT/RTGS + webhook | 📄 Docs captured |

---

## 0. Overview

**Title (provider):** Overview

Managing customer payments with **Instantpay Collect** — simplify receiving bank transfers and UPI payments.

### Capabilities (from overview)

| Item | Detail |
|------|--------|
| **Modes** | NEFT, RTGS, IMPS (+ UPI payments mentioned) |
| **Virtual accounts** | Each customer gets a **unique virtual account** |
| **Flow** | Share VBA details → customer pays → notify → funds to Instantpay → settle to your account |
| **Outcomes** | Control + visibility per txn, clearer inbound records, better reconciliation, less admin, cash-flow management |

### Provider positioning

- Streamlines receiving payments and improves reconciliation.
- Helps track whether all customer payments are received.
- Aimed at business growth with lower admin overhead.

> Overview only — no endpoint on this page. Next pastes: Collect APIs (create VBA, webhooks, settlement, statements, etc.).

---

## 1. UPI Stack — QR (Static)

**Title (provider):** QR (Static)

Collect money in-store (**Person to Merchant**) via **Static BHIM UPI QR**.

### Positioning

| Item | Detail |
|------|--------|
| **Use case** | In-store / counter P2M collection |
| **QR type** | **Static** BHIM UPI — customer scans with any UPI app |
| **Benefits** | Fast, contactless, lower wait times, cashless |
| **API style** | No InstantPay “generate QR” REST call on this page — **build UPI intent string** yourself, encode as QR |

### QR payload (provider template)

```
upi://pay?pa={assigned-vpa}.{sub-string}@icici&pn={merchant-name}&tn={optional-txn-notes}&am={optional-amount}&cu=INR
```

| Placeholder | Meaning |
|-------------|---------|
| `{assigned-vpa}` | VPA assigned by InstantPay (prefix before `.`) |
| `{sub-string}` | Suffix after `.` in `pa` — optionally **Outlet ID** so store name shows (via Customer Onboarding API) |
| `{merchant-name}` | `pn` — merchant display name |
| `{optional-txn-notes}` | `tn` — optional |
| `{optional-amount}` | `am` — optional (omit for open amount) |
| `cu=INR` | Currency fixed INR |
| Host PSP | Sample uses **`@icici`** — confirm assigned VPA host on staging |

### Provider notes

1. **Webhook** — configure payment notifications; optionally integrate **Customer Onboarding API** and pass **Outlet ID** in `{sub-string}` to show store name at payment time.
2. Webhook setup UI: [app.instantpay.in/developers/subscribe](https://app.instantpay.in/developers/subscribe) → Setup Webhook on Credentials.
3. Partner exposes a URL; InstantPay sends a **GET** with query parameters (final status via callback). Pending txns later become **SUCCESS** or **REFUND**.
4. Enable logs on the webhook URL. After Update on portal, InstantPay hits the URL; find `ipayid` (or `ipay_id`) in the hit and paste it back on InstantPay portal to verify.

### Webhook callback (provider text — cleaned)

Provider paste is garbled (`ipay*id`, `agent* id`, `s tatus`, PHP concatenation). Likely query shape:

```
GET {your-webhook-url}?ipay_id={cb_ipay_id}&agent_id={your_ref_id}&opr_id={value}&status=SUCCESS&res_code=TXN&res_msg={msg}
```

| Param (inferred) | Notes |
|------------------|-------|
| `ipay_id` / `ipayid` | InstantPay txn / callback id — used for portal webhook verify |
| `agent_id` | Partner reference (`your_ref_id`) |
| `opr_id` | Operator / bank ref |
| `status` | e.g. `SUCCESS` (also pending → later `SUCCESS` / `REFUND`) |
| `res_code` | e.g. `TXN` |
| `res_msg` | Message (may be empty) |

> Confirm **exact** query key names on a live/sandbox hit — do not trust the broken markdown alone.

### Gotchas

- This page documents **URI construction + webhook**, not a `POST /…/generateQr` Collect API.
- Static QR: amount/`tn` optional — open-amount QR if `am` omitted.
- `{sub-string}` + Outlet ID + Customer Onboarding = store name on customer UPI screen (confirm Onboarding API paste separately).
- Webhook is **GET** (unusual vs many POST JSON webhooks) — implement GET handler + logging.
- Pending → final only when status becomes SUCCESS or REFUND.
- Portal verify step needs `ipayid` from first test hit.
- PSP host in template is `@icici` — may be assignment-specific.

### Related

- Collect Overview (#0)
- Webhooks (platform): InstantPay developers subscribe UI
- Customer Onboarding API (referenced; page not yet archived here)

---

## 2. Virtual Accounts

**Title (provider):** Virtual Accounts

Collect from customers and vendors using **Virtual Bank Account Numbers** with **real-time settlement** into your bank account. Modes: **IMPS, NEFT, RTGS**. Positioned for **large-value** collections.

### Capabilities (from page)

| Item | Detail |
|------|--------|
| **Instrument** | Unique Virtual Bank Account Numbers |
| **Modes** | IMPS, NEFT, RTGS |
| **Settlement** | Direct into bank account, **real time** |
| **Use cases** | Large-value txns, multiple payments, high-value collections |
| **Benefits** | Streamlined collection, fewer delays, better cash flow, less manual reconciliation, better partner payment experience |

### Provider positioning

Same narrative as Connected Banking VBA overview ([`BANKING.md`](BANKING.md) #0) — keep Collect vs Banking docs separate until implement clarifies product overlap / shared APIs.

### Webhooks

Configure from [app.instantpay.in/developers/subscribe](https://app.instantpay.in/developers/subscribe).

- Partner URL receives InstantPay **GET** with query parameters.
- Final status via callback; pending → later **SUCCESS** or **REFUND**.
- Enable logs; after Update, capture `ipayid` from test hit and paste on InstantPay portal to verify.
- Callback docs: [developers.instantpay.in/docs/webhooks](https://developers.instantpay.in/docs/webhooks)

### Webhook callback (provider text — cleaned)

Provider paste garbled (same as Static QR). Likely:

```
GET {your-webhook-url}?ipay_id={cb_ipay_id}&agent_id={your_ref_id}&opr_id={value}&status=SUCCESS&res_code=TXN&res_msg={msg}
```

| Param (inferred) | Notes |
|------------------|-------|
| `ipay_id` / `ipayid` | InstantPay callback id — portal verify |
| `agent_id` | Partner reference |
| `opr_id` | Operator / bank ref |
| `status` | e.g. `SUCCESS` (pending → `SUCCESS` / `REFUND`) |
| `res_code` | e.g. `TXN` |
| `res_msg` | Message |

> Confirm exact query keys on a live/sandbox hit.

### Gotchas

- Overview page only — **no create/list VBA REST** on this paste; expect later Collect VBA API pages.
- Webhook model matches Collect Static QR (#1) — likely shared Collect webhook channel; confirm if one URL covers UPI QR + VBA.
- Near-duplicate of Banking Connected Banking VBA overview — product routing (Collect vs Banking) TBD at implement.
- Webhook is **GET**, not POST JSON.

### Related

- Collect Overview (#0)
- UPI Stack — QR Static (#1) — same webhook setup text
- Banking Overview — Virtual Bank Accounts ([`BANKING.md`](BANKING.md) #0)
- Platform webhooks doc (link above)

---
