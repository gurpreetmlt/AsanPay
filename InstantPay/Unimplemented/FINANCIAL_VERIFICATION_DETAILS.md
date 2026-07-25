# InstantPay — Financial Verifications — Implementation Details

> Compact cheat-sheet. Full pages: [`FINANCIAL_VERIFICATION.md`](FINANCIAL_VERIFICATION.md). Auth: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao.
> **Workflow:** har nayi Financial Verifications page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in` (confirm per endpoint)
**Protocol:** REST + JSON
**Status:** Docs captured — not wired in AsanPay yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Financial Verifications** (InstantPay) |
| First rail | **PEP & Sanctions Search** — Politically Exposed Persons (+ family/associates) |
| Use | Due diligence, compliance, risk of dealing with PEPs / sanctions |
| APIs so far | PEP (#1–#3) · Bank suite (#4–#9) · CS Simulator (#11–#13) |
| Bank Verify | `POST /identity/verifyBankAccount` — account+IFSC (#6) or VPA (#7) |
| Card BIN | `POST /identity/binChecker` → `data.binDetails`; fee ~0.59 |
| IFSC Lookup | `GET /identity/ifsc` → `data.ifscDetails`; fee ~0.59 |
| Credit Score Simulator | Overview (#11) · CS01 `POST /identity/creditScoreSimulator` · **CS02** `POST …/scoreSimulation` (what-if `decision`) |
| Sidebar siblings | Credit Report (#10 still pending) |
| Profile Enrichment | Already in [`DIGITAL_KYC_DETAILS.md`](DIGITAL_KYC_DETAILS.md) — updated from FV nav paste (`taxIdNumber` + `preFillData`); do **not** duplicate full archive here |

Sibling docs: [`DIGITAL_KYC_DETAILS.md`](DIGITAL_KYC_DETAILS.md), [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md), [`BUSINESS_VERIFICATION_DETAILS.md`](BUSINESS_VERIFICATION_DETAILS.md).

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| `X-Ipay-Auth-Code` | `"1"` (typical) |
| `X-Ipay-Client-Id` / `X-Ipay-Client-Secret` | InstantPay |
| `X-Ipay-Endpoint-Ip` | End-customer IP — confirm Y/N per page |

JWT alt: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

### Env (proposed)

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
FINANCIAL_VERIFICATION_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | PEP & Sanctions — Overview | — (concept) | 📄 |
| 2 | PEP — Search Profile | `GET /identity/sanctions/search` | 📄 |
| 3 | PEP — Profile Details | `GET /identity/sanctions/profile/{id}` | 📄 |
| 4 | Bank Account Verification — Overview | — (suite concept) | 📄 |
| 5 | Bank List | `GET /identity/verifyBankAccount/banks` | 📄 |
| 6 | Verify Bank Account | `POST /identity/verifyBankAccount` | 📄 |
| 7 | VPA Verification | `POST /identity/verifyBankAccount` (VPA) | 📄 |
| 8 | Card BIN Checker | `POST /identity/binChecker` | 📄 |
| 9 | IFSC Lookup | `GET /identity/ifsc` | 📄 |
| — | Profile Enrichment | `POST /identity/fetchProfile` | ✅ [`DIGITAL_KYC`](DIGITAL_KYC.md) #1 — PAN + `preFillData` |
| 10 | Credit Report | `POST` TBD | ⏳ Pending (re-paste if needed) |
| 11 | Credit Score Simulator — Overview | — (concept) | 📄 |
| 12 | Credit Score Simulator CS01 | `POST /identity/creditScoreSimulator` | 📄 |
| 13 | Credit Score Simulator CS02 | `POST /identity/creditScoreSimulator/scoreSimulation` | 📄 |

---

## 4. PEP & Sanctions — overview + Search + Details

| Item | Value |
|------|-------|
| Purpose | Identify / verify PEPs; risk assess |
| Search | `GET /identity/sanctions/search` |
| Details | `GET /identity/sanctions/profile/{id}` |

### Search Profile — implement fields

**URL:** `GET https://api.instantpay.in/identity/sanctions/search`

