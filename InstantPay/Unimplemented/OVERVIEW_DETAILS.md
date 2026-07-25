# InstantPay — Overview — Implementation Details

> Compact auth/platform notes for implementers. Full prose: [`OVERVIEW.md`](OVERVIEW.md). Folder: `InstantPay/Unimplemented/` — implement hone pe root me service doc bane.

**Last updated:** 2026-07-20

---

## Product offerings (InstantPay catalog)

| Product | Capabilities | Docs |
|---------|--------------|------|
| Connected Banking | A/C Management, Payouts, Collections, Reconciliation, Reporting | [Banking overview](https://developers.instantpay.in/reference/banking-overview) |
| Payments | Static QR, POS | [Payouts API](https://developers.instantpay.in/reference/payouts-api) |
| Cards | Gift Card, Expense Card | [Gift Cards](https://developers.instantpay.in/reference/gift-cards) |
| Payouts | Single, Bulk, Payout Links | [Payouts API](https://developers.instantpay.in/reference/payouts-api) |
| Identity | Financial / Individual / Business Verification, GEO, AI/ML | [Identity overview](https://developers.instantpay.in/reference/identity-verification-overview) |

AsanPay Identity work (Asset Verification / OKYC): see [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md).

---

## API style InstantPay uses

- **Primary:** REST over HTTP, JSON
- Auth: Client credentials headers **or** JWT in headers
- Endpoints = base URL + path; params in body/URL; response = status + `data`

---

## Testing credentials (staging)

| Credential | Meaning |
|------------|---------|
| `client_id` | Unique client id → `X-Ipay-Client-Id` |
| `client_secret` | Client secret → `X-Ipay-Client-Secret` |
| `module_secret` | Module-scoped secret (some APIs) |
| `provider_secret` | Provider-scoped (some modules only) |

Rules:
- Staging credentials **only** on staging
- Live credentials issued **separately** after UAT
- Do not share credentials outside approved team

---

## JWT

| Item | Value |
|------|-------|
| Standard | RFC 7519 |
| Default TTL | **15 minutes** |
| Grant types | `client_credentials`, `refresh_token`, `user_credentials` |

### client_credentials
`grant_type`, `client_id`, `client_secret`

### refresh_token
`grant_type`, `refresh_token` (from prior JWT response)

### user_credentials
`grant_type`, `email`, `password` (InstantPay dashboard)

### Usage
Pass JWT in headers instead of client id/secret. All InstantPay APIs accept **both** methods.

---

## Shared Identity HTTP headers (reference)

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | Fixed `"1"` |
| `X-Ipay-Client-Id` | From InstantPay |
| `X-Ipay-Client-Secret` | From InstantPay |
| `X-Ipay-Endpoint-Ip` | End-customer IP (some APIs: partner-supplied) |

Common envelope: `statuscode`, `actcode`, `status`, `data`, `timestamp`, `ipay_uuid`, `orderid`, `environment`, `internalCode`.

---

## Source

[`OVERVIEW.md`](OVERVIEW.md)
