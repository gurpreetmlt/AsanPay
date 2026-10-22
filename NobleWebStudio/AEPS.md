# Noble Web Studio — AEPS

> AEPS V2, Aadhaar Pay, Cash Deposit, UPI QR, agent onboarding, recon.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble AEPS** inside AsanPay. Do not mix InstantPay request shapes with these URLs.

## Suggested flow order

- Typical agent path: Agent Onboarding → Load Agent → KYC → Daily 2FA → Generate OTP (if needed) → Transaction → Transaction Status.
- Aadhaar Pay / UPI QR have parallel load/kyc/txn endpoints (ap_*, upiqr_*).
- Cash Deposit uses cd_transaction + cd_transaction_status.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Load Agent | `https://aeapi.noblewebstudio.in/v2.0/aeps/load_agent` |
| 2 | `POST` | Kyc | `https://aeapi.noblewebstudio.in/v2.0/aeps/kyc` |
| 3 | `POST` | Daily 2FA | `https://aeapi.noblewebstudio.in/v2.0/aeps/daily_2fa` |
| 4 | `POST` | Generate OTP | `https://aeapi.noblewebstudio.in/v2.0/aeps/generate_otp` |
| 5 | `POST` | Transaction | `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction` |
| 6 | `POST` | Transaction Status | `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction_status` |
| 7 | `POST` | Load Agent (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_load_agent` |
| 8 | `POST` | Kyc (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_kyc` |
| 9 | `POST` | Daily 2FA (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_daily_2fa` |
| 10 | `POST` | Generate OTP (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_generate_otp` |
| 11 | `POST` | Transaction (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_transaction` |
| 12 | `POST` | Transaction Status (AP) | `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction_status` |
| 13 | `POST` | Transaction (CD) | `https://aeapi.noblewebstudio.in/v2.0/aeps/cd_transaction` |
| 14 | `POST` | Transaction Status (CD) | `https://aeapi.noblewebstudio.in/v2.0/aeps/cd_transaction_status` |
| 15 | `POST` | Load Agent (UPI QR) | `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_load_agent` |
| 16 | `POST` | Kyc (UPI QR) | `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_kyc` |
| 17 | `POST` | Generate QR (UPI QR) | `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_generate` |
| 18 | `POST` | Status (UPI QR) | `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_status` |
| 19 | `POST` | Agent Onboarding | `https://aeapi.noblewebstudio.in/v2.0/aeps/agent_onboarding` |
| 20 | `POST` | Agent Onboarding Status | `https://aeapi.noblewebstudio.in/v2.0/aeps/agent_onboarding_status` |
| 21 | `POST` | Recon | `https://aeapi.noblewebstudio.in/v2.0/aeps/recon` |

## Endpoint details

### POST — Load Agent

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/load_agent`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Loads agent information and service eligibility.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

uniqueAgentId
YES
string
uniqueAgentId
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

Request Body Example
{
  "uniqueAgentId": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Agent loaded successfully",
  "responseData": [
    {
      "kycRequired": "YES",
      "kycWadhValue": "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=~8QSrHOmcQhlyjiSpIgCi7o2ugs78w+4jhckNk1jeIJg=~sgydIC09zzy6f8Lb3xaAqzKquKe9lFcNR9uTvYxFp+A=",
      "daily2faRequired": "YES",
      "amountForOtp": 5001,
      "tranTypeForOtp": "CW"
    }
  ]
}

Response Explanation

- If the response contains "kycRequired": "YES", you must initiate the KYC Verification process by calling the KYC API.

- During biometric capture for KYC, generate the PID Data using the kycWadhValue received in the Load Agent API response.

- If the response contains "daily2faRequired": "YES", you must complete the merchant's Daily 2FA Authentication by calling the Daily 2FA API before allowing any AEPS transactions.

- The amountForOtp and tranTypeForOtp parameters determine whether OTP authentication is required before the transaction.

 You must call the Generate OTP API only when all of the following conditions are satisfied:

- tranTypeForOtp returned by the Load Agent API is "CW".

- The transaction type is "CW" (Cash Withdrawal).

- The transaction amount is greater than or equal to the amountForOtp value returned by the Load Agent API.

- If any of the above OTP conditions are not met, the Generate OTP API is not required, and you can proceed directly with the Transaction API after completing the required KYC and Daily 2FA steps.

⚠️ Important Notes

- If you receive "kycRequired": "YES" in the response, you must initiate the KYC process for the merchant.

- During biometric capture, you must use the wadh value received in the response.

- The wadh value contains 3 values separated by a tilde (~)

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9"
}
```

---

### POST — Kyc

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/kyc`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs biometric KYC verification for the agent.

⚠️ KYC Consent (Very Important)
Before invoking the KYC API, you must obtain the customer's explicit consent for Aadhaar-based eKYC.

KYC Endpoint:

https://aeapi.noblewebstudio.in/v2.0/aeps/kyc

The customer must read and agree to the following consent statement before biometric authentication is initiated:

KYC Consent Declaration
"I hereby state that I voluntarily provide my Aadhaar Number and biometric information for Aadhaar-based Know Your Customer (KYC) verification for the purpose of availing AEPS services. I expressly consent to the retrieval and use of my personal information from the Aadhaar system for completing the KYC process. I have no objection to authenticating myself through the Aadhaar-based authentication system. I further provide my explicit consent to access my Full Name, Gender, Date of Birth, and Permanent Address from the Aadhaar database for this purpose."

Note: The KYC process should only be initiated after the customer has provided informed and explicit consent to the above declaration.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the KYC request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information. (max 50 characters)
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places).
77.5945

businessNature
YES
string
Nature or type of business operated by the agent. View List
Mobility

annualIncome
YES
string
Annual in

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "businessNature": "Mobility",
  "annualIncome": "100000",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Daily 2FA

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/daily_2fa`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs daily biometric 2-factor authentication.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the KYC request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

serviceType
YES
string
Service Type. Allowed only: AEPS
AEPS

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places).
77.5945

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured from RD service device.
BASE64_ENCODED_PID_XML

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "serviceType": "string",
  "channel": "string",
  "mobileDeviceId": "string",
  "ipAddress": "string",
  "userAgent": "string",
  "latitude": "string",
  "longitude": "string",
  "bioType": "string",
  "pidData": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Daily Auth Completed Successfully",
  "responseData": [
    {
      "transactionId": "NWS000123456891",
      "apiTransactionId": "2405131811063462567",
      "isChargeable": "YES",
      "surcharge": "0.9440",
      "tranCode": "AH000",
      "tranStatus": "Success"
    }
  ]
}

⚠️ Important Notes

- This API should be called for AEPS services based on the response received from the Load Agent API.

- { "daily2faRequired": "YES

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "serviceType": "AEPS",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Generate OTP

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/generate_otp`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Important Notes

- The Generate OTP API is required only when all of the following conditions are satisfied:

- tranType = "CW"

- Transaction amount is greater than or equal to the amountForOtp value received from the Load Agent API.

- tranTypeForOtp returned by the Load Agent API is "CW".

- After a successful Generate OTP API call:

- An OTP is sent to the customer's registered mobile number.

- The response contains:

- otpRequired

- otpReference

- { "otpRequired": "YES"}

 then:

- Set isOtp = "1" in the Transaction API request.

- Pass the received otpReference.

- Capture the OTP from the customer.

- Use the OTP while generating the biometric PID Data.

- Finally, call the Transaction API.

- If otpRequired = "NO", then the Transaction API can be called with isOtp=0 and otpReference="" .

- Generate OTP is not required for bankIn (990320) Or Airtel Bank Holder.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

tranType
YES
string
Transaction type. Allowed only: CW (Cash Withdrawal)
CW

amount
YES
string
Transaction amount in numeric format.
6000

bankIn
YES
string
Bank IIN / bank identifier code.
123456

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

aadhaarNumber
YES
string
Customer Aad

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "tranType": "CW",
  "amount": "6000",
  "bankIn": "123456",
  "mobileNumber": "9876543210",
  "aadhaarNumber": "987654321234"
}
```

---

### POST — Transaction

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs AEPS banking transactions.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

tranType
YES
string
Transaction type. Allowed values: CW (Cash Withdrawal), BE (Balance Enquiry), MS (Mini Statement).
CW

amount
YES
string
Transaction amount in numeric format.
2000

bankName
YES
string
Name of the customer's bank.
ICICI BANK

bankIn
YES
string
Bank IIN / bank identifier code.
123456

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

aadhaarNumber
YES
string
Customer Aadhaar number (must be valid 12 digit).
987654321234

isOtp
YES
string
Based on response of Generate OTP api. Allowed values: 0 OR 1
1

otpReference
YES
string
Based on response of Generate OTP api
OTP64564123

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured from RD service device.
BASE64_ENCODED_PID_XML

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "channel": "string",
  "mobileDeviceId": "string",
  "ipAddress": "string",
  "userAgent": "string",
  "latitude": "string",
  "longitude": "string",
  "tranType":

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "tranType": "CW",
  "amount": "2000",
  "bankName": "ICICI BANK",
  "bankIn": "123456",
  "mobileNumber": "9876543210",
  "aadhaarNumber": "987654321234",
  "isOtp": "1",
  "otpReference": "OTP64564123",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Transaction Status

- **Folder:** `AEPS/AEPS V2`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction_status`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Checks current or final status of Transaction using transactionId and transactionDate.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Which using at Transaction)
NWS000123456790

transactionDate
YES
string
Transaction Date. DD/MM/YYYY
13/05/2024

Request Body Example
{
  "transactionId": "string",
  "transactionDate": "string"
}

Response (SUCCESS)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "SUCCESS",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CW",
        "tranStatus": "Success"
      }
    ]
  }

Response (Failed)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "Transaction limit exhausted",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CW",
        "tranStatus": "Failed"
      }
    ]
  }

Response (ERROR)
{
  "status": -1,
  "statusCode": "AG0003",
  "message": "Error",
  "description": "No Records Found"
}

⚠️ Important Notes
If status = 1, then you must consider the tranStatus parameter as the final transaction status.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456790",
  "transactionDate": "13/05/2024"
}
```

---

### POST — Load Agent (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_load_agent`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Loads agent information and service eligibility.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

uniqueAgentId
YES
string
uniqueAgentId
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

Request Body Example
{
  "uniqueAgentId": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Agent loaded successfully",
  "responseData": [
    {
      "kycRequired": "YES",
      "kycWadhValue": "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=~8QSrHOmcQhlyjiSpIgCi7o2ugs78w+4jhckNk1jeIJg=~sgydIC09zzy6f8Lb3xaAqzKquKe9lFcNR9uTvYxFp+A=",
      "daily2faRequired": "YES",
      "amountForOtp": 5001,
      "tranTypeForOtp": "MT"
    }
  ]
}

Response Explanation

- If the response contains "kycRequired": "YES", you must initiate the KYC Verification process by calling the KYC API.

- During biometric capture for KYC, generate the PID Data using the kycWadhValue received in the Load Agent API response.

- If the response contains "daily2faRequired": "YES", you must complete the merchant's Daily 2FA Authentication by calling the Daily 2FA API before allowing any AEPS transactions.

- The amountForOtp and tranTypeForOtp parameters determine whether OTP authentication is required before the transaction.

 You must call the Generate OTP API only when all of the following conditions are satisfied:

- tranTypeForOtp returned by the Load Agent API is "MT".

- The transaction type is "MT" (Money Transfer).

- The transaction amount is greater than or equal to the amountForOtp value returned by the Load Agent API.

- If any of the above OTP conditions are not met, the Generate OTP API is not required, and you can proceed directly with the Transaction API after completing the required KYC and Daily 2FA steps.

⚠️ Important Notes

- If you receive "kycRequired": "YES" in the response, you must initiate the KYC process for the merchant.

- During biometric capture, you must use the wadh value received in the response.

- The wadh value contains 3 values separated by a tilde (~) i

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9"
}
```

---

### POST — Kyc (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_kyc`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs biometric KYC verification for the agent.

⚠️ KYC Consent (Very Important)
Before invoking the KYC API, you must obtain the customer's explicit consent for Aadhaar-based eKYC.

KYC Endpoint:

https://aeapi.noblewebstudio.in/v2.0/aeps/ap_kyc

The customer must read and agree to the following consent statement before biometric authentication is initiated:

KYC Consent Declaration
"I hereby state that I voluntarily provide my Aadhaar Number and biometric information for Aadhaar-based Know Your Customer (KYC) verification for the purpose of availing AEPS services. I expressly consent to the retrieval and use of my personal information from the Aadhaar system for completing the KYC process. I have no objection to authenticating myself through the Aadhaar-based authentication system. I further provide my explicit consent to access my Full Name, Gender, Date of Birth, and Permanent Address from the Aadhaar database for this purpose."

Note: The KYC process should only be initiated after the customer has provided informed and explicit consent to the above declaration.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the KYC request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places).
77.5945