| Param | M/O | Notes |
|-------|-----|-------|
| `queryText` | M | Full name or alias |
| `consent` | M | Sample `y` |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| `limit` / `offset` | O | Pagination |
| Body | — | **None** — GET query only (OpenAPI body wrong) |

| Response | Notes |
|----------|-------|
| `data.searchData.results[]` | Hits: `id`, `caption`, `properties.topics` (`role.pep`) |
| `data.searchData.facets` | topics / countries |
| `data.pool*` | Sample fee `0.00` |

### Profile Details — implement fields

**URL:** `GET https://api.instantpay.in/identity/sanctions/profile/{id}`

| Param | M/O | Notes |
|-------|-----|-------|
| `{id}` (path) | M | From Search `results[].id` — **not** in param table; OpenAPI omits path param |
| `consent` | M | Sample `y` |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| Body | — | **None** — GET query only |

| Response | Notes |
|----------|-------|
| `data.entityData` | Full person: topics, position, birthDate, country, … |
| `positionOccupancies` | Nested Occupancy → `post` Position (`gov.state`) |
| `data.pool*` | Sample fee `0.00` |

### Suggested Adhikari routes

```
GET  /api/financial-verification/pep/search          → InstantPay GET /identity/sanctions/search
GET  /api/financial-verification/pep/profile/:id     → InstantPay GET /identity/sanctions/profile/{id}
GET  /api/financial-verification/banks               → InstantPay GET /identity/verifyBankAccount/banks
POST /api/financial-verification/verify-bank         → InstantPay POST /identity/verifyBankAccount
POST /api/financial-verification/verify-vpa          → InstantPay POST /identity/verifyBankAccount (VPA)
# BIN / IFSC — after pastes
```

---

## 4b. Bank Account Verification — overview + Bank List + Verify + VPA

