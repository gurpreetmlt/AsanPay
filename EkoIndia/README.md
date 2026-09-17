# Eko India (EPS) — Integration Docs

AsanPay ke **Eko Platform Services** integrations ka source folder. Nayi Eko doc / Postman dump yahan save karo — pehle `Incoming/`, phir clean docs root pe.

## Folder layout

```
EkoIndia/
  README.md              ← ye file
  AUTH.md                ← HMAC secret-key signing
  ENDPOINTS.md           ← saari APIs (catalog from Postman)
  DMT.md                 ← Domestic Money Transfer (DMT-Fino)
  AEPS.md                ← AePS Cashout overview (from Postman)
  AEPS_INDEX.md          ← AePS official docs checklist + sequence
  AEPS_ACTIVATE.md       ← Activate AePS Fingpay for Agent
  AEPS_SHOP_TYPES.md     ← Get Shop Types (MCC → shop_type)
  AEPS_STATES.md         ← Get States (state_id for addresses)
  AEPS_EKYC_SEND_OTP.md  ← First-time eKYC Send OTP
  AEPS_EKYC_VERIFY_OTP.md ← First-time eKYC Verify OTP
  AEPS_EKYC_BIOMETRIC.md ← First-time eKYC Biometric (wadh required)
  AEPS_DAILY_KYC.md      ← Daily biometric KYC (wadh empty)
  AEPS_CASH_WITHDRAWAL_OTP.md ← CW OTP when amount > ₹5000
  AEPS_CASH_WITHDRAWAL.md ← AePS cash withdrawal (biometric)
  AEPS_BALANCE_ENQUIRY.md ← AePS balance enquiry (no debit)
  AEPS_MINI_STATEMENT.md ← AePS mini statement (txn list)
  AEPS_ADD_SETTLEMENT_ACCOUNT.md ← Register settlement bank (recipient_id)
  AEPS_GET_SETTLEMENT_ACCOUNTS.md ← List recipients + unsettled_fund
  AEPS_INITIATE_SETTLEMENT.md ← Settle to bank (NEFT/IMPS/RTGS)
  BBPS.md                ← Bharat Bill Payment overview (from Postman)
  BBPS_INDEX.md          ← BBPS official docs checklist + sequence
  BBPS_CATEGORIES.md     ← Get BBPS Categories (operator_category_id)
  BBPS_LOCATIONS.md      ← Get BBPS Locations (operator_location_id string)
  BBPS_OPERATORS.md      ← Get BBPS Operators (operator_id → phone_operator_code)
  BBPS_OPERATOR_PARAMETERS.md ← Dynamic form fields per operator
  BBPS_DISTRICT_DISCOME.md ← UPPCL (190) district_discome list
  BBPS_OPERATOR_CODE_CIRCLE.md ← Mobile recharge operator + circle detect
  BBPS_RECHARGE_PLANS.md ← Prepaid/DTH plans (req_list under dependent_params)
  BBPS_FETCH_BILL.md     ← Fetch outstanding bill (amount → Pay Bill)
  BBPS_PAY_BILL.md       ← Pay bill / prepaid recharge (debit)
  PAN.md                 ← PAN verification tools
  PPI.md                 ← PPI Levin + DigiKhata wallets
  AGENT.md               ← User & agent management
  TRANSACTIONS.md        ← Txn inquiry + refunds
  BANK.md                ← Banks / IFSC + bank account verify
  DIGILOCKER.md          ← DigiLocker KYC
  KYC_TOOLS.md           ← GST, UPI VPA, DL, RC, voter, passport, CIN, …
  postman/
    eps-collection.json  ← raw Postman v2.1 collection (staging)
  Incoming/              ← owner se aane wali raw docs (PDF/screens/JSON)
```

## Environment (staging from collection)

| Item | Value / note |
|------|----------------|
| Base URL | `https://staging.eko.in/ekoapi/v3` |
| Headers | `developer_key`, `secret-key`, `secret-key-timestamp`, `content-type: application/json` |
| Collection vars | `access_key`, `developer_key` (local only — never commit secrets) |