dob
YES
string
Date of Birth (DD/MM/YYY)
20/10/1985

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidDat

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "dob": "20/10/1985",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Daily 2FA (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_daily_2fa`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs daily biometric 2-factor authentication.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the KYC request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

serviceType
YES
string
Service Type. Allowed only: AP
AP

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places).
77.5945

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured from RD service device.
BASE64_ENCODED_PID_XML

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "serviceType": "string",
  "channel": "string",
  "mobileDeviceId": "string",
  "ipAddress": "string",
  "userAgent": "string",
  "latitude": "string",
  "longitude": "string",
  "bioType": "string",
  "pidData": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Daily Auth Completed Successfully",
  "responseData": [
    {
      "transactionId": "NWS000123456891",
      "apiTransactionId": "2405131811063462567",
      "isChargeable": "YES",
      "surcharge": "0.9440",
      "tranCode": "AH000",
      "tranStatus": "Success"
    }
  ]
}

⚠️ Important Notes

- This API should be called for AEPS services based on the response received from the Load Agent API.

- { "daily2faRequired": "YES" }


…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "serviceType": "AP",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Generate OTP (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_generate_otp`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Important Notes

- The Generate OTP API is required only when all of the following conditions are satisfied:

- tranType = "MT"

- Transaction amount is greater than or equal to the amountForOtp value received from the Load Agent API.

- tranTypeForOtp returned by the Load Agent API is "MT".

- After a successful Generate OTP API call:

- An OTP is sent to the customer's registered mobile number.

- The response contains:

- otpRequired

- otpReference

- otpTransactionId

- otpTransactionToken

- { "otpRequired": "YES"}

 then:

- Set isOtp = "1" in the Transaction API request.

- Pass the received otpReference.

- Capture the OTP from the customer.

- Use the OTP while generating the biometric PID Data.

- Finally, call the Transaction API.

- If otpRequired = "NO", then the Transaction API can be called with isOtp=0 and otpReference="",otpTransactionId="", otpTransactionToken="".

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

tranType
YES
string
Transaction type. Allowed only: MT (Money Transfer)
MT

amount
YES
string
Transaction amount in numeric format.
6000

bankIn
YES
string
Bank IIN / bank identifier code.
123456

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

aadhaarNumber
YES
string
Cu

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "tranType": "MT",
  "amount": "6000",
  "bankIn": "123456",
  "mobileNumber": "9876543210",
  "aadhaarNumber": "987654321234"
}
```

---

### POST — Transaction (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/ap_transaction`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs Money Transfer by Aadhaar Pay.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

