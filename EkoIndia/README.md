# Eko India (EPS) — Integration Docs

AsanPay ke **Eko Platform Services** integrations ka source folder. Nayi Eko doc / Postman dump yahan save karo — pehle `Incoming/`, phir clean docs root pe.

## Folder layout

```
EkoIndia/
  README.md              ← ye file
  AUTH.md                ← HMAC secret-key signing
  ENDPOINTS.md           ← saari APIs (catalog from Postman)
  DMT.md                 ← Domestic Money Transfer (DMT-Fino)
  AEPS.md                ← AePS Cashout (Fingpay)
  BBPS.md                ← Bharat Bill Payment + recharge helpers
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
| AePS Fingpay | Yes | Not yet | Activate + daily KYC + CW/BE/MS |
| BBPS | Yes | Not yet | Categories → bill → pay |
| PAN / BAV / GST | Yes | Not yet | Tools APIs |
| InstantPay | Separate | Live rails | See `InstantPay/` — Eko alag provider |

## Adding more docs

1. Raw file → `EkoIndia/Incoming/`
2. Agent cleans into the matching `*.md` (ya naya section file)
3. Update this README table + `ENDPOINTS.md` index

## Source

First dump: Postman collection **Eko Platform Services** (`schema.getpostman.com/json/collection/v2.1.0`), generated from `eps.json`, saved under `postman/eps-collection.json`.
