# PaySprint — Overview (Getting Started)

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

**Provider:** PaySprint (Unified Open API Platform)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages 1–3) + product catalog across Doc 1 + Doc 2

---

## Positioning (provider)

PaySprint is a NexGen banking fintech **Unified Open API** platform for B2B partners (startups, MSMEs, NBFCs, BCs, enterprises). Banks & travel partners remain custodians of customers/products; PaySprint provides API distribution.

### Benefits (provider marketing)

- Open platform bringing solutions together
- Faster integration / paperless onboarding
- Choose your bank
- Value-added services + dedicated support
- Single dashboard / plug-and-play
- **Common wallet** for transactions

### Product catalog named on Getting Started

| Area | Notes |
|------|-------|
| Payouts | IMPS / NEFT |
| AEPS | Withdrawals, balance, etc. |
| BBPS / Fastag | Bill payments / collections (named; **not in these two PDFs as full API suites**) |
| Micro ATM | Instant deposits/withdrawals |
| Recharge | Phone / TV (named; not in these PDFs) |
| Verification | Email, GST, documents (named) |
| KYC / Insurance | Named |
| Bank Account | Named |
| Loans | Named |
| Travel | Flights, hotels, bus, train — see Doc 2 |

> Full API archives for suites present in the attached PDFs live under `Unimplemented/` (see README index).

### Getting started (provider)

1. Review API documentation
2. Obtain UAT credentials (JWT, AES, PartnerId, Authorisedkey)
3. Whitelist India IP / host in India
4. Integrate JWT auth → call Balance / product APIs
5. Go Live (credentials differ; Authorisedkey not needed on Live per auth page)

### Gotchas

- Getting Started page is marketing — no REST endpoint.
- BBPS / Recharge / Insurance mentioned but **not** covered in Doc 1/2 extracts → need separate PDFs.
- Do not mix InstantPay rails with PaySprint — different auth (JWT vs InstantPay headers).

### Related

- [`AUTHENTICATION.md`](AUTHENTICATION.md)
- [`CREDENTIALS.md`](CREDENTIALS.md)
- [`BALANCE.md`](BALANCE.md)