tranType
YES
string
Transaction type. Allowed Only: MT (Money Transfer)
MT

amount
YES
string
Transaction amount in numeric format.
6000

bankName
YES
string
Name of the customer's bank.
ICICI BANK

bankIn
YES
string
Bank IIN / bank identifier code.
123456

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

aadhaarNumber
YES
string
Customer Aadhaar number (must be valid 12 digit).
987654321234

isOtp
YES
string
Based on response of Generate OTP api. Allowed values: 0 OR 1
1

otpReference
YES
string
Based on response of Generate OTP api
OTP64564123

otpTransactionId
YES
string
Based on response of Generate OTP api
MT46264278642836

otpTransactionToken
YES
string
Based on response of Generate OTP api
asda-qjeoqq-asd-asd-as2424hjhff-fsf

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured from RD service device.
BASE64_ENCODED_PID_XML

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "channel": "strin

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "tranType": "MT",
  "amount": "6000",
  "bankName": "ICICI BANK",
  "bankIn": "123456",
  "mobileNumber": "9876543210",
  "aadhaarNumber": "987654321234",
  "isOtp": "1",
  "otpReference": "OTP64564123",
  "otpTransactionId": "MT46264278642836",
  "otpTransactionToken": "asda-qjeoqq-asd-asd-as2424hjhff-fsf",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Transaction Status (AP)