Production host / live keys — jab milen `Incoming/` ya is README me update karo.

## Auth

See [`AUTH.md`](AUTH.md). Signature har request se pehle Postman prerequest jaisa:

1. `ts = Date.now()` (ms string)
2. Base64(UTF8(`access_key`))
3. HMAC-SHA256(`ts`, encodedKey) → Base64 = `secret-key`
4. Header `secret-key-timestamp` = `ts`

## Common body fields

Almost har call mein:

- `initiator_id` — partner / initiator mobile (collection sample: `9962981729`)
- `client_ref_id` — unique idempotency / correlation id

Agent-scoped calls often need `user_code` (Eko agent code after onboard).

## Status (AsanPay)

| Rail | Docs here | Backend wire | Notes |
|------|-----------|--------------|-------|
| DMT-Fino | Yes | Not yet | Full flow in `DMT.md` |
| AePS Fingpay | Yes — [`AEPS_INDEX.md`](AEPS_INDEX.md) | Not yet | Activate + Daily KYC official pages saved; more pages as pasted |
| AePS Activate | Yes — [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md) | Not yet | Multipart form-data + docs; pending approval |
| AePS Daily KYC | Yes — [`AEPS_DAILY_KYC.md`](AEPS_DAILY_KYC.md) | Not yet | RSA Aadhaar + empty `wadh` |
| AePS CW OTP | Yes — [`AEPS_CASH_WITHDRAWAL_OTP.md`](AEPS_CASH_WITHDRAWAL_OTP.md) | Not yet | Amount > ₹5k only; `fp_transaction_id` → `txn_otp_request_id` |
| AePS Cash Withdrawal | Yes — [`AEPS_CASH_WITHDRAWAL.md`](AEPS_CASH_WITHDRAWAL.md) | Not yet | Path `cash-withdrawl`; piddata XML; 1463/1464/1465/1459 |
| AePS Balance Enquiry | Yes — [`AEPS_BALANCE_ENQUIRY.md`](AEPS_BALANCE_ENQUIRY.md) | Not yet | Same as CW minus amount; success `1466`; key = `customer_balance` |
| AePS Mini Statement | Yes — [`AEPS_MINI_STATEMENT.md`](AEPS_MINI_STATEMENT.md) | Not yet | Same body as BE; list `mini_statement_list`; success `1527` |
| AePS Add Settlement Acct | Yes — [`AEPS_ADD_SETTLEMENT_ACCOUNT.md`](AEPS_ADD_SETTLEMENT_ACCOUNT.md) | Not yet | `service_code=39`; max 3; returns `recipient_id` |
| AePS Get Settlement Accts | Yes — [`AEPS_GET_SETTLEMENT_ACCOUNTS.md`](AEPS_GET_SETTLEMENT_ACCOUNTS.md) | Not yet | `unsettled_fund` + `fund_transfer_list`; type `1321` |
| AePS Initiate Settlement | Yes — [`AEPS_INITIATE_SETTLEMENT.md`](AEPS_INITIATE_SETTLEMENT.md) | Not yet | Max ₹2L; modes 4/5/13; Mon–Fri 10–5 |
| BBPS | Yes — [`BBPS_INDEX.md`](BBPS_INDEX.md) | Partial (existing txn) | Official fetch/pay + catalogs saved |
| PAN / BAV / GST | Yes | Not yet | Tools APIs |
| InstantPay | Separate | Live rails | See `InstantPay/` — Eko alag provider |

## Adding more docs

1. Raw file → `EkoIndia/Incoming/`
2. Agent cleans into the matching `*.md` (ya naya section file)
3. Update this README table + `ENDPOINTS.md` index

## Source

First dump: Postman collection **Eko Platform Services** (`schema.getpostman.com/json/collection/v2.1.0`), generated from `eps.json`, saved under `postman/eps-collection.json`.
