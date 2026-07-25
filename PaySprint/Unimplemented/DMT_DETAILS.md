# PaySprint — DMT (CASA) — Implementation Details

> Compact cheat-sheet. Full pages: [`DMT.md`](DMT.md).

> **Location:** `PaySprint/Unimplemented/`
**Base URL (Live):** `https://api.paysprint.in/service-api/api/v1/service`
**Base URL (UAT):** confirm (`sit.paysprint.in` / PaySprint-provided; OpenAPI uses `xyz.xyz.in`)
Protocol: REST + JSON + JWT
Status: Docs captured — not wired yet
**Last updated:** 2026-07-20

---

## 1. What it is

PaySprint Domestic Money Transfer / CASA remitter+bene+txn+refund. Distinct from InstantPay DMT — do not mix clients.

---

## 2. Auth & headers

| Item | Notes |
|------|-------|
| JWT | `Token` header |
| Authorisedkey | UAT |
| AES | Some AePS/onboard bodies |

```env
PAYSPRINT_PARTNER_ID=
PAYSPRINT_JWT_SECRET=
PAYSPRINT_AES_KEY=
PAYSPRINT_AES_IV=
PAYSPRINT_AUTHORISED_KEY=
PAYSPRINT_MODE=dummy|paysprint_uat|paysprint_live
```

---

## 3. Page / API matrix

| # | Page / API | Endpoint | Status |
|---|------------|----------|--------|
| 1 | QueryRemitter | `POST /dmt-casa/Queryremitter` | 📄 |
| 2 | Check Aadhar number | `POST /dmt-casa/account_opening/check_aadhaar` | 📄 |
| 3 | Check Pan | `POST /dmt-casa/account_opening/check_pan` | 📄 |
| 4 | Ekyc | `POST /dmt-casa/account_opening/ekyc` | 📄 |
| 5 | Check pincode | `POST /dmt-casa/account_opening/check_pincode` | 📄 |
| 6 | Get Otp | `POST /dmt-casa/account_opening/generate_otp` | 📄 |
| 7 | Account Submit Request | `POST /dmt-casa/account_opening/submit_account_details` | 📄 |
| 8 | Account Revision Submit | `POST /dmt-casa/account_opening/submit_account_revision` | 📄 |
| 9 | Send Bene Otp | `POST /dmt-casa/beneficiary/sendotp` | 📄 |
| 10 | Add_Bene | `POST /dmt-casa/beneficiary/add_bene` | 📄 |
| 11 | Delete Beneficiary | `POST /dmt-casa/beneficiary/deletebene` | 📄 |
| 12 | Get Bene List | `POST /dmt-casa/beneficiary/benelist` | 📄 |
| 13 | Bene Verification Api | `POST /dmt-casa/beneficiary/benenameverify` | 📄 |
| 14 | Get Single Bene | `POST /dmt-casa/beneficiary/fetch_single_bene` | 📄 |
| 15 | Transaction send otp | `POST /dmt-casa/transact/send_otp` | 📄 |
| 16 | Transaction Verify Otp | `POST /dmt-casa/transact/process` | 📄 |
| 17 | Transaction Status | `POST /dmt-casa/transact/querytransact` | 📄 |
| 18 | Refund send otp api | `POST /dmt-casa/refund/resendotp` | 📄 |
| 19 | Refund Claim Api | `POST /dmt-casa/refund/index` | 📄 |

---

## 4. Implement fields (high-signal)

| Area | Key fields |
|------|------------|
| Query remitter | `merchantcode`, `mobile`, `aadhaar` |
| Account open | `pan`, `piddata`, `ekyc_*`, `consent`, `pincode`, demographics |
| Bene | `benename`, `bankid`, `accno`, `ifsccode`, `otp`, `stateresp` |
| Bank master | [`DMT_BANK_LIST.md`](DMT_BANK_LIST.md) — **1903** `BankId`/`BankName` (Excel) |
| Txn | `bene_id`, `amount`, `referenceid`, `txntype`, `otp`, `stateresp` |
| Status | `referenceid` → `utr`, `txn_status`, `ackno` |
| Refund | `ackno`, `referenceid`, `otp`, `stateresp` |


---

## 5. Flows

### Remitter + send money (happy path)

1. `Queryremitter` with merchant + mobile (+ Aadhaar per page)
2. If new: account opening chain (check_aadhaar → check_pan → ekyc → check_pincode → generate_otp → submit_account_details)
3. Beneficiary: `sendotp` → `add_bene` (with `stateresp`)
4. Optional: `benenameverify` / `benelist`
5. Txn: `transact/send_otp` → `transact/process` (`txntype`, amount, OTP, stateresp)
6. Status: `transact/querytransact` with `referenceid`
7. Failed claim: `refund/resendotp` → `refund/index`

### Revision path

- `submit_account_revision` when account under revision (docs have dedicated response_code notes)


---

## 6. Gotchas

- OpenAPI required arrays heavily polluted between bene/txn endpoints
- `stateresp` must round-trip from OTP APIs
- Biometric `piddata` — never log
- ≠ InstantPay `/payments/...` DMT

---

## 7. Provider checklist

- [x] All 19 DMT-CASA paths captured
- [x] Bank list Excel → [`DMT_BANK_LIST.md`](DMT_BANK_LIST.md) (1903)
- [ ] Confirm txntype enum
- [ ] Seed banks table on implement
- [ ] Refund eligibility rules
- [ ] Wire AsanPay (PARITY later)

---

## Source docs

| Doc | Role |
|-----|------|
| [`DMT.md`](DMT.md) | Full archive |
| [`DMT_BANK_LIST.md`](DMT_BANK_LIST.md) | BankId / BankName master |
| [`DMT_BANK_LIST_DETAILS.md`](DMT_BANK_LIST_DETAILS.md) | Bank list cheat-sheet |
| [`AUTHENTICATION.md`](AUTHENTICATION.md) | JWT / AES |
