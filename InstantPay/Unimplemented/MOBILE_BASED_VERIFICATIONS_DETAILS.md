# InstantPay — Mobile Based Verifications — Implementation Details

> Compact cheat-sheet. Full pages: [`MOBILE_BASED_VERIFICATIONS.md`](MOBILE_BASED_VERIFICATIONS.md). Auth: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao.
> **Workflow:** har nayi Mobile Based Verifications page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON
**Status:** Docs captured (Address · VPA · Name · Profile · PAN · EPFO UAN) — not wired yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Mobile Based Verifications** (InstantPay) |
| Rails | Address · VPA · Name · Profile · PAN · **EPFO UAN** |
| Fees (sample) | Addr **0.00** · VPA **3.54** · Name **1.18** · Profile **TBD** · PAN **2.36** · EPFO **5.90** LIVE |

Sibling docs: [`DIGITAL_KYC_DETAILS.md`](DIGITAL_KYC_DETAILS.md), [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | `"1"` |
| `X-Ipay-Client-Id` / `X-Ipay-Client-Secret` | InstantPay |
| `X-Ipay-Endpoint-Ip` | Most **M / Y** · VPA **M / N** |

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
MOBILE_BASED_VERIFICATION_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | Mobile to Address | `POST /identity/mobile/addressLookup` | 📄 |
| 2 | Mobile to UPI VPA | `POST /identity/mobile/vpaLookup` | 📄 |
| 3 | Mobile to Name | `POST /identity/mobile/nameLookup` | 📄 |
| 4 | Mobile to Profile | `POST /identity/mobile/dataLookup` | 📄 |
| 5 | Mobile to PAN | `POST /identity/mobile/panLookup` | 📄 |
| 6 | Mobile → EPFO UAN | `POST /identity/corporateEmpCheck` | 📄 |

---

## 4–8. Quick map

| # | Phone field | Consent | Key response | Fee sample |
|---|-------------|---------|--------------|------------|
| 1 | `mobileNumber` | Y | `addressData` | 0.00 SB |
| 2 | `mobileNumber` | Y/N | `vpaData` | 3.54 LIVE |
| 3 | `mobileNumber` | Y | `mobileLinkedName` (± nested) | 1.18 LIVE |
| 4 | `mobileNumber` + names | — | `result` profile | TBD |
| 5 | `mobileNumber` | — | `panData` | 2.36 SB |
| 6 | **`customerPhoneNumber`** | Y | **`employeData`** | **5.90** LIVE |

---

## 9. Mobile Number to EPFO UAN — implement fields

**URL:** `POST https://api.instantpay.in/identity/corporateEmpCheck`
**operationId:** `identity-verification-mobile-number-epfo-uan`

| Param | M/O | Notes |
|-------|-----|-------|
| `customerPhoneNumber` | M | Not `mobileNumber` |
| `consent` | M | Sample `"Y"` |
| `latitude` / `longitude` | M | End customer; sample numbers |
| `externalRef` | M | Unique txn id |

| Response | Notes |
|----------|-------|
| `data.employeData` | Provider typo — keep spelling |
| `.personalDetails` | gender, DOB, fullName, phone |
| `.employmentDetails` | `isEmployed`, `uanList`, `uanCount`, recent + previous employers |
| `data.pool` | `referenceId`, `openingBalance`, **`paymentAmount`**, `closingBalance`, `mode` |
| Fee | Sample **`5.90`** (LIVE) |

### Gotchas

- Path not under `/mobile/`.
- Different phone + pool field names vs siblings.
- Parse `employeData` as-is.

---

## 10. Provider checklist

- [x] Address · VPA · Name · Profile · PAN · EPFO UAN
- [ ] Clean Profile response + fee re-paste
- [ ] Confirm live fees
- [ ] Remaining sidebar pages (if any)
- [ ] IP allowlist
- [ ] Wire AsanPay (PARITY)

---

## Source docs

| Doc | Role |
|-----|------|
| [`MOBILE_BASED_VERIFICATIONS.md`](MOBILE_BASED_VERIFICATIONS.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
