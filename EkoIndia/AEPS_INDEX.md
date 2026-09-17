# Eko AePS (Fingpay) — Doc index

Official pages paste → save here. Postman overview: [`AEPS.md`](AEPS.md).

## Collected (official)

| Step | Doc | Canonical |
|------|-----|-----------|
| 1. Activate service | [`AEPS_ACTIVATE.md`](AEPS_ACTIVATE.md) | https://eps.eko.in/docs/activate-aeps-fingpay |
| 1b. Shop types (MCC) | [`AEPS_SHOP_TYPES.md`](AEPS_SHOP_TYPES.md) | https://eps.eko.in/docs/aeps-fingpay-shop-types |
| 1c. States | [`AEPS_STATES.md`](AEPS_STATES.md) | https://eps.eko.in/docs/aeps-fingpay-states |
| 2. eKYC Send OTP | [`AEPS_EKYC_SEND_OTP.md`](AEPS_EKYC_SEND_OTP.md) | https://eps.eko.in/docs/aeps-fingpay-send-otp-kyc |
| 2b. eKYC Verify OTP | [`AEPS_EKYC_VERIFY_OTP.md`](AEPS_EKYC_VERIFY_OTP.md) | https://eps.eko.in/docs/aeps-fingpay-verify-otp-kyc |
| 2c. eKYC Biometric | [`AEPS_EKYC_BIOMETRIC.md`](AEPS_EKYC_BIOMETRIC.md) | https://eps.eko.in/docs/aeps-fingpay-biometric-ekyc |
| 3. Daily KYC | [`AEPS_DAILY_KYC.md`](AEPS_DAILY_KYC.md) | https://eps.eko.in/docs/aeps-fingpay-daily-auth |
| 4. Cash Withdrawal OTP (>₹5k) | [`AEPS_CASH_WITHDRAWAL_OTP.md`](AEPS_CASH_WITHDRAWAL_OTP.md) | https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal-otp |
| 5. Cash Withdrawal | [`AEPS_CASH_WITHDRAWAL.md`](AEPS_CASH_WITHDRAWAL.md) | https://eps.eko.in/docs/aeps-fingpay-cash-withdrawal |
| 6. Balance Enquiry | [`AEPS_BALANCE_ENQUIRY.md`](AEPS_BALANCE_ENQUIRY.md) | https://eps.eko.in/docs/aeps-fingpay-balance-enquiry |
| 7. Mini Statement | [`AEPS_MINI_STATEMENT.md`](AEPS_MINI_STATEMENT.md) | https://eps.eko.in/docs/aeps-fingpay-mini-statement |
| 8. Add Settlement Account | [`AEPS_ADD_SETTLEMENT_ACCOUNT.md`](AEPS_ADD_SETTLEMENT_ACCOUNT.md) | https://eps.eko.in/docs/aeps-add-settlement-account |
| 8b. Get Settlement Accounts | [`AEPS_GET_SETTLEMENT_ACCOUNTS.md`](AEPS_GET_SETTLEMENT_ACCOUNTS.md) | https://eps.eko.in/docs/aeps-get-settlement-accounts |
| 8c. Initiate Settlement | [`AEPS_INITIATE_SETTLEMENT.md`](AEPS_INITIATE_SETTLEMENT.md) | https://eps.eko.in/docs/aeps-initiate-settlement |

## Still needed (paste next)

- [ ] Onboard User (`user_code`)
- [x] Get Shop Types / MCC
- [x] Get States (`state_id`)
- [x] Send OTP (eKYC)
- [x] Verify OTP (eKYC)
- [x] Biometric eKYC (first-time)
- [ ] RDService / PidData + RSA public key
- [x] Cash Withdrawal OTP (>₹5k)
- [x] Cash Withdrawal
- [x] Balance Enquiry
- [x] Mini Statement
- [x] Add Settlement Account
- [x] Get Settlement Accounts
- [x] Initiate Settlement
- [ ] Get List of Banks (`bank_code` / `bank_id`)
- [ ] Shared error-codes table
- [ ] Production base URL / credentials notes

## Typical sequence

1. Onboard User → `user_code`
2. **Activate AePS Fingpay** (multipart + docs) → pending / activated
3. First-time eKYC: Send OTP → Verify OTP → Biometric
4. **Daily KYC** each calendar day (empty `wadh`)
5. Cashout: if amount **> ₹5000** → **CW OTP** then **Cash Withdrawal**; else Cash Withdrawal direct
6. **Balance Enquiry** / **Mini Statement** as needed
7. Settlement: Add Account → Get Accounts → **Initiate Settlement** (NEFT/IMPS/RTGS)
