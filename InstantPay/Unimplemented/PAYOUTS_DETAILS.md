# InstantPay — Payouts — Implementation Details

> Compact cheat-sheet. Full pages: [`PAYOUTS.md`](PAYOUTS.md). Auth: [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md).

> **Location:** `InstantPay/Unimplemented/` — implement hone pe root me AEPS-style doc banao.
> **Workflow:** har nayi Payouts page → full + ye DETAILS dono update.

**Base URL:** `https://api.instantpay.in`
**Protocol:** REST + JSON
**Status:** Docs captured (… · Payout Links overview + Link List) — not wired yet
**Last updated:** 2026-07-20

---

## 1. What it is (for product / implement)

| Item | Value |
|------|-------|
| Product | **Payouts** (+ Tax under same nav) |
| Direct rails | `POST /payments/payout` — IMPS/NEFT/RTGS · CREDITCARD · UPI · PAYTM/AMAZON |
| **Axis beneficiary** | `POST /payments/payout/addBeneficiary` |
| Bank master | `GET /payments/payout/banks` |
| **Payout Links** | Overview · List · Create · Cancel · Notify · Track |
| **Tax** | `POST /tax/payments` (`taxType: GST`) |
| Fees (sample) | Bank ~3.46/₹1000 · CC pool ~9.90 · Tax pool = txnValue in sample |

Sibling: [`FINANCIAL_VERIFICATION_DETAILS.md`](FINANCIAL_VERIFICATION_DETAILS.md) (BIN Checker) · DMT (do not mix).

---

## 2. Auth & headers

| Header | Notes |
|--------|-------|
| Auth trio | Strings (OpenAPI int wrong on some pages) |
| `X-Ipay-Endpoint-Ip` | **M / N** on Bank List / Bank Accounts / Credit Cards |

```env
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
INSTANTPAY_CARD_ENCRYPTION_KEY=   # aes-256-cbc from InstantPay credentials page
PAYOUTS_PROVIDER_MODE=dummy|instantpay_sandbox|instantpay_live
```

---

## 3. Page / API matrix

| # | Page | Endpoint | Status |
|---|------|----------|--------|
| 1 | Overview | — | 📄 |
| 2 | Bank List | `GET /payments/payout/banks` | 📄 |
| 3 | Bank Accounts | `POST /payments/payout` | 📄 |
| 4 | Credit Cards | `POST /payments/payout` (`CREDITCARD`) | 📄 |
| 5 | Payout Links — Overview | — (concept) | 📄 |
| 6 | Payout Links — Link List | `GET /payments/payout/link/list` | 📄 |
| 7 | Payout Links — Create Link | `POST /payments/payout/link/create` | 📄 |
| 8 | Payout Links — Cancel Link | `POST /payments/payout/link/cancel` | 📄 |
| 9 | Payout Links — Notify Link | `POST /payments/payout/link/notify` | 📄 |
| 10 | Payout Links — Track Link | `GET /payments/payout/link/track/{linkId}` | 📄 |
| 11 | Tax Payments (GST) | `POST /tax/payments` | 📄 |
| 12 | UPI VPA | `POST /payments/payout` (`UPI`) | 📄 |
| 13 | Wallets | `POST /payments/payout` (`PAYTM`/`AMAZON`) | 📄 |
| 14 | Add Beneficiary (Axis) | `POST /payments/payout/addBeneficiary` | 📄 |
| 15 | Fetch Beneficiary (Axis) | `POST /payments/payout/fetchBeneficiary` | 📄 |
| 16 | Delete Beneficiary (Axis) | `POST /payments/payout/deleteBeneficiary` | 📄 |
| … | Transaction Status | TBD | ⏳ |

---

## 4. Bank List / Bank Accounts (short)

