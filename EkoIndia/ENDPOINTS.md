# Eko EPS — Endpoint catalog

Auto-generated from `postman/eps-collection.json` (staging).

**Base:** `https://staging.eko.in/ekoapi/v3`

| Folder | Name | Method | Path / URL |
|--------|------|--------|------------|
| Domestic Money Transfer (DMT) | Get Sender Profile | `GET` | `/customer/payment/dmt-fino/sender/{customer_id}` |
| Domestic Money Transfer (DMT) | Onboard Sender | `POST` | `/customer/payment/dmt-fino/sender/{customer_id}` |
| Domestic Money Transfer (DMT) | Sender eKYC (Biometric) | `PUT` | `/customer/payment/dmt-fino/sender/{customer_id}/otp` |
| Domestic Money Transfer (DMT) | Validate eKYC OTP | `PUT` | `/customer/payment/dmt-fino/sender/{customer_id}/otp/verify` |
| Domestic Money Transfer (DMT) | Get Recipients | `GET` | `/customer/payment/dmt-fino/sender/{customer_id}/recipients` |
| Domestic Money Transfer (DMT) | Add Recipient | `POST` | `/customer/payment/dmt-fino/sender/{customer_id}/recipient` |
| Domestic Money Transfer (DMT) | Send Transaction OTP | `POST` | `/customer/payment/dmt-fino/otp` |
| Domestic Money Transfer (DMT) | Initiate Transfer | `POST` | `/customer/payment/dmt-fino` |
| AePS Cashout | Activate AePS Fingpay for Agent | `PUT` | `/admin/network/agent/{user_code}/aeps-fingpay/activate` |
| AePS Cashout | Get Shop Types | `GET` | `/user/collection/aeps-fingpay/get-Mcc-Category` |
| AePS Cashout | Get States | `GET` | `/user/collection/aeps-fingpay/get-states` |
| AePS Cashout | Send OTP (eKYC) | `POST` | `/user/collection/aeps-fingpay/kyc/otp` |
| AePS Cashout | Verify OTP (eKYC) | `PUT` | `/user/collection/aeps-fingpay/kyc/otp/verify` |
| AePS Cashout | Biometric eKYC | `PUT` | `/user/collection/aeps-fingpay/kyc/biometric` |
| AePS Cashout | Daily KYC | `PUT` | `/user/collection/aeps-fingpay/kyc/biometric/daily` |
| AePS Cashout | Cash Withdrawal OTP | `POST` | `/customer/collection/aeps-fingpay/cash-withdrawal/otp/{customer_id}` |
| AePS Cashout | AePS Cash Withdrawal | `POST` | `/customer/collection/aeps-fingpay/cash-withdrawl/{customer_id}` |
| AePS Cashout | AePS Balance Enquiry | `POST` | `/customer/collection/aeps-fingpay/balance-enquiry/{customer_id}` |
| AePS Cashout | AePS Mini Statement | `POST` | `/customer/collection/aeps-fingpay/mini-statement/{customer_id}` |
| AePS Cashout | Add Settlement Bank Account | `POST` | `/user/payment/aeps/settlement/account` |
| AePS Cashout | Get Settlement Bank Accounts | `GET` | `/user/payment/aeps/settlement/accounts` |
| AePS Cashout | Initiate Settlement | `POST` | `/user/payment/aeps/settlement` |
| Bharat Bill Payment System (BBPS) | Get BBPS Categories | `GET` | `/customer/payment/bbps/categories` |
| Bharat Bill Payment System (BBPS) | Get BBPS Locations | `GET` | `/customer/payment/bbps/locations` |
| Bharat Bill Payment System (BBPS) | Get BBPS Operators | `GET` | `/customer/payment/bbps/operators` |
| Bharat Bill Payment System (BBPS) | Get Operator Parameters | `GET` | `/customer/payment/bbps/operator/{operator_id}/parameters` |
| Bharat Bill Payment System (BBPS) | Get District Discome (UPPCL) | `GET` | `/customer/payment/bbps/operators/190/district-discome` |
| Bharat Bill Payment System (BBPS) | Get Operator Code and Circle | `GET` | `/customer/payment/bbps/recharge/{customer_mobile}/operator` |
| Bharat Bill Payment System (BBPS) | Get Recharge Plans | `GET` | `/customer/payment/bbps/recharge/{customer_mobile}/operator/plans` |
| Bharat Bill Payment System (BBPS) | Fetch BBPS Bill | `GET` | `/customer/payment/bbps/bill` |
| Bharat Bill Payment System (BBPS) | Pay BBPS Bill | `POST` | `/customer/payment/bbps` |
| PAN Verification | Fetch PAN Details | `POST` | `/tools/kyc/fetch-pan` |
| PAN Verification | PAN Lite | `POST` | `/tools/kyc/pan-lite` |
| PAN Verification | PAN Advanced | `POST` | `/tools/kyc/pan-advanced` |
| PAN Verification | Bulk PAN Verification | `POST` | `/tools/kyc/pan/bulk` |
| PAN Verification | Check Bulk PAN Verification Status | `GET` | `/tools/kyc/pan/bulk/status` |
| PPI Wallet | Validate Aadhaar | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/aadhaar/otp` |
| PPI Wallet | Validate Aadhaar OTP | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/aadhaar/otp/verify` |
| PPI Wallet | Get Sender Information | `GET` | `/customer/payment/ppi-levin/sender/{customer_id}` |
| PPI Wallet | Onboard Sender | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}` |
| PPI Wallet | Verify Sender OTP | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/otp/verify` |
| PPI Wallet | Validate PAN | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/pan` |
| PPI Wallet | Get List of Recipients | `GET` | `/customer/payment/ppi-levin/sender/{customer_id}/recipients` |
| PPI Wallet | Add Recipient | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/recipient` |
| PPI Wallet | Add Recipient Bank | `POST` | `/customer/payment/ppi-levin/sender/{customer_id}/bank/recipient` |
| PPI Wallet | Send Transaction OTP | `POST` | `/customer/payment/ppi-levin/otp` |
| PPI Wallet | Initiate Transaction | `POST` | `/customer/payment/ppi-levin` |
| PPI Wallet | Get Sender Information | `GET` | `/customer/payment/ppi-digikhata/sender/{customer_id}` |
| PPI Wallet | Onboard Sender | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}` |
| PPI Wallet | Generate Sender Verification OTP | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/otp` |
| PPI Wallet | Verify Sender OTP | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/otp/verify` |
| PPI Wallet | Get Aadhaar KYC Consent Languages | `GET` | `/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/consent/languages` |
| PPI Wallet | Get Aadhaar KYC Consent Details | `GET` | `/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/consent/details` |
| PPI Wallet | Generate Sender Aadhaar OTP | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/otp` |
| PPI Wallet | Validate Sender Aadhaar OTP | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/aadhaar/otp/verify` |
| PPI Wallet | Validate Sender PAN | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/pan` |
| PPI Wallet | Load Sender DigiKhata Wallet | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/wallet/loadwallet` |
| PPI Wallet | Get List of Recipients | `GET` | `/customer/payment/ppi-digikhata/sender/{customer_id}/recipients` |
| PPI Wallet | Add Recipient | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/recipient` |
| PPI Wallet | Generate Add Recipient Bank OTP | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/recipient/bank/otp` |
| PPI Wallet | Validate OTP to Add Recipient | `POST` | `/customer/payment/ppi-digikhata/sender/{customer_id}/recipient/bank/otp/verify` |
| PPI Wallet | Send Transaction OTP | `POST` | `/customer/payment/ppi-digikhata/otp` |
| PPI Wallet | Initiate Transaction | `POST` | `/customer/payment/ppi-digikhata` |
| User & Agent Management | Onboard User | `POST` | `/user/network/eps-agent` |
| User & Agent Management | Activate Service for User | `PUT` | `/admin/network/agent/{user_code}/service/{service_code}/activate` |
| User & Agent Management | Deactivate Service for User | `PUT` | `/admin/network/agent/{user_code}/service/{service_code}/deactivate` |
| User & Agent Management | Get User's Services | `GET` | `/user/account/services` |
| User & Agent Management | Get All Services | `GET` | `/tools/catalog/service-codes` |
| User & Agent Management | Get Wallet Balance | `GET` | `/user/account/balance` |
| Transactions & Refunds | Transaction Inquiry | `GET` | `/tools/reference/transaction/{transaction-reference}` |
| Transactions & Refunds | Get Refund OTP | `POST` | `/customer/payment/refund/{tid}/otp` |
| Transactions & Refunds | Initiate Refund | `POST` | `/customer/payment/refund/{tid}` |
| Bank & IFSC | Get List of Banks | `GET` | `/tools/reference/banks` |
| Bank & IFSC | Get Bank Details | `GET` | `/tools/reference/bank/{bank_code}` |
| Bank & IFSC | Get IFSC Details | `GET` | `/tools/reference/banks/ifsc/{ifsc}` |
| DigiLocker Integration | Create DigiLocker URL | `POST` | `/tools/kyc/digilocker` |
| DigiLocker Integration | Get DigiLocker Document | `POST` | `/tools/kyc/digilocker/document` |
| DigiLocker Integration | DigiLocker Verification Status | `GET` | `/tools/kyc/digilocker/status` |
| Bank Account Verification | Bank Account Verification | `POST` | `/tools/kyc/bank-account/sync` |
| Bank Account Verification | Bank Account Verification (Pennyless) | `POST` | `/tools/kyc/bank-acc-verify-pennyless` |
| Bank Account Verification | Bulk Bank Account Verification | `POST` | `/tools/kyc/bank-account/bulk` |
| Bank Account Verification | Check Bulk Bank Account Verification Status | `GET` | `/tools/kyc/bank-account/bulk/status` |
| GST Verification | GST Verification | `POST` | `/tools/kyc/gstin` |
| GST Verification | Fetch GSTINs by PAN | `POST` | `/tools/kyc/gstin-with-pan` |
| UPI ID (VPA) Verification | UPI ID (VPA) Verification | `POST` | `/customer/payment/upi/validate-vpa` |
| Driving Licence Verification | Driving License Verification | `POST` | `/tools/kyc/driving-license` |
| Vehicle & RC Verification | Vehicle & RC Verification | `POST` | `/tools/kyc/vehicle-rc` |
| Employee Verification | Employee Verification (Advance) | `POST` | `/tools/kyc/advance-employment` |
| Reverse Geocoding | Reverse Geocoding | `POST` | `/tools/kyc/reverse-geocoding` |
| Voter ID Verification | Voter ID Verification | `POST` | `/tools/kyc/voter-id` |
| Passport Application Validation | Passport Application Validation | `POST` | `/tools/kyc/passport` |
| CIN Verification | CIN Verification | `POST` | `/tools/kyc/cin` |
| IP Verification | IP Verification | `POST` | `/tools/kyc/ip` |
| Name Match | Name Match API | `POST` | `/tools/kyc/name-match` |
| ITR Compliance Check | ITR Compliance Check | `POST` | `/tools/kyc/touras/itr-compliance` |
| DIN Verification | DIN Verification | `POST` | `/tools/kyc/touras/din-verification` |
| E-Challan Verification | E-Challan Verification | `POST` | `/tools/kyc/touras/e-challan` |
| Email Verification | Email Verification | `POST` | `/tools/kyc/touras/check-email` |
| FSSAI License Verification | FSSAI License Verification | `POST` | `/tools/kyc/touras/fetch-fssai` |
| Mobile/OTP Verification | Send OTP | `POST` | `/tools/kyc/mobile/otp` |
| Mobile/OTP Verification | Verify OTP | `PUT` | `/tools/kyc/mobile/otp/verify` |
| Mobile/OTP Verification | Validate OTP-Verification-Token | `GET` | `/tools/kyc/mobile/otp/validate-token` |
