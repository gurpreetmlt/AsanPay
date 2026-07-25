# PaySprint Integration Docs

AsanPay ke PaySprint integrations ka single source of truth. Kisi bhi agent/chat me PaySprint pe kaam shuru karne se pehle relevant doc padho.

## Folder layout

```
PaySprint/
  README.md                 ← ye file
  AEPS.md / DMT.md / …      ← IMPLEMENTED rails (later — AEPS-style full implementation docs)
  Unimplemented/            ← raw PaySprint pages + DETAILS (abhi code me nahi)
    OVERVIEW.md
    OVERVIEW_DETAILS.md
    AUTHENTICATION.md
    AUTHENTICATION_DETAILS.md
    …
```

## Convention (zaroori)

### Implemented (main `PaySprint/` folder)

> Jo service **implement** ho chuki / ho rahi ho — uska doc **root** me `AEPS.md` jaisa: architecture, status table, endpoints, env, pending, key files.

### Unimplemented (`Unimplemented/` folder)

1. User PaySprint PDF / doc page de → save as `Unimplemented/<SERVICE>.md` (full samples).
2. **Saath hi** `Unimplemented/<SERVICE>_DETAILS.md` update (auth, endpoints, request/response, flows, gotchas).
3. Jab implement karo → root me naya `<SERVICE>.md` (AEPS-style) banao, README implemented table me add karo, Unimplemented se DETAILS as source use karo.

> Rule: **Nayi PDF/page → sirf `Unimplemented/` me full + DETAILS.** Implement hone pe root me implementation doc.

### Naming

- `SERVICE` = `SCREAMING_SNAKE` (e.g. `AEPS`, `DMT`, `PAYOUT`, `ONBOARDING`)
- Ek PDF = ek suite jab related APIs ek product me hon; warna alag SERVICE files
- Multi-product PDF → pehle is README me TOC, phir suite-wise files

### Auth (platform-wide)

PaySprint uses **JWT (`Token` header, HS256)** + UAT **`Authorisedkey`** + optional **AES-128** body encryption + **India IP** allowlist.
Details: [`Unimplemented/AUTHENTICATION.md`](Unimplemented/AUTHENTICATION.md).

**Live base (typical):** `https://api.paysprint.in/service-api/api/v1/service`
**OpenAPI pollution:** samples often use `https://xyz.xyz.in/...` — ignore; confirm UAT host with PaySprint (`sit.paysprint.in` appears in some suites).

---

## Source PDFs (this archive)

| PDF | Suites captured |
|-----|-----------------|
| `PaySprint Doc. 1.pdf` (~600p) | Overview, Auth, Credentials, Balance, DMT, Onboarding, AEPS (+ Bank4, Bank1 eKYC) |
| `PaySprint Doc 2.pdf` (~388p) | NSDL Cash Deposit, MATM Fino, Callbacks, Payout, CMS, Bus, Lead/CC, Travel, UPI Cashout |

> Named on Getting Started but **not** in these PDFs as full API suites: BBPS, Recharge, Insurance, generic “Verification”, Loans — next PDF drop ke liye.

---

## Implemented docs

| Doc | Service | Status |
|-----|---------|--------|
| — | — | None yet |

---

## Unimplemented docs

### Platform

