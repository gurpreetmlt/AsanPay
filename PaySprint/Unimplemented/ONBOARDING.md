# PaySprint — Onboarding

> Raw PaySprint docs (`PaySprint/Unimplemented/`). **Implement cheat-sheet:** [`ONBOARDING_DETAILS.md`](ONBOARDING_DETAILS.md). Jab implement ho → root `PaySprint/ONBOARDING.md`.

**Provider:** PaySprint (Onboarding)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc. 1.pdf` (pages ~218–298)

### Shared headers / auth

| Header | Type | Mandatory | Env | Description |
|--------|------|-----------|-----|-------------|
| `Token` | String | M | UAT+Live | JWT (HS256) |
| `Authorisedkey` | String | M on UAT* | UAT | Not required on Live (provider note) |
| `Content-Type` | String | M | Both | `application/json` |


### Shared auth

JWT in `Token` header; UAT may need `Authorisedkey`. AES-128 for some sensitive bodies. India IP only. See [`AUTHENTICATION.md`](AUTHENTICATION.md).


### Common response envelope

| Field | Type | Description |
|-------|------|-------------|
| `status` | Boolean/Number | Success flag (shape varies) |
| `response_code` | Number/String | Provider code |
| `message` | String | Status text |
| `data` | Object/Array | Payload |
| `ackno` / `referenceid` / `utr` | String | Txn ids when applicable |


### PDF / OpenAPI pollution

- Servers often `https://xyz.xyz.in/service-api/api/v1/service` — use `api.paysprint.in`
- `operationId` / `required[]` frequently copy-pasted across adjacent endpoints
- Prefer param tables + curl over OpenAPI blobs
- Mask all PII/secrets in samples (`xxxxx`)


---

## Product notes

Merchant / outlet **onboarding** for AePS / MATM / bank pipes. Includes:

- Get onboard URL (web redirect)
- Activate merchant (biometric)
- Onboard status (pipe-wise)
- DMT-CASA merchant index
- AePS KYC V3 send/verify OTP
- Merchant PAN update (Bank6)
- RD service download links + AePS body encryption technique (supporting pages)

Pipe / bank selection (`pipe` field) routes onboarding to Bank1 / Bank2 / Bank3 / Bank4 / Bank6 variants — see also `AEPS_BANK4` and `BANK1_EKYC` suites.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Onboarding Web | `POST /onboard/onboardnew/getonboardurl` | 📄 Docs captured |
| 2 | Bank 2, Bank5 & Bank 6 Merchant e-KYC API | `POST /onboard/onboard/activate_merchant` | 📄 Docs captured |
| 3 | ONBOARD STATUS CHECK | `POST /onboard/onboard/getonboardstatus` | 📄 Docs captured |
| 4 | ONBOARD STATUS CHECK DMT CASA | `POST /dmt-casa/merchant/index` | 📄 Docs captured |
| 5 | SEND OTP | `POST /aeps/kyc/V3/send_otp` | 📄 Docs captured |
| 6 | Verify OTP | `POST /aeps/kyc/V3/verify_otp` | 📄 Docs captured |
| 7 | Merchant PAN Update | `POST /onboard/onboard/pan_update_bank6` | 📄 Docs captured |

---

## Supporting assets (non-REST)

- RD service ZIPs (Mantra / Morpho / Precision / Secugen / Iris) via docs.paysprint.in
- Android onboarding AAR / demo ZIP (MATM onboarding paths in PDF)
- Onboarding state CSV
- **AePS body encryption technique** page — AES before biometric APIs


