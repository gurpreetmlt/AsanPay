# InstantPay — Location Services — Implementation Details

> Compact cheat-sheet. Full pages: [`LOCATION_SERVICES.md`](LOCATION_SERVICES.md). Auth: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao.
> **Workflow:** har nayi Location Services page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON
**Status:** Docs captured (full GEO suite) — not wired in AsanPay yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Location Services** / **GEO Intelligence** (InstantPay) |
| Use | Precise location data — targeting, logistics, security, maps/CX |
| Rails | **IP Lookup** · **PIN Code Lookup** · **Reverse Geocoding** |
| APIs | Overview (#1) · IP (#2) · PIN (#3) · Reverse Geo (#4) |
| Fees (sample) | IP / PIN **~0.12** · Reverse Geocoding **~1.18** |

Sibling docs: [`FINANCIAL_VERIFICATION_DETAILS.md`](FINANCIAL_VERIFICATION_DETAILS.md), [`DIGITAL_KYC_DETAILS.md`](DIGITAL_KYC_DETAILS.md), [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | `"1"` (typical) |
| `X-Ipay-Client-Id` / `X-Ipay-Client-Secret` | InstantPay |
| `X-Ipay-Endpoint-Ip` | **M / Y** on all three APIs — end-customer IP |

JWT alt: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

### Env (proposed)

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
LOCATION_SERVICES_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | GEO Intelligence — Overview | — (concept) | 📄 |
| 2 | IP Lookup | `POST /identity/ip/lookup` | 📄 |
| 3 | PIN Code Lookup | `POST /identity/pincode/lookup` | 📄 |
| 4 | Reverse Geocoding | `POST /identity/reverseGeocoding` | 📄 |

---

## 4. GEO Intelligence — Overview

| Item | Value |
|------|-------|
| Purpose | Location insights for targeting, logistics, CX |
| IP Lookup | IP → geo + security flags |
| PIN Code Lookup | PIN → district/state/GST/geo |
| Reverse Geocoding | Lat/long → formatted address + components |
| REST on overview page | **None** |

---

## 5. IP Lookup — implement fields

**URL:** `POST https://api.instantpay.in/identity/ip/lookup`
**operationId:** `geo-intelligence-ip-lookup`

| Param | M/O | Notes |
|-------|-----|-------|
| `ip` | M | IP to look up |
| `latitude` / `longitude` | M | End customer coords (call context) |
| `externalRef` | M | Unique txn id |

| Response | Notes |
|----------|-------|
| `data.ipData` | location, security, currency, timeZone, … |
| `data.pool*` | Sample fee **`0.12`** |

---

## 6. PIN Code Lookup — implement fields

**URL:** `POST https://api.instantpay.in/identity/pincode/lookup`
**operationId:** `geo-intelliegence-pin-code-lookup` (typo in provider id)

| Param | M/O | Notes |
|-------|-----|-------|
| `pincode` | M | Postal PIN (docs sample wrongly used an IP) |
| `latitude` / `longitude` | M | End customer coords |
| `externalRef` | M | Unique txn id |
| Method | — | **POST** — ignore OpenAPI `get` |

| Response | Notes |
|----------|-------|
| `data.pincodeDetails` | district, state*, gstStateCode, geoLat/geoLong; `city` may be `""` |
| `data.pool*` | Sample fee **`0.12`** |

---

## 7. Reverse Geocoding — implement fields

**URL:** `POST https://api.instantpay.in/identity/reverseGeocoding`
**operationId:** `geo-intelligence-reverse-geo-coding`
**OpenAPI title:** `identity-georeverse` v1.0

| Param | M/O | Notes |
|-------|-----|-------|
| `latitude` / `longitude` | M | **Location to reverse** (param table). Sample = JSON **numbers**. |
| `externalRef` | M | Unique txn id |
| Body | JSON | POST — no separate target field |

| Response | Notes |
|----------|-------|
| `data.reverseGeocodingDetail` | Singular key |
| `.formattedAddress` | Primary UI string |
| `.addressComponents[]` | longName / shortName / types |
| `.geometry` | location, locationType, viewport |
| `.placeId` / `.types` | Place id + categories |
| `data.pool*` | `mode: DR`, sample fee **`1.18`** |
| Success | `statuscode: TXN`, `status: Transaction Successful` |

### Gotchas

- Lat/long here = coords being geocoded (unlike IP/PIN “end customer” pair + separate target).
- OpenAPI says string; sample uses numbers — coerce safely.
- Fee ~10× IP/PIN sample.

---

## 8. Provider checklist

- [x] GEO Intelligence Overview
- [x] IP Lookup (Endpoint-Ip Y; fee ~0.12)
- [x] PIN Code Lookup (Endpoint-Ip Y; fee ~0.12; POST not GET)
- [x] Reverse Geocoding (Endpoint-Ip Y; fee ~1.18)
- [ ] Confirm live pool / fee vs sandbox
- [ ] IP allowlist
- [ ] Wire AsanPay (backend + web + mobile per PARITY)

---

## Source docs

| Doc | Role |
|-----|------|
| [`LOCATION_SERVICES.md`](LOCATION_SERVICES.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