- **Folder:** `AEPS/Aadhaar Pay (AP)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/transaction_status`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Checks current or final status of Transaction using transactionId and transactionDate.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Which using at Transaction)
NWS000123456790

transactionDate
YES
string
Transaction Date. DD/MM/YYYY
13/05/2024

Request Body Example
{
  "transactionId": "string",
  "transactionDate": "string"
}

Response (SUCCESS)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "SUCCESS",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CW",
        "tranStatus": "Success"
      }
    ]
  }

Response (Failed)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "Transaction limit exhausted",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CW",
        "tranStatus": "Failed"
      }
    ]
  }

Response (ERROR)
{
  "status": -1,
  "statusCode": "AG0003",
  "message": "Error",
  "description": "No Records Found"
}

⚠️ Important Notes
If status = 1, then you must consider the tranStatus parameter as the final transaction status.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456790",
  "transactionDate": "13/05/2024"
}
```

---

### POST — Transaction (CD)

- **Folder:** `AEPS/Cash Deposit (CD)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/cd_transaction`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs Cash Deposit (CD) transactions.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

tranType
YES
string
Transaction type. Allowed Only: CD (Cash Deposit)
CD

amount
YES
string
Transaction amount in numeric format.
2000

bankName
YES
string
Name of the customer's bank.
ICICI BANK

bankIn
YES
string
Bank IIN / bank identifier code.
123456

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

aadhaarNumber
YES
string
Customer Aadhaar number (must be valid 12 digit).
987654321234

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured from RD service device.
BASE64_ENCODED_PID_XML

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "channel": "string",
  "mobileDeviceId": "string",
  "ipAddress": "string",
  "userAgent": "string",
  "latitude": "string",
  "longitude": "string",
  "tranType": "string",
  "amount": "string",
  "bankName": "string",
  "bankIn": "string",
  "mobileNumber": "string",
  "aadhaarNumber": "string",
  "bioType": "string",
  "pidData": "string"
}

Response
{
  "stat

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "tranType": "CD",
  "amount": "2000",
  "bankName": "ICICI BANK",
  "bankIn": "123456",
  "mobileNumber": "9876543210",
  "aadhaarNumber": "987654321234",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Transaction Status (CD)

- **Folder:** `AEPS/Cash Deposit (CD)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/cd_transaction_status`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Checks current or final status of CD Transaction using transactionId and transactionDate.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Which using at Transaction)
NWS000123456790

transactionDate
YES
string
Transaction Date. DD/MM/YYYY
13/05/2024

Request Body Example
{
  "transactionId": "string",
  "transactionDate": "string"
}

Response (SUCCESS)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "SUCCESS",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CD",
        "tranStatus": "Success"
      }
    ]
  }

Response (Failed)
{
  {
    "status": 1,
    "statusCode": "AG0001",
    "message": "Success",
    "description": "Transaction limit exhausted",
    "responseData": [
      {
        "transactionId": "NWS000123456790",
        "apiTransactionId": "2405131811063462567",
        "aadhaarNumber": "0862",
        "bankName": "PUNJAB NATIONAL BANK",
        "rrn": "1234567890",
        "amount": "100.0000",
        "balance": "",
        "commission": "0",
        "tranType": "CD",
        "tranStatus": "Failed"
      }
    ]
  }

Response (ERROR)
{
  "status": -1,
  "statusCode": "AG0003",
  "message": "Error",
  "description": "No Records Found"
}

⚠️ Important Notes
If status = 1, then you must consider the tranStatus parameter as the final transaction status.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456790",
  "transactionDate": "13/05/2024"
}
```

