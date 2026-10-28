# Questions for Noble before go-live (28 Oct 2026)

From a line-by-line check of our integration against the Noble API docs (`NobleWebStudio/`).
Answers change money handling — share this list with the Noble integration team.

## Most urgent (money safety)

1. Does every AEPS cash withdrawal, cash deposit and Aadhaar Pay submit reply always include `tranStatus`?
2. Can an AEPS submit return `status:0` when the bank result is unknown (bank timeout)? Which codes are final failures and which mean "check status later"? Please share the full AEPS error-code list.
3. Is "No Records Found" always `AG0003` with that exact text for AEPS status checks? For DMT is it always `DB0042` with `status:-1`, and is it final one hour after submission?
4. What does `recharge_status` return for a `transactionId` you never received, and after how long is that final? On `recharge_b2b`, can `status 0` without `tranStatus` ever mean the recharge was accepted or our balance was debited?
5. What is the full response of `transaction_validate_otp` (DMT transfer)? Does it include `transactionStatus`? What are all possible `transactionStatus` values, and is `Refunded` final (who receives the refund)?
6. Your sample token shows an IP whitelist and a limit of 5 requests per minute. Is that per account or per endpoint, and can it be raised? Please whitelist our production EC2 outgoing IP.
7. Airtel CMS: is the collected amount debited from or credited to our Noble balance, when, and is `commission` paid to us? (CMS stays off until answered.)
8. Do you send AEPS / DMT / recharge callbacks? If yes, the payload, and can you send a custom header (`X-Callback-Token`) or only a `?token=` query parameter?

## AEPS

9. Recommended submit timeout (ours is 40 s)? How soon after submit, and for how long, does the status API return a record?
10. Is `transactionDate` our request date or your receipt date for a request sent around midnight IST? Is the 4-day status window for all AEPS products or only UPI QR?
11. Maximum `transactionId` length for AEPS? Must the Generate-OTP `transactionId` match the later transaction's `transactionId`?
12. Is there an AEPS bank-list API? Is `bankName` checked against `bankIn`?
13. Exact mini-statement reply format (field names for date, narration, amount, credit/debit)?
14. Recon (`reconData`): does `1` mean success and `0` failed? Is the middle field our `transactionId`? Does re-sending a day with the same `uniqueDateTransactionId` replace or duplicate it? When may failed records have an empty RRN?
15. Is `ipAddress` `127.0.0.1` accepted when no public client IP is known, or should we send our server IP?
16. Onboarding `dob` format: `DD/MM/YYYY` or `DD-MM-YYYY` (table and sample differ)? Allowed `businessNature` and `annualIncome` values? Does AEPS KYC accept face or iris?

## DMT

17. Per-transfer minimum ₹1 or ₹100? Paise allowed or whole rupees only?
18. Actual per-remitter monthly and daily limits? What do `dcmv`, `mcmv` and `mpt` mean?
19. eKYC: `merchantMobileNumber` (parameter table) or `merchantMobileNo` (sample body, which we send)?
20. When `validate_aadhar` returns `RS_OB_009` ("Aadhaar already registered"), should we continue to the registration OTP?
21. Must the transfer amount equal the amount used at transaction-OTP time?
22. Is `bankName` validated or free text?
23. Is the Step-1 token tied to one remitter session, and how long is it valid?

## Recharge / bank check

24. Full B2B operator code list — are `JIO_B2B`, `VI_B2B`, `BSNL_B2B`, `TATASKY_B2B`, `SUNTV_B2B`, `VIDEOCON_B2B` valid?
25. Does `amount` accept decimals like `299.50`?
26. Does a penniless `tranStatus: Failed` mean the account is invalid, or only that the lookup couldn't resolve it?
27. Cost per hit for penny drop and penniless; is the ₹1 penny drop refunded?
28. CMS `merchantId`: the retailer's mobile number or an id you assign? All possible CMS `tranStatus` values?