See full doc. Wallet funding: `bankProfileId=0`. Axis: **Add (#14)** · **Fetch (#15)** · **Delete (#16)** → payout uses `payeeListId` + OTP. Not DMT. Timeout → Pending + Status API.

---

## 5. Credit Cards — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout`
**operationId:** `payouts-credit-card`

| Param | M/O | Notes |
|-------|-----|-------|
| `transferMode` | M | **`CREDITCARD`** |
| `payer.bankProfileId` | M | **`0`** |
| `payer.name` / `accountNumber` | M | Sender |
| `payer.paymentMode` | M | `PAY_CARD` \| `NETBANKING` \| `UPI` |
| `payer.cardNumber` / CVV / expiry | O* | aes-256-cbc; required for `PAY_CARD` |
| `payer.referenceNumber` | O* | Required for `UPI` |
| `payee.name` | M | Holder |
| `payee.accountNumber` | M | **CC number** aes-256-cbc |
| `transferAmount` / `externalRef` / lat/long | M | Same rules as bank payout |
| `remarks` / `alertEmail` | O | Remarks max 20 alphabet |

| Response | Notes |
|----------|-------|
| Same shape as bank payout | `txnValue`, `poolReferenceId`, masked `payee.account` |
| Fee | Sample pool `amount` **9.90** |

### Pre-reqs

1. Card BIN Checker before pay
2. Encrypt sensitive fields with InstantPay key (aes-256-cbc)

### Gotchas

- Same endpoint as bank — mode discriminator.
- `paymentMode` = funding method, not card brand.
- Never store/log plaintext PAN/CVV.

---

## 6. Payout Links — Overview

| Item | Value |
|------|-------|
| Purpose | Disburse via shareable link without payee bank details upfront |
| Share | SMS · email · WhatsApp |
| REST on overview | **None** |
| vs Collect links | Collect = inbound; Payout Links = outbound |

---

## 7. Payout Links — Link List — implement fields

**URL:** `GET https://api.instantpay.in/payments/payout/link/list`
**operationId:** `payout-link-list`

| Param | M/O | Notes |
|-------|-----|-------|
| `filters.status` | O | ISSUED / CLAIMED / CANCELLED / PROCESSING / EXPIRED — sample = **array** |
| `filters.contact` | O | Name / mobile / email |
| `filters.linkId` | O | Link id |
| `pagination.pageNumber` / `recordsPerPage` | O | Strings in sample |
| Method quirk | — | **GET with JSON body** |

| Response | Notes |
|----------|-------|
| `data.meta` | Pagination counters |
| `data.records[]` | amount, status, linkId, contactDetails, url, qrUrl, paymentModes, verifyBene, dates |
| `environment` | Sample **`PRODUCTION`** |
| `orderid` | `null` on list |

### Gotchas

- GET+body may break some HTTP clients.
- `qrUrl` uses `/payment/` singular — don’t “fix” to `/payments/`.
- Endpoint-Ip **Y** on this page.

---

## 8. Payout Links — Create Link — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/link/create`
**operationId:** `payout-link-create`

| Param | M/O | Notes |
|-------|-----|-------|
| `verifyBene` | M | bool — if true, require name/mobile/email |
| `amount` | M | String; may round in response |
| `purpose` | M | Refund / Cashback / Comission / Incentive / Payout / Greeting |
| `description` | M | Text |
| `activatedAt` / `expiredAt` | M | Datetimes — expiry must be after activate |
| `paymentModes` | M | `ACCOUNT` · `VPA` · `AMAZON` · `CREDITCARD` |
| `contactDetails.*` | O* | Required when `verifyBene=true` |
| `referenceNo` / `sendAlert` | O | Empty ref → `NA` |
| Endpoint-Ip | M/N | Provided **N** |

| Response | Notes |
|----------|-------|
| `status` | `Link Created Successfully` |
| `data.linkId` / `url` / `status` | Usually `ISSUED` |
| `data.orderId` | Also root `orderid` |
| `environment` | Sample **PRODUCTION** |

### Gotchas

- Prefer `AMAZON` not `AMZON`.
- Fix bad sample date order before calling live.
- Purpose casing may normalize on response.

---

## 9. Payout Links — Cancel Link — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/link/cancel`
**operationId:** `payout-link-cancel`

| Param | M/O | Notes |
|-------|-----|-------|
| `linkId` | M | From create / list |
| Endpoint-Ip | M/Y | Provided **Y** |

| Response | Notes |
|----------|-------|
| `status` | `Link Cancelled Successfully` |
| `data` | **`null`** |
| `orderid` | `null` |

### Gotchas

- Unprocessed only (ISSUED).
- OpenAPI env sample SANDBOX vs page PRODUCTION — ignore for logic.

---

## 10. Payout Links — Notify Link — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/link/notify`
**operationId:** `payout-link-notify`

| Param | M/O | Notes |
|-------|-----|-------|
| `linkId` | M | From create / list |
| Endpoint-Ip | M/Y | Provided **Y** |

| Response | Notes |
|----------|-------|
| `status` | e.g. `Notification Link Sent To *******742 and ******@instantpay.in` |
| `data` | **`null`** |

### Gotchas

- Needs contact details on the link.
- No channel enum in API — InstantPay picks SMS/email/WhatsApp.
- ≠ Create-time `sendAlert`.

---

## 11. Payout Links — Track Link — implement fields

**URL:** `GET https://api.instantpay.in/payments/payout/link/track/{linkId}`
**operationId:** `payout-link-track`

| Param | M/O | Notes |
|-------|-----|-------|
| `linkId` | M | **Path** segment |
| Endpoint-Ip | M/Y | Provided **Y** |
| Body | — | None |

| Response | Notes |
|----------|-------|
| `data.status` | ISSUED / CANCELLED / EXPIRED / PROCESSING / CLAIMED |
| `data.amount` | Number |
| `data.linkActivity[]` | Timeline; claim steps may include orderId + accountType/Number/Ifsc |

### Gotchas

- Docs sample uses `127.0.0.1:8000` — use `api.instantpay.in`.
- Redact activity status strings (may contain phone/email).
- Not the same as bank/CC payout Transaction Status API.

---

## 12. Tax Payments (GST) — implement fields

**URL:** `POST https://api.instantpay.in/tax/payments`
**operationId:** `tax-payments-gst`

| Param | M/O | Notes |
|-------|-----|-------|
| `taxType` | M | **`GST`** |
| `data.cpin` | M | Challan CPIN (docs: 14 digit) |
| `amount` | M | Challan amount |
| `latitude` / `longitude` | M | 4 decimal places; ignore table typo `longitutde` |
| `externalRef` | M | Unique alphanumeric |
| `remarks` | M | Max 20 alphabet (confirm spaces) |
| `alertEmails` | M | **String array** |
| Endpoint-Ip | M/N | Provided **N** |

| Response | Notes |
|----------|-------|
| Same family as payout | `txnValue`, `poolReferenceId`, payer/payee |
| `internalCode` | May be `"Request submitted to bank"` |
| Pool | Sample debit = txn amount |

### Gotchas

- Not under `/payments/payout`.
- “Purpose case sensitive” note has no purpose field here.

---

## 13. UPI VPA — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout`
**operationId:** `payouts-upi-vpa`

| Param | M/O | Notes |
|-------|-----|-------|
| `transferMode` | M | **`UPI`** |
| `payer.bankProfileId` | M | Sample `0` |
| `payer.accountNumber` | M | InstantPay registered mobile |
| `payee.name` | M | Holder name |
| `payee.accountNumber` | M | **VPA** |
| `payee.bankIfsc` | O | Usually `""` |
| `transferAmount` / `externalRef` / lat/long | M | Same rules as bank payout |
| `remarks` / `alertEmail` / `purpose` | O | Purpose case-sensitive enum |

| Response | Notes |
|----------|-------|
| Same as bank payout | `txnValue`, pool fee sample **~3.46**, payee.account = VPA |

### Gotchas

- Not identity mobile→VPA lookup.
- Ignore table `transfer` object / OpenAPI `bankProfile` typo.
- Timeout → Pending + Status API.

---

## 14. Wallets — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout`
**operationId:** `payouts-wallet`

| Param | M/O | Notes |
|-------|-----|-------|
| `transferMode` | M | **`PAYTM`** \| **`AMAZON`** |
| `payer.bankProfileId` | M | **`0`** |
| `payer.accountNumber` | M | InstantPay registered mobile |
| `payee.name` | M | Holder name |
| `payee.accountNumber` | M | Wallet-registered mobile |
| `payee.bankIfsc` | O | Empty |
| `transferAmount` / `externalRef` / lat/long | M | Same payout rules |
| `remarks` / `alertEmail` / `purpose` | O | Purpose case-sensitive |

| Response | Notes |
|----------|-------|
| Same as bank/UPI | pool fee sample **~3.46** |

### Gotchas

- Intro text wrongly describes bank rails — trust `PAYTM`/`AMAZON`.
- ≠ InstantPay **funding** wallet (`bankProfileId=0` as payer on bank/UPI pages).

---

## 15. Add Beneficiary (Axis) — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/addBeneficiary`
**operationId:** `add-beneficiary`

| Param | M/O | Notes |
|-------|-----|-------|
| `payer.bankProfileId` | M | Connected bank profile (not `0`) |
| `payer.accountNumber` | M | Connected bank a/c |
| `payee.firstName` | M | Beneficiary name |
| `payee.accountNumber` | M | End-user a/c |
| `payee.ifsc` | M | IFSC (≠ `bankIfsc`) |
| `beneficiaryType` | M | **`OTHERS`** \| **`AXIS`** |
| `otpReference` / `otp` | M | Empty first → then verify with OTP |

| Response | Notes |
|----------|-------|
| Envelope only | No sample body in docs |

### Flow

1. Call with empty `otp` / `otpReference` → receive OTP
2. Same URL again with OTP fields → verify
3. Use returned beneficiary id as `payeeListId` on Bank Accounts payout (#3) — get id via **Fetch (#15)** if needed

### Gotchas

- Docs `Content-Type: text/plain` — use JSON.
- OpenAPI has empty requestBody / empty 200 example.
- Axis Connected Banking only.

---

## 16. Fetch Beneficiary (Axis) — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/fetchBeneficiary`
**operationId:** `add-beneficiary-copy` (ignore name)

| Param | M/O | Notes |
|-------|-----|-------|
| `payer.bankProfileId` | M | Connected bank profile |
| `payer.accountNumber` | M | Connected bank a/c |
| `beneficiaryType` | M | **`OTHERS`** \| **`AXIS`** |

| Response | Notes |
|----------|-------|
| `data` | List of beneficiaries (shape undocumented) |

### Gotchas

- No OTP fields.
- Map list item id → payout `payeeListId` after live inspect.

---

## 17. Delete Beneficiary (Axis) — implement fields

**URL:** `POST https://api.instantpay.in/payments/payout/deleteBeneficiary`
**operationId:** `delete-beneficiary-copy`

| Param | M/O | Notes |
|-------|-----|-------|
| `payer.bankProfileId` / `accountNumber` | M | Connected bank |
| `payee.beneficiaryId` | M | Id (not name — docs wrong); often `""` in sample |
| `payee.payeeListId` | M | From Fetch (not IFSC — docs wrong); sample number |
| `payee.accountNumber` | M | End-user a/c |
| `beneficiaryType` | M | `OTHERS` \| `AXIS` |
| `otpReference` / `otp` | M | Empty → then verify OTP |

### Flow

1. Empty OTP → request delete OTP
2. Same URL + OTP fields → confirm delete

### Gotchas

- Ignore polluted param descriptions.
- OpenAPI title wrongly `axis-add-beneficiary`.

---

## 18. Provider checklist

- [x] Overview · Bank List · Bank Accounts · Credit Cards · UPI VPA · Wallets
- [x] Add · Fetch · Delete Beneficiary (Axis)
- [x] Payout Links: Overview · List · Create · Cancel · Notify · Track
- [x] Tax Payments (GST)
- [ ] Transaction Status API
- [ ] Other taxType values beyond GST
- [ ] Confirm fee schedules
- [ ] Encryption key in env (never commit)
- [ ] IP allowlist
- [ ] Wire AsanPay (PARITY)

---

## Source docs

| Doc | Role |
|-----|------|
| [`PAYOUTS.md`](PAYOUTS.md) | Full pasted pages |
| [`OVERVIEW_DETAILS.md`](OVERVIEW_DETAILS.md) | Platform auth / JWT |
| [`FINANCIAL_VERIFICATION.md`](FINANCIAL_VERIFICATION.md) | Card BIN Checker |
