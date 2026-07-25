# InstantPay Integration Docs

AsanPay ke InstantPay (Financial Inclusion) integrations ka single source of truth. Kisi bhi agent/chat me InstantPay pe kaam shuru karne se pehle relevant doc padho.

## Folder layout

```
InstantPay/
  README.md                 ← ye file
  AEPS.md / DMT.md / …      ← IMPLEMENTED rails (AEPS-style full implementation docs)
  Unimplemented/            ← raw InstantPay pages + DETAILS (abhi code me nahi)
    OVERVIEW.md
    OVERVIEW_DETAILS.md
    ASSET_VERIFICATION.md
    ASSET_VERIFICATION_DETAILS.md
    BANKING.md
    BANKING_DETAILS.md
    BUSINESS_VERIFICATION.md
    BUSINESS_VERIFICATION_DETAILS.md
    COLLECT.md
    COLLECT_DETAILS.md
    DIGITAL_KYC.md
    DIGITAL_KYC_DETAILS.md
    FINANCIAL_VERIFICATION.md
    FINANCIAL_VERIFICATION_DETAILS.md
    LOCATION_SERVICES.md
    LOCATION_SERVICES_DETAILS.md
    MOBILE_BASED_VERIFICATIONS.md
    MOBILE_BASED_VERIFICATIONS_DETAILS.md
    PAYOUTS.md
    PAYOUTS_DETAILS.md
    …
```

## Convention (zaroori)

### Implemented (main `InstantPay/` folder)

> Jo service **implement** ho chuki / ho rahi ho — uska doc **root** me `AEPS.md` jaisa: architecture, status table, endpoints, env, pending, key files.

### Unimplemented (`Unimplemented/` folder)

1. User InstantPay doc page paste kare → save as `Unimplemented/<SERVICE>.md` (full samples / OpenAPI).
2. **Saath hi** `Unimplemented/<SERVICE>_DETAILS.md` update (auth, endpoints, request/response, flows, gotchas).
3. Jab implement karo → root me naya `<SERVICE>.md` (AEPS-style) banao, README implemented table me add karo, Unimplemented se DETAILS as source use karo.

> Rule: **Nayi paste page → sirf `Unimplemented/` me full + DETAILS.** Implement hone pe root me implementation doc.

---

## Implemented docs

| Doc | Service | Status |
|-----|---------|--------|
| [`ONBOARDING.md`](ONBOARDING.md) | Merchant/outlet onboarding (eKYC) | Backend done, UI pending |
| [`AEPS.md`](AEPS.md) | Aadhaar Enabled Payment System | Live-ready (backend) |
| [`DMT.md`](DMT.md) | Remittance / Domestic Money Transfer | 🚧 In progress (backend + agent web) |
| [`NEPAL.md`](NEPAL.md) | Remittance (Nepal) | 🚧 In progress (static data wired) |
| [`PARITY.md`](PARITY.md) | Web + mobile parity matrix | Living checklist |

---

## Unimplemented docs

| Doc | Service | Status |
|-----|---------|--------|
| [`Unimplemented/OVERVIEW.md`](Unimplemented/OVERVIEW.md) | Platform overview (full) | 📄 Reference |
| [`Unimplemented/OVERVIEW_DETAILS.md`](Unimplemented/OVERVIEW_DETAILS.md) | Overview — auth / JWT / creds | 📄 Ready for implement |
| [`Unimplemented/ASSET_VERIFICATION.md`](Unimplemented/ASSET_VERIFICATION.md) | Identity — Asset Verification + OKYC (full) | 📄 Docs only |
| [`Unimplemented/ASSET_VERIFICATION_DETAILS.md`](Unimplemented/ASSET_VERIFICATION_DETAILS.md) | Asset Verification — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/BANKING.md`](Unimplemented/BANKING.md) | Connected Banking — Virtual Accounts (full) | 📄 Docs only |
| [`Unimplemented/BANKING_DETAILS.md`](Unimplemented/BANKING_DETAILS.md) | Banking — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/BUSINESS_VERIFICATION.md`](Unimplemented/BUSINESS_VERIFICATION.md) | Business Verification — LEI etc. (full) | 📄 Docs only |
| [`Unimplemented/BUSINESS_VERIFICATION_DETAILS.md`](Unimplemented/BUSINESS_VERIFICATION_DETAILS.md) | Business Verification — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/COLLECT.md`](Unimplemented/COLLECT.md) | Collect — virtual accounts / inbound pay (full) | 📄 Docs only |
| [`Unimplemented/COLLECT_DETAILS.md`](Unimplemented/COLLECT_DETAILS.md) | Collect — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/DIGITAL_KYC.md`](Unimplemented/DIGITAL_KYC.md) | Digital KYC — Profile Enrichment, Face Liveness, DigiLocker (full) | 📄 Docs only |
| [`Unimplemented/DIGITAL_KYC_DETAILS.md`](Unimplemented/DIGITAL_KYC_DETAILS.md) | Digital KYC — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/FINANCIAL_VERIFICATION.md`](Unimplemented/FINANCIAL_VERIFICATION.md) | Financial Verifications — PEP, Bank, VPA, Credit… (full) | 📄 Docs only |
| [`Unimplemented/FINANCIAL_VERIFICATION_DETAILS.md`](Unimplemented/FINANCIAL_VERIFICATION_DETAILS.md) | Financial Verifications — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/LOCATION_SERVICES.md`](Unimplemented/LOCATION_SERVICES.md) | Location Services — GEO Intelligence (full) | 📄 Docs only |
| [`Unimplemented/LOCATION_SERVICES_DETAILS.md`](Unimplemented/LOCATION_SERVICES_DETAILS.md) | Location Services — implement cheat-sheet | 📄 Ready for implement |
| [`Unimplemented/MOBILE_BASED_VERIFICATIONS.md`](Unimplemented/MOBILE_BASED_VERIFICATIONS.md) | Mobile Based Verifications (full) | 📄 Docs only |
| [`Unimplemented/MOBILE_BASED_VERIFICATIONS_DETAILS.md`](Unimplemented/MOBILE_BASED_VERIFICATIONS_DETAILS.md) | Mobile Based Verifications — implement cheat-sheet | 📄 Ready for paste |
| [`Unimplemented/PAYOUTS.md`](Unimplemented/PAYOUTS.md) | Payouts (full) | 📄 Docs only |
| [`Unimplemented/PAYOUTS_DETAILS.md`](Unimplemented/PAYOUTS_DETAILS.md) | Payouts — implement cheat-sheet | 📄 Ready for paste |