## 1. Onboarding Web

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/onboardnew/getonboardurl` |
| **OpenAPI path** | `/onboard/onboardnew/getonboardurl` |
| **OpenAPI operationId** | `onboarding` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `latitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `longitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `annual_income` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `nature_of_bussiness` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `redirecturl` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `onboard_pending` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_casa` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/onboardnew/getonboardurl' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, aadhaar, piddata, dob, pipe, accessmode, latitude, longitude */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Onboarding Web`
- Required (OpenAPI — may be polluted): `merchantcode, aadhaar, piddata, dob, pipe, accessmode, latitude, longitude, annual_income, nature_of_bussiness`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 2. Bank 2, Bank5 & Bank 6 Merchant e KYC API

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/activate_merchant` |
| **OpenAPI path** | `/onboard/onboard/activate_merchant` |
| **OpenAPI operationId** | `merchant-activation-api-copy` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `aadhaar` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `piddata` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `accessmode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `latitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `longitude` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `annual_income` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `nature_of_bussiness` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_casa` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/activate_merchant' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, aadhaar, piddata, dob, pipe, accessmode, latitude, longitude */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Bank 2, Bank5 & Bank 6 Merchant e-KYC API`
- Required (OpenAPI — may be polluted): `merchantcode, aadhaar, piddata, dob, pipe, accessmode, latitude, longitude, annual_income, nature_of_bussiness`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 3. ONBOARD STATUS CHECK

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/getonboardstatus` |
| **OpenAPI path** | `/onboard/onboard/getonboardstatus` |
| **OpenAPI operationId** | `onboard-status-check-for-pipe-wise` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `mobile` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pipe` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_casa` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otpreqid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/getonboardstatus' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, mobile, pipe, name, pan, dob, is_casa, otpreqid */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `ONBOARD STATUS CHECK`
- Required (OpenAPI — may be polluted): `merchantcode, mobile, pipe, name, pan, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 4. ONBOARD STATUS CHECK DMT CASA

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/dmt-casa/merchant/index` |
| **OpenAPI path** | `/dmt-casa/merchant/index` |
| **OpenAPI operationId** | `onboard-status-check-dmt-casa` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `is_casa` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otpreqid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/dmt-casa/merchant/index' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, name, pan, dob, is_casa, otpreqid */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `ONBOARD STATUS CHECK DMT CASA`
- Required (OpenAPI — may be polluted): `merchantcode, name, pan, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 5. SEND OTP

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/V3/send_otp` |
| **OpenAPI path** | `/aeps/kyc/V3/send_otp` |
| **OpenAPI operationId** | `send-otp-9` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | JWT |
| `Authorisedkey` | String | O* | UAT |
| `Content-Type` | String | M | JSON |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `otpreqid` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/V3/send_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, name, pan, dob, otpreqid */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `SEND OTP`
- Required (OpenAPI — may be polluted): `merchantcode, name, pan, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 6. Verify OTP

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/V3/verify_otp` |
| **OpenAPI path** | `/aeps/kyc/V3/verify_otp` |
| **OpenAPI operationId** | `verify-otp-8` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | JWT |
| `Authorisedkey` | String | O* | UAT |
| `Content-Type` | String | M | JSON |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/aeps/kyc/V3/verify_otp' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, name, pan, dob */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Verify OTP`
- Required (OpenAPI — may be polluted): `merchantcode, name, pan, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


## 7. Merchant PAN Update

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/pan_update_bank6` |
| **OpenAPI path** | `/onboard/onboard/pan_update_bank6` |
| **OpenAPI operationId** | `merchant-pan-update` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M | JWT |
| `Authorisedkey` | String | O* | UAT |
| `Content-Type` | String | M | JSON |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `merchantcode` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `name` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `pan` | — | From docs (confirm) | M/O | OpenAPI may pollute required |
| `dob` | — | From docs (confirm) | M/O | OpenAPI may pollute required |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/onboard/onboard/pan_update_bank6' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* merchantcode, name, pan, dob */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- OpenAPI summary: `Merchant PAN Update`
- Required (OpenAPI — may be polluted): `merchantcode, name, pan, dob`
- Confirm Live vs UAT host with PaySprint.

### Gotchas

- Trust partner Postman/live sample over OpenAPI `required[]`.
- Mask PII (Aadhaar, mobile, account, PAN, biometrics) in logs.
- Timeout → Pending + status/query API.

### Related

—


---

## Flows

1. `getonboardurl` / `getonboardurl` v2 → open `redirecturl` for merchant
2. Complete UI / SDK steps (Aadhaar, docs)
3. `activate_merchant` with `piddata` + demographics when required
4. Poll `getonboardstatus` with `merchantcode`, `mobile`, `pipe`
5. Bank1 may need separate eKYC OTP flow (`aeps/kyc/V3/*` or Bank1 merchantkyc)
6. Optional `pan_update_bank6`