---

### POST — Load Agent (UPI QR)

- **Folder:** `AEPS/UPI QR`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_load_agent`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Loads agent information and service eligibility.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

uniqueAgentId
YES
string
uniqueAgentId
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

Request Body Example
{
  "uniqueAgentId": "string"
}

Response 1:
KYC is required.

{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Agent loaded successfully",
  "responseData": [
    {
      "kycRequired": "YES",
      "kycWadhValue": "E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=~~sgydIC09zzy6f8Lb3xaAqzKquKe9lFcNR9uTvYxFp+A="
    }
  ]
}

Response 2:
KYC has already been completed. No further KYC is required.

{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Agent loaded successfully",
  "responseData": [
    {
      "kycRequired": "NO",
      "kycWadhValue": ""
    }
  ]
}

Response 3:
KYC is pending bank approval. Please wait before performing any further action.

{
  "status": -1,
  "statusCode": "AG0003",
  "message": "Error",
  "description": "Your account is pending for approval at bank, please try after some time",
  "responseData": []
}

⚠️ Important Notes

- If you receive "kycRequired": "YES" in the response, you must initiate the UPIQR_KYC process for the merchant.

- During biometric capture, you must use the wadh value received in the response.

- The wadh value contains 3 values separated by a tilde (~) in the following sequence:

       Finger ~ Iris ~ Face

- You must split the value using ~ and use the appropriate value based on the biometric type being captured.

- If any value is blank, for example:

       finger~iris~

 it indicates that Face authentication is not available for the process.

- The same logic applies for Finger and Iris authentication as well.

- The UPIQR Load Agent API must always be called to verify whether UPIQR KYC or UPI QR Generate is required.

- This helps improve the application workflow, user interface, and user experience.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9"
}
```

