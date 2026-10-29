# Noble integration — answered vs still to ask (updated 29 Oct 2026)

Source: online API docs (Postman collection 45133648/2sB3QJPqzn), checked line by line.

## Answered by the online docs

| Topic | What the docs say |
|---|---|
| Rate limit | Per client; over the limit returns `AE0022` / HTTP 429. Sample token shows 5 requests / minute |
| IP whitelist | Server IP must be whitelisted against the Client ID; otherwise `AE0028`. Endpoints must be enabled per client (`AE0029`) |
| Timestamp header | `X-Timestamp` in IST `yyyy-MM-ddTHH:mm:ss`, within ±15 s |
| Request fields | Send every documented field; use `""` (never null / missing) or get `PM0002` |
| Location | Real, live, inside India, 4 decimals; AEPS blocked beyond 20 km of KYC location; web must capture location via a mobile QR flow |
| AEPS final status | `status=1` → `tranStatus` is final. `status=0` → request error. "No Records Found" = `status -1`, `AG0003` |
| AEPS amounts | Cash withdrawal, Aadhaar Pay, cash deposit: ₹100–₹10,000. Balance / mini statement: amount 0 |
| AEPS bank list | No API — Noble support sends the bank list |
| Daily 2FA | ₹0.80 + GST, charged whenever `isChargeable=YES`, even on failure. Call Load Agent first |
| Recon | `Status~TransactionID~RRN` (1 success, 0 failed), max 500 per call, upload after 11:00 PM, same `uniqueDateTransactionId` for a re-send of the same type + date. Mandatory for month-end commission |
| DMT amounts | ₹100–₹5,000 per transfer. Remitter limit `mcmv` ₹25,000 / month, `mpt` ₹5,000 per txn, `mcv` used this month |
| DMT status | `status 1/DB0031` Success, `0/DB0032` Failed, `-1` Pending. "No records found" = `status -1`, `DB0042`. Failed DMT is auto-refunded per bank policy |
| DMT session | Airtel flow, Step-1 token and OTPs expire in 15 minutes. Steps 2, 4, 5, 7 need `token` in the body too |
| Recharge status | Use only `tranStatus` (`Success` / `Failed` / `Pending`); if missing, call the status API (`statusBy` ATI or TI_TD, date YYYY-MM-DD) |
| Recharge operators | Mobile: AIRTEL_B2B, BSNL_B2B, BSNLSTV_B2B, JIO_B2B, MTNLDELHI_B2B, MTNLMUMBAI_B2B, VI_B2B. DTH: AIRTELTV_B2B, D2H_B2B, DISHTV_B2B, JIOTV_B2B, SUNDIRECT_B2B, TATAPLAY_B2B. Circle 50 when unknown |
| Callbacks | UPI QR (2 min after txn), Recharge (15 min), CMS (3 callbacks). No AEPS / DMT callbacks |
| CMS money flow | Noble calls **our** callback: `balance_check` → `balance_check_debit` (we debit our retailer's wallet and reply "Amount Debit Successful") → `transaction_post` (final, with UTR + commission, 15 min later). We are responsible for every success reply |
| Penny drop | ₹1 financial transaction. Penniless `Failed` = verification failed, empty name |

## Confirmed by our own tests (29 Oct, dev server)

| Check | Result |
|---|---|
| Token generation | Max **5 tokens per day** ("Daily token generation limit exceeded") |
| AEPS status, unknown id | `status -1`, `AG0003`, message "Error", description "No Records Found" |
| AEPS `transactionId` length | 25 accepted, 31 rejected (`VF0003`) → max 25 |
| Recharge status, unknown id | `status 1`, `RE0001`, `tranStatus: "Failed"` — same as a real failure |
| Response time | 150–400 ms |

## Still to ask Noble (apisupport@noblewebstudio.com)

0. Token generation is limited to **5 per day**. Exact token validity (expiry time)? When does the daily counter reset? Please raise it for production (at least 20 per day).
0a. `recharge_status` returns `tranStatus: Failed` (`RE0001`) even for a `transactionId` you never received. How do we tell "not found" from a real failure (e.g. is `apiTransactionId` always present for a real transaction)?
1. What is our actual rate limit (requests per minute)? Can it be raised? Please whitelist our production server IP: 65.1.118.51 (and keep 13.206.56.155 for testing)
2. Please register our callback URLs (UPI QR, Recharge, CMS) **with `?token=<our secret>`** — the docs have no signature, so we authenticate callbacks by that token. How do we configure the callback URL?
3. Can an AEPS submit return `status 0` when the bank result is unknown (bank timeout)? Please share the full AEPS error-code list.
4. Is AEPS `AG0003` "No Records Found" final after some time (e.g. 60 min)? Same for DMT `DB0042`?
5. What does `recharge_status` return for a `transactionId` you never received?
6. CMS: besides us debiting our retailer, does Noble also debit **our Noble API balance**? When is the `commission` paid?
7. Must the Generate-OTP `transactionId` equal the cash-withdrawal `transactionId`? (max length 25 confirmed by test)
8. Recommended AEPS submit timeout (ours 40 s) and how soon the status API has the record?
9. Airtel DMT eKYC: `merchantMobileNumber` (parameter table) or `merchantMobileNo` (examples)?
10. Airtel DMT `validate_aadhar` returns `RS_OB_009` ("already registered") — continue to registration OTP or stop?
11. Airtel DMT: must the transfer amount equal the transaction-OTP amount?
12. Is `bankName` validated on beneficiary add / transfer?
13. Does recharge `amount` accept decimals (e.g. 299.50)?
14. Penny drop and penniless cost per hit; is the ₹1 penny drop refunded?
15. CMS `merchantId` — retailer mobile or a Noble-assigned id? All CMS `tranStatus` values?
