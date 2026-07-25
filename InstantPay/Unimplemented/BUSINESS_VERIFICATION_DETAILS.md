# InstantPay — Business Verification — Implementation Details

> Compact cheat-sheet for AsanPay implementers. Full samples/OpenAPI: [`BUSINESS_VERIFICATION.md`](BUSINESS_VERIFICATION.md). Auth: [`OVERVIEW.md`](OVERVIEW.md) · [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao; is DETAILS ko source maano.
> **Workflow:** har nayi Business Verification page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON (LEI = **GET** + query)
**Status:** Docs captured — not wired in AsanPay yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Business Verification** (InstantPay Identity family) |
| APIs so far | LEI · FSSAI · TAN Plus · Udyam · MCA Fetch CIN · MCA Fetch Profile |
| LEI | 20-char alphanumeric global legal-entity id |
| Lookup types (LEI) | `NAME`, `BIC`, `ISIN`, `LEI` |
| FSSAI | Food license verify via `fssaiNumber` + consent |
| TAN Plus | Tax Deduction Account Number + enrichment (`tanDetail`) |
| Udyam | MSME registration via `udyamNumber` → `udyamDetails` |
| MCA Fetch CIN | Company name → list of `{ companyID (CIN), companyName }` |
| MCA Fetch Profile | CIN → `companyData` + pool (~5.90) |

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | `"1"` |
| `X-Ipay-Client-Id` / `X-Ipay-Client-Secret` | InstantPay |
| `X-Ipay-Endpoint-Ip` | End-customer IP — provider table says Provided=Y; confirm vs usual partner-supplied |

JWT alt: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

### Env / config (proposed — when implementing)

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
# Business Verification mode (proposed)
BUSINESS_VERIFICATION_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | LEI Verification | `GET /identity/lei` | 📄 |
| 2 | FSSAI Verification | `POST /identity/verifyFssai` | 📄 |
| 3 | TAN Verification Plus | `POST /identity/verifyTan` | 📄 |
| 4 | Udyam Verification | `POST /identity/udyam` | 📄 |
| 5 | MCA — Fetch CIN | `POST /identity/company/lookup/cin` | 📄 |
| 6 | MCA — Fetch Profile | `POST /identity/company/lookup` | 📄 |

---

## 4. LEI Verification — implement fields

**URL:** `GET https://api.instantpay.in/identity/lei`

### Query

| Param | M/O | Notes |
|-------|-----|-------|
| `value` | M | For `type=LEI`: 20-char code |
| `type` | M | `NAME` \| `BIC` \| `ISIN` \| `LEI` |
| `externalRef` | M | Unique txn id |
| `latitude` / `longitude` | M | End customer |
| `pagination[pageNumber]` | O | Page |
| `pagination[recordsPerPage]` | O | Page size |
| `consent` | ? | In OpenAPI body only — **not** in param table/sample |

### Response highlights

| Path | Notes |
|------|-------|
| `data.pool*` | Chargeable debit (`mode: DR`) |
| `data.meta` | Pagination meta |
| `data.record[]` | LEI + `entity` + `registration` + ids |
| `orderid` | Often = `poolReferenceId` |

### Suggested Adhikari route

```
GET /api/business-verification/lei  → InstantPay GET /identity/lei?…
```

(Or `POST` proxy that maps body → query — confirm product preference.)

---

## 4b. FSSAI Verification — implement fields

**URL:** `POST https://api.instantpay.in/identity/verifyFssai`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `fssaiNumber` | M | License number |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| `consent` | M | Sample `"Y"` |
| `dob` | — | OpenAPI only — ignore |

### Response highlights

| Path | Notes |
|------|-------|
| `data.fassaiDetail` ⚠️ | Typo key (not `fssaiDetail`) — company, address, `licenseActiveFlag`, status |
| `data.pool` | `referenceId`, balances, `paymentAmount`, `mode: DR` |
| `orderid` | = pool `referenceId` in sample |

### Suggested Adhikari route

```
POST /api/business-verification/fssai  → InstantPay POST /identity/verifyFssai
```

---

## 4c. TAN Verification Plus — implement fields

**URL:** `POST https://api.instantpay.in/identity/verifyTan`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `tanNumber` | M | TAN |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| `consent` | M | Sample `"Y"` |

### Response highlights

| Path | Notes |
|------|-------|
| `data.tanDetail` | Name, allotment date (`DD-MM-YYYY`), address lines, email, phone |
| `data.pool` | **Fee** sample `paymentAmount: "3.54"` DR |
| `orderid` | = pool `referenceId` in sample |

### Suggested Adhikari route

```
POST /api/business-verification/tan  → InstantPay POST /identity/verifyTan
```

---

## 4d. Udyam Verification — implement fields

**URL:** `POST https://api.instantpay.in/identity/udyam`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `udyamNumber` | M | e.g. `UDYAM-XX-##-…` |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| `consent` | M | Sample `"Y"` |

### Response highlights

| Path | Notes |
|------|-------|
| `data.udyamDetails` | Enterprise, units[], officialAddress, DIC/MSME DI, dates |
| `officialAddress.NameOfPremisesOrBuilding` | PascalCase key |
| Dates | `DD/MM/YYYY` (slashes) |
| `data.pool` | Fee sample `paymentAmount: "3.54"` DR |

### Suggested Adhikari route

```
POST /api/business-verification/udyam  → InstantPay POST /identity/udyam
```

---

## 4e. MCA Company Search — Fetch CIN

**URL:** `POST https://api.instantpay.in/identity/company/lookup/cin`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `companyName` | M | Partial match OK |
| lat/long / `externalRef` / consent | — | **Not** in docs for this API |

### Response highlights

| Path | Notes |
|------|-------|
| `data[]` | Array of `{ companyID, companyName }` — `companyID` = CIN |
| `orderid` | `null` in sample; no `pool` |

### Suggested Adhikari route

```
POST /api/business-verification/mca/cin-lookup  → InstantPay POST /identity/company/lookup/cin
```

---

## 4f. MCA Company Search — Fetch Profile

**URL:** `POST https://api.instantpay.in/identity/company/lookup`

### Body

| Param | M/O | Notes |
|-------|-----|-------|
| `companyIdentityNumber` | M | CIN (= Fetch CIN `companyID`) |
| `latitude` / `longitude` | M | Location |
| `externalRef` | M | Unique txn id |
| `consent` | M | `"Y"` |

### Response highlights

| Path | Notes |
|------|-------|
| `data.pool*` | Fee sample `amount: "5.90"` |
| `data.companyData` | Profile; sample FLLP-shaped keys — confirm Indian co shape on staging |
| `data.companyData.directors[]` | `dinPan`, dates `DD/MM/YYYY` or `-` |

### Suggested Adhikari route

```
POST /api/business-verification/mca/profile  → InstantPay POST /identity/company/lookup
```

---

## 5. API summary

| Op | InstantPay | Notes |
|----|------------|-------|
| LEI Verification | `GET /identity/lei` | Query params only. Types: NAME/BIC/ISIN/LEI. Pool fee. Provider curl broken; OpenAPI GET+body/`consent` misleading. Success ≠ active LEI (`entity.status` / `registration.status`). |
| FSSAI Verification | `POST /identity/verifyFssai` | Body: `fssaiNumber`, consent, lat/long, `externalRef`. Response key **`fassaiDetail`**. OpenAPI stray `dob`. Sanitize leaked secrets in provider http sample. |
| TAN Verification Plus | `POST /identity/verifyTan` | Body: `tanNumber`, consent, lat/long, `externalRef`. Response `tanDetail` + chargeable pool (~3.54 in sample). Date `DD-MM-YYYY`. |
| Udyam Verification | `POST /identity/udyam` | Body: `udyamNumber`, consent, lat/long, `externalRef`. Response `udyamDetails` + fee ~3.54. OpenAPI title `udhyam`. Dates `DD/MM/YYYY`. |
| MCA Fetch CIN | `POST /identity/company/lookup/cin` | Body: `companyName` only. `data[]` with `companyID` (CIN). OpenAPI server+`/fetchCIN` double-path — trust curl. No pool in sample. |
| MCA Fetch Profile | `POST /identity/company/lookup` | Body: `companyIdentityNumber` + lat/long/`externalRef`/consent. Fee ~5.90. OpenAPI body wrongly `companyName`. Sample `companyData` looks FLLP-shaped. |

### Flow (LEI)

1. Collect lookup `type` + `value` (+ optional pagination).
2. Call GET with lat/long/`externalRef` + auth headers.
3. Show `record[]` entity/registration; surface inactive/retired clearly.
4. Persist `poolReferenceId` / `orderid` / `ipay_uuid` for audit.

### Flow (FSSAI)

1. Collect `fssaiNumber` + customer consent.
2. `POST /identity/verifyFssai` with lat/long/`externalRef`.
3. Read **`data.fassaiDetail`** (typo key) + `licenseActiveFlag` / `statusDescription`.
4. Persist `pool.referenceId` / `orderid` / `ipay_uuid`.

### Flow (TAN)

1. Collect `tanNumber` + customer consent.
2. `POST /identity/verifyTan` with lat/long/`externalRef`.
3. Show `tanDetail` (full name, address, contact, allotment date).
4. Persist pool / `orderid` / `ipay_uuid`; expect non-zero fee.

### Flow (Udyam)

1. Collect `udyamNumber` + consent.
2. `POST /identity/udyam` with lat/long/`externalRef`.
3. Show `udyamDetails` (enterprise, units, official address, registration dates).
4. Persist pool / `orderid` / `ipay_uuid`; expect fee ~TAN.

### Flow (MCA)

1. Fetch CIN: name → pick `companyID`.
2. Fetch Profile: `companyIdentityNumber` = that CIN + consent + lat/long/`externalRef`.
3. Show `companyData` (+ directors); persist pool / `orderid`.

### Dummy mode (when implementing)

- LEI: mock `TXN` + one `record` with sample LEI shape + pool debit; cover `INACTIVE` / `RETIRED`.
- FSSAI: mock `TXN` + `fassaiDetail` (keep typo key) + pool; cover active vs inactive flag.
- TAN: mock `TXN` + `tanDetail` + pool with non-zero `paymentAmount`.
- Udyam: mock `TXN` + `udyamDetails` (incl. `unitDetails[]`) + pool fee.
- Fetch CIN: mock `TXN` + `data[]` of 2–3 `{ companyID, companyName }`; `orderid: null`.
- Fetch Profile: mock `TXN` + `companyData` + pool `amount: "5.90"`.

---

## 6. Provider checklist

- [ ] Business Verification / Identity LEI module on staging
- [ ] FSSAI (`verifyFssai`) module on staging
- [ ] TAN Plus (`verifyTan`) module on staging
- [ ] Udyam (`/identity/udyam`) module on staging
- [ ] MCA Fetch CIN (`/identity/company/lookup/cin`) on staging
- [ ] MCA Fetch Profile (`/identity/company/lookup`) on staging
- [ ] Confirm LEI fee (`pool.amount`), FSSAI fee, TAN/Udyam fee (`paymentAmount` ~3.54 in samples)
- [ ] Confirm Fetch CIN fee (no pool in sample)
- [ ] Confirm Fetch Profile fee (~5.90)
- [ ] Confirm Indian company vs FLLP `companyData` shape for Fetch Profile
- [ ] Confirm LEI `consent` required or not
- [ ] Confirm Endpoint-Ip Provided Y vs partner-supplied
- [ ] Confirm NAME / BIC / ISIN lookup behaviour + pagination caps
- [ ] Confirm `fassaiDetail` spelling stable in live
- [ ] Confirm TAN date format always `DD-MM-YYYY`
- [ ] Confirm Udyam date format always `DD/MM/YYYY`
- [ ] Confirm min `companyName` length / result caps for CIN lookup
- [ ] IP allowlist

---

## Source docs

| Doc | Role |
|-----|------|
| [`BUSINESS_VERIFICATION.md`](BUSINESS_VERIFICATION.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
| [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md) | Sibling Identity pattern (Asset Verification) |
