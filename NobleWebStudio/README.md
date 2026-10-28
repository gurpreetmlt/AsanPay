# Noble Web Studio API (NOBLE APIs)

> **Purpose:** AsanPay me Noble Web Studio provider integrate karne se pehle ye folder padho.
> **Audience:** Humans + AI coding agents (Cursor / Claude / etc.).
> **Source:** Official Postman Documenter — [NOBLE APIs](https://documenter.getpostman.com/view/45133648/2sB3QJPqzn)
> **Collection name:** `NOBLE APIs`
> **Status:** Docs only (not wired in AsanPay code yet)
> **Last generated:** 2026-10-21

## How AI tools should use this folder

1. Read **`OVERVIEW.md`** first (auth, hosts, headers, rules).
2. Pick the service file you need (`AEPS.md`, `DMT.md`, …).
3. Use **`ENDPOINTS_INDEX.md`** for a flat method+URL cheat sheet.
4. Do **not** invent hosts or auth — copy from these docs.
5. Secrets (`apiKey` / `apiValue` / Bearer token) live in Coolify env only — never commit.

## Services

| Doc | Domain | Host(s) | Endpoints |
|-----|--------|---------|-----------|
| [OVERVIEW.md](OVERVIEW.md) | Auth + conventions | — | — |
| [AUTH.md](AUTH.md) | Client login → Bearer | `service.noblewebstudio.in` | 1 |
| [AEPS.md](AEPS.md) | AEPS / Aadhaar Pay / CD / UPI QR / onboarding | `aeapi.noblewebstudio.in` | 21 |
| [DMT.md](DMT.md) | Airtel / Jio / Fino DMT + Bene | `dmt.noblewebstudio.in` | 26 |
| [RECHARGE.md](RECHARGE.md) | Mobile / DTH recharge | `rcapi.noblewebstudio.in` | 9 |
| [VERIFICATION.md](VERIFICATION.md) | Aadhaar / PAN / GST / CIN / Bank | `service.noblewebstudio.in` | 12 |
| [OCR.md](OCR.md) | Aadhaar / PAN OCR | `service.noblewebstudio.in` | 2 |
| [CMS.md](CMS.md) | Airtel CMS | `cms.noblewebstudio.in` | 2 |
| [COMMON.md](COMMON.md) | Balance check | `service.noblewebstudio.in` | 1 |
| [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md) | All endpoints flat list | — | 74 |

## AsanPay implementation notes (for later)

- Prefer the **provider adapter** pattern: one internal API, swap Noble behind env.
- Map Noble rails to existing AsanPay products carefully (AEPS / DMT / Recharge) — a second provider needs an explicit mode.
- Fingerprint / PID XML / lat-long rules must match Noble request schemas in service docs.
- Never log full `apiKey`, Bearer tokens, or biometric PID blobs.

## Source link

- Postman: https://documenter.getpostman.com/view/45133648/2sB3QJPqzn