| Item | Value |
|------|-------|
| Purpose | Financial Verification suite — validate bank / UPI / card / IFSC data |
| Bank List | `GET /identity/verifyBankAccount/banks` |
| Verify Bank | `POST /identity/verifyBankAccount` (account + IFSC) |
| VPA | **Same path** — `payee.accountNumber` = VPA |
| Card BIN | `POST /identity/binChecker` |
| IFSC | `GET /identity/ifsc` |
| Next | Credit Report (#10 still pending) — CS Simulator suite complete |

| Provider name | Map to |
|---------------|--------|
| Penny Less / Drop | #6 `pennyDrop` YES/NO/AUTO |
| Verify UPI Handle | VPA (#7) |

### Bank List — implement fields

**URL:** `GET https://api.instantpay.in/identity/verifyBankAccount/banks`

| Param | M/O | Notes |
|-------|-----|-------|
| Body / query | — | **None** |
| Headers | M | Endpoint-Ip **N** |

| Response | Notes |
|----------|-------|
| `data[]` | Large array — cache |
| `impsEnabled` / `impsPennyLess` | Penny modes for #6 |

### Verify Bank Account (#6) — implement fields

**URL:** `POST https://api.instantpay.in/identity/verifyBankAccount`

| Param | M/O | Notes |
|-------|-----|-------|
| `payee.accountNumber` / `payee.bankIfsc` | M | Bank account + IFSC |
| `payee.name` | O | For `nameMatchPercent` |
| `pennyDrop` | M | `YES` \| `NO` \| `AUTO` |
| `consent` | M | `Y` |
| `externalRef` + lat/long | M | |

**Sandbox:** `1111111111` success · `0000000000` under process · other fail.

### VPA Verification (#7) — implement fields

**URL:** `POST https://api.instantpay.in/identity/verifyBankAccount` (**same**)

| Param | M/O | Notes |
|-------|-----|-------|
| `payee.accountNumber` | M | **VPA** (`user@psp`) |
| `payee.bankIfsc` | O | Often `""` / `"0"` |
| `payee.name` | O | Sample present |
| `consent` | M | `Y` / `N` |
| `pennyDrop` | M? | Table `YES`; sample **missing** |
| `isCached` | ? | Sample `"0"` — not in table |
| `externalRef` + lat/long | M | |

| Response | Notes |
|----------|-------|
| Same as #6 | `payee.name`, `nameMatchPercent`, `isPennyDrop`, pool |

### Card BIN Checker (#8) — implement fields

**URL:** `POST https://api.instantpay.in/identity/binChecker`

| Param | M/O | Notes |
|-------|-----|-------|
| `binNumber` | M | First **6** digits |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| `X-Ipay-Outlet-Id` | ? | Sample only — confirm |
| Headers | | Endpoint-Ip **N** |

| Response | Notes |
|----------|-------|
| `data.binDetails.*` | network, type, country, issuer* (may be blank) |
| `data.pool.amount` | Sample `"0.59"` |
| Callout | Verify blank/wrong `issuerBank` before relying |

### Suggested Adhikari routes

```
GET  /api/financial-verification/pep/search      → GET /identity/sanctions/search
GET  /api/financial-verification/pep/profile/:id → GET /identity/sanctions/profile/{id}
GET  /api/financial-verification/banks           → GET /identity/verifyBankAccount/banks
POST /api/financial-verification/verify-bank     → POST /identity/verifyBankAccount  (account+IFSC)
POST /api/financial-verification/verify-vpa      → POST /identity/verifyBankAccount  (VPA)
### IFSC Lookup (#9) — implement fields

**URL:** `GET https://api.instantpay.in/identity/ifsc`

| Param | M/O | Notes |
|-------|-----|-------|
| `ifsc` | M | IFSC code |
| `latitude` / `longitude` | M | End customer |
| `externalRef` | M | Unique txn id |
| Transport | | Sample = **GET + JSON body** — confirm query string works |
| Headers | | Endpoint-Ip **Y** |

| Response | Notes |
|----------|-------|
| `data.ifscDetails` | bankName, branch*, pincode, state |
| `data.pool.amount` | Sample `"0.59"` |
| Sandbox | Names may have `"1 "` prefix |

### Suggested Adhikari routes

```
GET  /api/financial-verification/pep/search      → GET /identity/sanctions/search
GET  /api/financial-verification/pep/profile/:id → GET /identity/sanctions/profile/{id}
GET  /api/financial-verification/banks           → GET /identity/verifyBankAccount/banks
POST /api/financial-verification/verify-bank     → POST /identity/verifyBankAccount  (account+IFSC)
POST /api/financial-verification/verify-vpa      → POST /identity/verifyBankAccount  (VPA)
POST /api/financial-verification/bin-checker     → POST /identity/binChecker
GET  /api/financial-verification/ifsc            → GET /identity/ifsc
POST /api/financial-verification/credit-score-sim → POST /identity/creditScoreSimulator  (CS01)
POST /api/financial-verification/credit-score-whatif → POST /identity/creditScoreSimulator/scoreSimulation  (CS02)
# Credit Report — after paste
```

---

## 4c. Credit Score Simulator — overview + CS01 + CS02

| Item | Value |
|------|-------|
| Purpose | Soft what-if credit impact |
| Overview | #11 — marketing only |
| CS01 | `POST /identity/creditScoreSimulator` — baseline profile + ERS + `scenarioNo` |
| CS02 | `POST /identity/creditScoreSimulator/scoreSimulation` — what-if knobs → `decision` |
| Vs Credit Report | Keep separate until #10 paste |

### CS01 — implement fields

**URL:** `POST https://api.instantpay.in/identity/creditScoreSimulator`
(Samples use `api.localhost` — use InstantPay host.)

| Param | M/O | Notes |
|-------|-----|-------|
| `name` / `mobileNumber` / `dob` | M | DOB sample `YYYY-MM-DD` |
| `inquiryPurposeCode` | M | Sample `"01"` — purpose table = **image missing** |
| `gender` | M | `M` \| `F` \| `T` |
| `address` | O | Sample nested object; table lists flat / `homeAddress` Array |
| `taxIdNumber` + other IDs | O | PAN / DL / voter / passport / ration / other |
| `latitude` / `longitude` | M | |
| `consent` | M | Table `Y`/`N`; **sample omits** — still send |
| `externalRef` | M | Unique txn id |
| Headers | | Endpoint-Ip **N** |
| Ignore | | Intro + OpenAPI Bank List junk |

| Response | Notes |
|----------|-------|
| `data.simulatorData` | personalInfo, identityInfo, addresses, phones, emails, retailAccounts, accountSummary, scores, enquiries*, summaries |
| `scenarioNo` | **Required input for CS02** |
| `scores[]` | Sample ERS4.0 **value `656`** |
| `enquiries[]` | Can be **200–300+** — use `enquirySummary` in UI |
| `data.pool.amount` | Sample **`"20.00"`** |

### CS02 — implement fields

**URL:** `POST https://api.instantpay.in/identity/creditScoreSimulator/scoreSimulation`

| Param | M/O | Notes |
|-------|-----|-------|
| `scenarioNo` | M | From CS01 `simulatorData.scenarioNo` |
| `name` / `mobileNumber` / `dob` / `gender` | M | |
| `inquiryPurposeCode` | M | Sample `"01"` — table image missing |
| `address` | M | Nested object in sample (table says Array) |
| `addressLine1` / `state` / `postal` | M | Nested under `address` |
| `sanctionedAmount` / `overdueAmount` / `currentBalance` | M | What-if amounts |
| `closeAccount` | M | `Y` \| `N` |
| `increaseLimit` / `utilization` | M | What-if limit / util |
| `taxIdNumber` | M | PAN — **Mandatory** (unlike CS01) |
| `latitude` / `longitude` / `externalRef` | M | |
| `consent` | — | **Not** in CS02 table |
| Headers | | Endpoint-Ip **N** |

| Response | Notes |
|----------|-------|
| `data.scoreSimulationData.decision` | e.g. `"Increase by 23 points"` |
| `data.pool.amount` | Sample **`"20.00"`** |

### Suggested Adhikari routes

```
POST /api/financial-verification/credit-score-sim    → POST /identity/creditScoreSimulator
POST /api/financial-verification/credit-score-whatif → POST /identity/creditScoreSimulator/scoreSimulation
```

---

## 5. API summary

| Op | InstantPay | Notes |
|----|------------|-------|
| PEP Overview | — | Product copy only. |
| PEP Search Profile | `GET /identity/sanctions/search` | Query: `queryText`, `consent`, lat/long, `externalRef`, optional `limit`/`offset`. OpenAPI GET+body junk. |
| PEP Profile Details | `GET /identity/sanctions/profile/{id}` | Query: `consent`, lat/long, `externalRef`. OpenAPI missing `{id}` path. Returns `entityData` + `positionOccupancies`. |
| Bank Verify Overview | — | Suite marketing: 6 features. |
| Bank List | `GET /identity/verifyBankAccount/banks` | No body. `impsEnabled` / `impsPennyLess`. Cache huge list. |
| Verify Bank Account | `POST /identity/verifyBankAccount` | Account + IFSC; `pennyDrop` YES/NO/AUTO. OpenAPI mixed with VPA. |
| VPA Verification | `POST /identity/verifyBankAccount` | VPA in `payee.accountNumber`. Sample omits `pennyDrop`, has `isCached`. Broken JSON in docs. |
| Card BIN Checker | `POST /identity/binChecker` | `binNumber` (6 digits) + lat/long/`externalRef`. `data.binDetails`. Fee ~0.59. Blank `issuerBank` possible. Outlet-Id header? |
| IFSC Lookup | `GET /identity/ifsc` | Body (or ?query) `ifsc` + lat/long/`externalRef`. `data.ifscDetails`. Fee ~0.59. GET+body gotcha. |
| Credit Score Simulator Overview | — | What-if marketing; no REST. |
| CS01 | `POST /identity/creditScoreSimulator` | Body: name/mobile/dob/gender/`inquiryPurposeCode`/lat-long/`externalRef` (+ optional address/IDs/`consent`). Returns `simulatorData` + ERS + `scenarioNo`. Fee ~20.00. OpenAPI = Bank List junk. |
| CS02 | `POST /identity/creditScoreSimulator/scoreSimulation` | Needs CS01 `scenarioNo` + what-if knobs (`sanctionedAmount`, `overdueAmount`, `currentBalance`, `closeAccount`, `increaseLimit`, `utilization`) + mandatory PAN. Returns `scoreSimulationData.decision`. Fee ~20.00. |

### Flow (PEP)

1. Collect name + consent + lat/long/`externalRef`.
2. `GET …/sanctions/search?queryText=…&consent=y&…`
3. User/ops picks a hit → `GET …/sanctions/profile/{id}?consent=y&…`
4. Persist `entityData` + pool / `ipay_uuid`; policy on `role.pep` (block / review / allow).
5. Confirm continuous monitoring (API vs ops).

### Flow (Bank / VPA / BIN / IFSC)

1. Optional Bank List for account+IFSC path.
2. `POST …/verifyBankAccount` with account+IFSC (#6) **or** VPA (#7).
3. Optional `POST …/binChecker` → `binDetails`; gate on blank `issuerBank`.
4. Optional `GET …/ifsc` → `ifscDetails` before transfer.
5. Persist pool / refs.

### Dummy mode

- Bank List / Verify / VPA / BIN: as before.
- IFSC: mock `ifscDetails` for `ABHY0065002` (no `"1 "` prefix in live mocks).
- Credit Report: after paste.
- CS01: mock `simulatorData` with one ERS score + `scenarioNo` + short `enquirySummary`.
- CS02: mock `scoreSimulationData.decision` e.g. `"Increase by 23 points"`.

### Flow (Credit Score Simulator)

1. Overview: soft what-if messaging.
2. CS01: collect identity + consent → `POST …/creditScoreSimulator` → save `scenarioNo`, baseline ERS, summaries.
3. CS02: user sets what-if knobs → `POST …/scoreSimulation` with same identity + `scenarioNo` → show `decision` text.
4. Keep distinct from Credit Report (#10).

---

## 6. Provider checklist

- [ ] PEP Search Profile on staging (`/identity/sanctions/search`)
- [ ] PEP Profile Details on staging (`/identity/sanctions/profile/{id}`)
- [ ] Confirm `consent` accepted values (`y` / `Y` / …)
- [ ] Confirm hash headers required on Search when `Hash-Check` not OFF
- [ ] Confirm Search + Details fees (samples `pool.amount` `0.00`)
- [ ] Confirm PEP vs sanctions topics beyond `role.pep` / `gov.state`
- [ ] Confirm continuous monitoring (API vs ops)
- [ ] Bank List on staging — cache strategy
- [ ] Verify Bank Account on staging (`POST /identity/verifyBankAccount`)
- [ ] Confirm `pennyDrop` YES vs response `isPennyDrop` (24h / cache)
- [ ] Confirm `beneBank` unused
- [ ] Confirm name-match product thresholds
- [ ] Sandbox accounts `1111111111` / `0000000000`
- [ ] Empty `ifscGlobal` / `upiEnabled` vs VPA
- [ ] VPA Verification on staging (same path, VPA input)
- [ ] Confirm VPA required fields (`pennyDrop` vs `isCached`)
- [ ] Confirm `bankIfsc` empty/`0` for VPA
- [ ] Card BIN Checker on staging (`POST /identity/binChecker`)
- [ ] Confirm `X-Ipay-Outlet-Id` required
- [ ] Confirm fee (~0.59) + blank `issuerBank` policy
- [ ] IFSC Lookup on staging (`GET /identity/ifsc`) — body vs query
- [ ] Confirm IFSC fee (~0.59)
- [ ] Credit Report (#10) — still need full page paste (context lost earlier)
- [ ] CS01 on staging (`POST /identity/creditScoreSimulator`)
- [ ] CS02 on staging (`POST /identity/creditScoreSimulator/scoreSimulation`)
- [ ] Confirm CS01 → CS02 `scenarioNo` handoff / expiry
- [ ] Confirm `consent` required on CS01 (sample omitted) / absent on CS02
- [ ] Confirm address shape: nested object vs Array
- [ ] Get `inquiryPurposeCode` purpose table (image)
- [ ] Confirm fees (~20.00 each step?)
- [ ] Truncate/store policy for huge CS01 `enquiries[]`
- [ ] Parse / display policy for CS02 free-text `decision`
- [ ] IP allowlist

---

## Source docs

| Doc | Role |
|-----|------|
| [`FINANCIAL_VERIFICATION.md`](FINANCIAL_VERIFICATION.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
| [`DIGITAL_KYC.md`](DIGITAL_KYC.md) | Profile Enrichment (Financial Verifications sidebar sibling) |