---

### POST — Kyc (UPI QR)

- **Folder:** `AEPS/UPI QR`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_kyc`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Performs biometric KYC verification for the agent.

⚠️ KYC Consent (Very Important)
Before invoking the KYC API, you must obtain the customer's explicit consent for Aadhaar-based eKYC.

KYC Endpoint:

https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_kyc

The customer must read and agree to the following consent statement before biometric authentication is initiated:

KYC Consent Declaration
"I hereby state that I voluntarily provide my Aadhaar Number and biometric information for Aadhaar-based Know Your Customer (KYC) verification for the purpose of availing AEPS services. I expressly consent to the retrieval and use of my personal information from the Aadhaar system for completing the KYC process. I have no objection to authenticating myself through the Aadhaar-based authentication system. I further provide my explicit consent to access my Full Name, Gender, Date of Birth, and Permanent Address from the Aadhaar database for this purpose."

Note: The KYC process should only be initiated after the customer has provided informed and explicit consent to the above declaration.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the KYC request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places).
77.5945

bioType
YES
string
Biometric type used for authentication. Allowed values: 0, 1, 2.
0

pidData
YES
string
Encrypted biometric PID data captured

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "bioType": "0",
  "pidData": "BASE64_ENCODED_PID_XML"
}
```

---

### POST — Generate QR (UPI QR)

- **Folder:** `AEPS/UPI QR`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_generate`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Generate QR Code for UPI transactions.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Unique transaction identifier for the AEPS transaction request.
NWS000123456789

uniqueAgentId
YES
string
Unique agent identifier received during onboarding.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

mobileDeviceId
YES
string
Unique mobile device identifier of the agent device.
8f2d7c9a12bc45ef

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

userAgent
YES
string
Browser or application user-agent information.
Mozilla/5.0 Android

latitude
YES
string
Latitude coordinate of the transaction location (Must be 4 decimal places).
12.9715

longitude
YES
string
Longitude coordinate of the transaction location (Must be 4 decimal places).
77.5945

amount
YES
string
Transaction amount in numeric format.
2000

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9876543210

deviceOsType
YES
string
Unique mobile device identifier of the agent device.
ANDROID

deviceOsVersion
YES
string
Unique mobile device identifier of the agent device.
13

deviceModel
YES
string
Unique mobile device identifier of the agent device.
Redmi Note 12

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "transactionId": "string",
  "uniqueAgentId": "string",
  "channel": "string",
  "mobileDeviceId": "string",
  "ipAddress": "string",
  "userAgent": "string",
  "latitude": "string",
  "longitude": "string",
  "amount": "string",
  "mobileNumber": "string",
  "deviceOsType": "string",
  "deviceOsVersion": "string",
  "deviceModel": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "SUCCESS",
  "description": "QR Generated",
  "responseData": [
    {
      "transactionId": "NWS000123456790",
      "apiTransactionId": "2405131811063462567",
      "referenceNumber": "619466301234",
      "qr": "upi://pay?pa=

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456789",
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "APP",
  "mobileDeviceId": "DEVICE123456",
  "ipAddress": "192.156.29.55",
  "userAgent": "Mozilla/5.0",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "amount": "2000",
  "mobileNumber": "9876543210",
  "deviceOsType": "ANDROID",
  "deviceOsVersion": "13",
  "deviceModel": "Redmi Note 12"
}
```

---

### POST — Status (UPI QR)