| Doc | Service | Status |
|-----|---------|--------|
| [`Unimplemented/OVERVIEW.md`](Unimplemented/OVERVIEW.md) | Getting Started / catalog (full) | 📄 Docs only |
| [`Unimplemented/OVERVIEW_DETAILS.md`](Unimplemented/OVERVIEW_DETAILS.md) | Overview — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/AUTHENTICATION.md`](Unimplemented/AUTHENTICATION.md) | JWT / AES / IP / Authorisedkey (full) | 📄 Docs only |
| [`Unimplemented/AUTHENTICATION_DETAILS.md`](Unimplemented/AUTHENTICATION_DETAILS.md) | Auth — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/CREDENTIALS.md`](Unimplemented/CREDENTIALS.md) | UAT credentials table (masked) | 📄 Docs only |
| [`Unimplemented/CREDENTIALS_DETAILS.md`](Unimplemented/CREDENTIALS_DETAILS.md) | Credentials — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/BALANCE.md`](Unimplemented/BALANCE.md) | Main + Cash wallet balance (full) | 📄 Docs only |
| [`Unimplemented/BALANCE_DETAILS.md`](Unimplemented/BALANCE_DETAILS.md) | Balance — implement cheat-sheet | 📄 Ready for implement |

### Banking / FI (Doc 1)

| Doc | Service | Status |
|-----|---------|--------|
| [`Unimplemented/DMT.md`](Unimplemented/DMT.md) | DMT CASA — remitter / bene / txn / refund (full) | 📄 Docs only |
| [`Unimplemented/DMT_DETAILS.md`](Unimplemented/DMT_DETAILS.md) | DMT — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/DMT_BANK_LIST.md`](Unimplemented/DMT_BANK_LIST.md) | DMT bank master — BankId / BankName (1903) | 📄 Docs only |
| [`Unimplemented/DMT_BANK_LIST_DETAILS.md`](Unimplemented/DMT_BANK_LIST_DETAILS.md) | DMT bank list — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/ONBOARDING.md`](Unimplemented/ONBOARDING.md) | Merchant onboard / activate / status (full) | 📄 Docs only |
| [`Unimplemented/ONBOARDING_DETAILS.md`](Unimplemented/ONBOARDING_DETAILS.md) | Onboarding — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/AEPS.md`](Unimplemented/AEPS.md) | AEPS 2FA + BE / CW / MS / Aadhaar Pay (full) | 📄 Docs only |
| [`Unimplemented/AEPS_DETAILS.md`](Unimplemented/AEPS_DETAILS.md) | AEPS — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/AEPS_BANK4.md`](Unimplemented/AEPS_BANK4.md) | AEPS Bank4 (v2 onboard + v3 txn) (full) | 📄 Docs only |
| [`Unimplemented/AEPS_BANK4_DETAILS.md`](Unimplemented/AEPS_BANK4_DETAILS.md) | AEPS Bank4 — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/BANK1_EKYC.md`](Unimplemented/BANK1_EKYC.md) | Bank1 merchant eKYC + AePS bank1 (full) | 📄 Docs only |
| [`Unimplemented/BANK1_EKYC_DETAILS.md`](Unimplemented/BANK1_EKYC_DETAILS.md) | Bank1 — cheat-sheet | 📄 Ready for implement |

### Doc 2 suites

| Doc | Service | Status |
|-----|---------|--------|
| [`Unimplemented/NSDL_CASH_DEPOSIT.md`](Unimplemented/NSDL_CASH_DEPOSIT.md) | NSDL AePS Cash Deposit (full) | 📄 Docs only |
| [`Unimplemented/NSDL_CASH_DEPOSIT_DETAILS.md`](Unimplemented/NSDL_CASH_DEPOSIT_DETAILS.md) | NSDL CD — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/MATM.md`](Unimplemented/MATM.md) | Fino MATM + three-way recon (full) | 📄 Docs only |
| [`Unimplemented/MATM_DETAILS.md`](Unimplemented/MATM_DETAILS.md) | MATM — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/CALLBACKS.md`](Unimplemented/CALLBACKS.md) | Onboard / Payout / MATM / Bus webhooks (full) | 📄 Docs only |
| [`Unimplemented/CALLBACKS_DETAILS.md`](Unimplemented/CALLBACKS_DETAILS.md) | Callbacks — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/PAYOUT.md`](Unimplemented/PAYOUT.md) | Payout accounts + txn (full) | 📄 Docs only |
| [`Unimplemented/PAYOUT_DETAILS.md`](Unimplemented/PAYOUT_DETAILS.md) | Payout — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/CMS.md`](Unimplemented/CMS.md) | CMS Bank1 (Airtel) + Bank2 (full) | 📄 Docs only |
| [`Unimplemented/CMS_DETAILS.md`](Unimplemented/CMS_DETAILS.md) | CMS — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/BUS_TICKET.md`](Unimplemented/BUS_TICKET.md) | Bus ticket booking URL + raw APIs (full) | 📄 Docs only |
| [`Unimplemented/BUS_TICKET_DETAILS.md`](Unimplemented/BUS_TICKET_DETAILS.md) | Bus — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/LEAD_CREDIT_CARD.md`](Unimplemented/LEAD_CREDIT_CARD.md) | Lead generation + CC UTM (full) | 📄 Docs only |
| [`Unimplemented/LEAD_CREDIT_CARD_DETAILS.md`](Unimplemented/LEAD_CREDIT_CARD_DETAILS.md) | Lead/CC — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/TRAVEL.md`](Unimplemented/TRAVEL.md) | Train + Flight merchant / URL (full) | 📄 Docs only |
| [`Unimplemented/TRAVEL_DETAILS.md`](Unimplemented/TRAVEL_DETAILS.md) | Travel — cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/UPI_CASHOUT.md`](Unimplemented/UPI_CASHOUT.md) | UPI Cashout SDK token + status (full) | 📄 Docs only |
| [`Unimplemented/UPI_CASHOUT_DETAILS.md`](Unimplemented/UPI_CASHOUT_DETAILS.md) | UPI Cashout — cheat-sheet | 📄 Ready for implement |
