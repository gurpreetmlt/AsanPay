# PaySprint — Callbacks

> **Cheat-sheet:** [`CALLBACKS_DETAILS.md`](CALLBACKS_DETAILS.md).

**Provider:** PaySprint (Callbacks)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~51–74)

### Shared notes

- These are **inbound webhooks** to partner servers (HTTPS).
- Auth/signing details incomplete in PDF extract — confirm with PaySprint (IP allowlist / HMAC / shared secret).
- Always idempotent-process; pair with status query APIs.

### PDF / OpenAPI pollution

- Placeholder server `xyz.xyz.in` / sample hosts — use PaySprint Live/UAT
- Copy-paste operationIds; prefer tables + curl
- Mask secrets/PII (`xxxxx`)


---

## Service-wise status

| # | Callback | Direction | Status |
|---|----------|-----------|--------|
| 1 | AEPS/MATM Merchant Onboarding | PaySprint → Partner | 📄 |
| 2 | Payout Transaction | PaySprint → Partner | 📄 |
| 3 | MATM Cash Withdraw Success | PaySprint → Partner | 📄 |
| 4 | MATM Cash Withdraw Failed | PaySprint → Partner | 📄 |
| 5 | MATM Balance Enquiry Success | PaySprint → Partner | 📄 |
| 6 | MATM Balance Enquiry Failed | PaySprint → Partner | 📄 |
| 7 | Onboard Status | PaySprint → Partner | 📄 |
| 8 | Bus Ticket Booking | PaySprint → Partner | 📄 |

---

## 1. Merchant Onboarding Callback

**Title (provider):** AEPS/MATM MERCHANT ONBOARDING

Partner receives onboard progress/result for merchants.

### Sample response handling

Success vs failed bodies documented under RESPONSE HANDLING / HANDING (typo).

```json
{ "status": 400, "message": "Transaction failed" }
```

### Gotchas

- Treat unknown statuses as pending until status API confirms
- Mask mobile/Aadhaar in logs

---

## 2. Payout Transaction Callback

Async payout terminal state. Correlate to `dotransaction` reference.

### Gotchas

- Duplicate callbacks possible — upsert by provider ref
- See [`PAYOUT.md`](PAYOUT.md)

---

## 3–6. MATM Transaction Callbacks

Separate success/failed for **cash withdraw** and **balance enquiry**.

### Gotchas

- Still run three-way recon APIs ([`MATM.md`](MATM.md))
- Do not mark success only on callback without recon where required

---

## 7. Onboard Status Callback

Push complement to `getonboardstatus` poll.

---

## 8. Bus Ticket Booking Callback

See [`BUS_TICKET.md`](BUS_TICKET.md).

### Related

- [`ONBOARDING.md`](ONBOARDING.md) · [`MATM.md`](MATM.md) · [`PAYOUT.md`](PAYOUT.md) · [`BUS_TICKET.md`](BUS_TICKET.md)