- **Folder:** `AEPS/UPI QR`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/upiqr_status`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Checks current or final status of UPI QR Transaction using transactionId and transactionDate.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Which using at Transaction)
NWS000123456790

transactionDate
YES
string
Transaction Date. DD/MM/YYYY
13/05/2024

Request Body Example
{
  "transactionId": "string",
  "transactionDate": "string"
}

Response (SUCCESS)
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "SUCCESS",
  "responseData": [
    {
      "transactionId": "NWS000123456790",
      "apiTransactionId": "2405131811063462567",
      "accountNumber": "123456789012",
      "bankIFSC": "SBIN0001234",
      "rrn": "617210123456",
      "amount": "100.00",
      "commission": "0",
      "tranType": "QR",
      "isOnUs": "false",
      "mobileNumber": "9876543210",
      "payerVPA": "demosingh@okaxis",
      "payerName": "Demo Singh",
      "tranStatus": "SUCCESS"
    }
  ]
}

Response (ERROR)
{
  "status": -1,
  "statusCode": "AG0003",
  "message": "Error",
  "description": "No Records Found"
}

⚠️ Important Notes

- The status read has a 4 days window.

- If status = 1, then you must consider the tranStatus parameter as the final transaction status.

- The tranStatus field indicates the outcome:

- Success → Transaction successful

- Failed and Expired→ Transaction failed

- Pending → Transaction in process

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "NWS000123456790",
  "transactionDate": "13/05/2024"
}
```

---

### POST — Agent Onboarding

- **Folder:** `AEPS/Common (AEPS)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/agent_onboarding`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

Registers a new AEPS agent into the system.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

channel
YES
string
Request channel. Allowed values: APP, WEB.
APP

ipAddress
YES
string
Public IPv4 address of the agent device.
192.156.29.55

firstName
YES
string
Agent first name (letters and spaces only, max 50 chars).
Demo

middleName
NO
string
Agent middle name (letters and spaces only, max 50 chars).
Kumar

lastName
NO
string
Agent last name (letters and spaces only, max 50 chars).
Singh

mobileNumber
YES
string
Agent mobile number (must be numeric 10 digit).
9876543210

email
YES
string
Valid email address of the agent.
demo@example.com

panNumber
YES
string
Valid PAN number of the agent.
AKSJK9685B

aadhaarNumber
YES
string
Valid 12 digit Aadhaar number.
987654321234

dob
YES
string
Date of Birth (DD/MM/YYY).
20/10/1985

agentCode
YES
string
Unique ID for the agent in your system. (max 10 alphanumeric characters).
AC12345678

agentAddress
YES
string
Residential address of the agent (max 250 chars).
C 101, Bhangarh, Mansarovar, Jaipur

agentStateCode
YES
string
2 character state code of the agent address.
RJ

agentCity
YES
string
Agent city name (letters and spaces only).
Jaipur

agentPinCode
YES
string
Valid 6 digit PIN code of the agent address.
302006

agentBankName
YES
string
Bank name of the agent account.
ICICI Bank

agentBankAccountNumber
YES
string
Valid bank account number of the agent.
001201601800000

agentBankIFSC
YES
string
Valid IFSC code of the bank.
ICIC0000012

shopName
YES
string
Shop name of the agent (max 100 chars).
Singh Communication

shopAddress
YES
string
Shop address (max 250 chars).
Shop No 5, New Sanganer Road, Mansarovar, Jaipur

shopStateCode
YES
string
2 character state code of the shop address.
RJ

shopCity
YES
string
Shop city name (letters and spaces only).
Jaipur

shopPinCode
YES
string
Valid 6 digit PIN code of the shop address.
302006

shopLatitude
YES
string
Latitude coordinate of the shop location (Must be 4 decimal places).
12.9715

