# PaySprint — CMS — Implementation Details

> Compact cheat-sheet. Full: [`CMS.md`](CMS.md).
**Base URL (Live):** `https://api.paysprint.in/service-api/api/v1/service`
**Last updated:** 2026-07-20

## 1. What it is

Airtel CMS (Bank1) + CMS Bank2 URL/callback/posting APIs.

## 2. Auth

JWT `Token` + UAT `Authorisedkey`. Env: `PAYSPRINT_*` (see AUTHENTICATION_DETAILS).

## 3. Page / API matrix

| # | Page / API | Endpoint | Status |
|---|------------|----------|--------|
| 1 | generate-url-7 | `POST /airtelcms/V2/airtel/index` | 📄 |
| 2 | airtel-cms-v2-transaction-status-enquiry | `POST /airtelcms/airtel/status` | 📄 |
| 3 | generate-url-10 | `POST /cms/initiate/index` | 📄 |

## 4. Implement fields

Prefer generate-url + callback + status/enquiry. Confirm which bank pipe AsanPay will use.

## 5. Flows

1. Generate URL for merchant/agent
2. User completes CMS UI
3. Callback + enquiry APIs for reconciliation


## 6. Gotchas

- External host `uat.cmscollections.in` for Airtel UI
- JWT in query string — treat as secret

## 7. Provider checklist

- [x] CMS paths captured
- [ ] Choose Bank1 vs Bank2
- [ ] Callback URL setup

## Source

[`CMS.md`](CMS.md) · [`AUTHENTICATION.md`](AUTHENTICATION.md)