shopLongitude
YES
string
Longitude coordi

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "channel": "APP",
  "ipAddress": "192.156.29.55",
  "firstName": "Demo",
  "middleName": "",
  "lastName": "Singh",
  "mobileNumber": "9876543210",
  "email": "demo@example.com",
  "panNumber": "AKSJK9685B",
  "aadhaarNumber": "987654321234",
  "dob": "20-10-1985",
  "agentCode": "AC12345678",
  "agentAddress": "C 101, Bhangarh, Mansarovar, Jaipur",
  "agentStateCode": "RJ",
  "agentCity": "Jaipur",
  "agentPinCode": "302006",
  "agentBankName": "ICICI Bank",
  "agentBankAccountNumber": "001201601800000",
  "agentBankIFSC": "ICIC0000012",
  "shopName": "Singh Communication",
  "shopAddress": "Shop No 5, New Sanganer Road, Mansarovar, Jaipur",
  "shopStateCode": "RJ",
  "shopCity": "Jaipur",
  "shopPinCode": "302006",
  "shopLatitude": "12.9715",
  "shopLongitude": "77.5945",
  "isPhysicalVerified": "YES"
}
```

---

### POST — Agent Onboarding Status

- **Folder:** `AEPS/Common (AEPS)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/agent_onboarding_status`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

This is an optional API used to check the onboarding status of an AEPS agent. If agent onboarding is successful, the API returns the uniqueAgentId.

This API is useful in scenarios where the client application failed to store or capture the uniqueAgentId received in the response of the Agent Onboarding API.

Using this API, you can retrieve the same uniqueAgentId again using the agent's agentCode and panNumber.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

agentCode
YES
string
Unique agent code (max 10 alphanumeric characters).
AC12345678

panNumber
YES
string
Valid PAN number of the agent.
AKSJK9685B

Request Body Example
{
  "agentCode": "string",
  "panNumber": "string"
}

Response
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Agent onboarded successfully",
  "responseData": [
    {
      "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9"
    }
  ]
}

⚠️ Important Notes

- The uniqueAgentId returned by this API can be used for:

- Load Agent API

- KYC API

- Daily 2FA API

- Transaction API

- Both 'agentCode' and 'panNumber' must match the onboarded agent details.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "agentCode": "AC12345678",
  "panNumber": "AKSJK9685B"
}
```

---

### POST — Recon

- **Folder:** `AEPS/Common (AEPS)`
- **URL:** `https://aeapi.noblewebstudio.in/v2.0/aeps/recon`
- **Auth:** Inherit collection / Bearer (see OVERVIEW)

**Vendor description**

The Recon API is used to submit daily reconciliation data for AEPS transactions. Recon data submission is mandatory for processing monthly commission settlements.

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

Authorization
YES
string
An authentication token required for the request.
Bearer Token {received from Authorization (POST) API}

X-Timestamp
YES
string
It should be generated at the time of request, with Skew time of 15 seconds (must be in valid format {yyyy-MM-ddTHH:mm:ss}).
2024-06-27T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

uniqueDateTransactionId
YES
string
Unique identifier (10–15 characters) for a particular transaction type and transaction date.
AFGHT159753

transactionType
YES
string
Transaction type. Allowed values: CW (Cash Withdrawal) or MT (Aadhaar Pay) or 'QR' (UPI QR) or 'CD' (Cash Deposit)
CW

transactionDate
YES
string
Transaction date in DD/MM/YYYY format.
27/06/2024

reconData
YES
array of string
List of reconciliation records. Maximum 500 records can be submitted in a single request.
["1~ABC1001075834771579~555552824276"]

Request Body Example
{
  "uniqueDateTransactionId": "string",
  "transactionType": "string",
  "transactionDate": "string",
  "reconData": [
    "string"
  ]
}

Response (SUCCESS)
{
  "status": 1,
  "statusCode": "AG0001",
  "message": "Success",
  "description": "Recon data processed successfully."
}

Response (Failed)
{
  "status": 0,
  "statusCode": "AG0002",
  "message": "Failed",
  "description": "Failed Message"
}

⚠️ Important Notes

- Daily Recon submission through this API is mandatory for releasing merchant commissions during month-end settlement.

- Only the following transaction types are supported for Recon:

- CW (Cash Withdrawal)

- MT (Aadhaar Pay)

- QR (UPI QR)

- CD (Cash Deposit)

- If you are uploading Recon data for the current day (transactionDate is today's date), the upload should be performed only after 11:00 PM.

- The uniqueDateTransactionId must contain 10 to 15 characters.

 Example:

   AFGHT159753

- For multiple API calls having the same transactionType and transactionDate, the uniqueDateTransactionId should remain the same.

- If either the transactionType or transactionDate changes, a new uniqueDateTransactionId should be generated.

- The transactionDate must always be provided in the following format:

   DD/MM/YYYY

 Example:

   27/06/2024

- The reco

…(description truncated — see Postman for full text)

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueDateTransactionId": "AFGHT159753",
  "transactionType": "CW",
  "transactionDate": "27/06/2024",
  "reconData": [
    "1~ABC1001075834771579~555552824276",
    "0~ABC1001085120134632~555555076149",
    "0~ABC1001085618961113~555555089685",
    "0~ABC1001085662002486~555555090692",
    "0~ABC1001085695772332~555555091678",
    "0~ABC1001085762017820~555555093382",
    "1~ABC1001086536040811~555555116345"
  ]
}
```

---
