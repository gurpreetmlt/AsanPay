# Noble Web Studio — DMT

> Domestic Money Transfer via Airtel / Jio / Fino + beneficiary add-ons.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble DMT** inside AsanPay. Do not mix InstantPay request shapes with these URLs.

## Suggested flow order

- Airtel: get_customer → validate_aadhar → registration OTP/validate → eKYC → txn OTP/validate → status.
- Jio: remitter_login → reg OTP → verify → register_ekyc → txn OTP → verify_submit → status.
- Fino: search → limit → eKYC → reg OTP → registration → txn OTP → transfer → status.
- Bene add-ons: add / get / delete under /bene/*.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Get Customer (Step 1) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/get_customer` |
| 2 | `POST` | Validate Aadhar (Step 2) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/validate_aadhar` |
| 3 | `POST` | Sender Registration OTP (Step 3) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_otp` |
| 4 | `POST` | Sender Registration Validate OTP (Step 4) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_validate_otp` |
| 5 | `POST` | Sender Registration E-KYC (Step 5) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_ekyc` |
| 6 | `POST` | Transaction OTP (Step 6) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_otp` |
| 7 | `POST` | Transaction Validate OTP (Step 7) | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_validate_otp` |
| 8 | `POST` | Transaction Status | `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_status` |
| 9 | `POST` | remitter_login | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/remitter_login` |
| 10 | `POST` | reg_send_otp | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/reg_send_otp` |
| 11 | `POST` | reg_verify_otp | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/reg_verify_otp` |
| 12 | `POST` | register_ekyc | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/register_ekyc` |
| 13 | `POST` | txn_send_otp | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_send_otp` |
| 14 | `POST` | txn_verify_submit | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_verify_submit` |
| 15 | `POST` | txn_status | `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_status` |
| 16 | `POST` | Search Customer (Step 1) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/search_customer` |
| 17 | `POST` | Customer Limit (Step 2) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_limit` |
| 18 | `POST` | Customer eKYC (Step 3) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_ekyc` |
| 19 | `POST` | Generate OTP Registration (Step 4) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/generate_otp_registration` |
| 20 | `POST` | Customer Registration (Step 5) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_registration` |
| 21 | `POST` | Generate OTP Transaction (Step 6) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/generate_otp_transaction` |
| 22 | `POST` | Transfer Transaction (Step 7) | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/transfer_transaction` |
| 23 | `POST` | Transaction Status | `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/transaction_status` |
| 24 | `POST` | Add Bene | `https://dmt.noblewebstudio.in/api/v1.0/bene/add` |
| 25 | `POST` | Get Bene | `https://dmt.noblewebstudio.in/api/v1.0/bene/get` |
| 26 | `POST` | Delete Bene | `https://dmt.noblewebstudio.in/api/v1.0/bene/delete` |

## Endpoint details

### POST — Get Customer (Step 1)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/get_customer`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint allows you to retrieve customer information based on the provided mobile number and geographical coordinates. (This endpoint will be used to get a session token which will be used for the each customer. Please generate session for each customer.)

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

merchantMobileNumber
YES
string
Merchant mobile number (must be numeric 10 digit).
9829098290

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "merchantMobileNumber": "string"
}

Response
This endpoint allows you to retrieve customer information based on the provided mobile number and location coordinates. Ensure that the mobile number is valid to receive accurate results.

Successful authentication will yield a response containing relevant token or customer details or an error message if the authentication fails.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "TE0005",
  "message": "Token Error",
  "description": "Unable to generate token",
  "responseData": "[]"
}

Response 2 : Success (For New Customer)
{
 "status": 0,
  "statusCode": "RS015",
  "message": "This customer is not registered for DMT service.",
  "description": "",
  "responseData": [
    {
      "token": "MjQzMjYxMjQzMTMyMjQ1NzQ0Nzc2ZDUwNDM2ODdhNTc1OTY4NDE0NjVhNzc0MjMwMzg0MzM0NTI2NTZlNjU0NTY0NDE0Mzc2NmQ3MjM0NmM1MTUyNTk2YTU5NjQ2YjYyNzc3NjMxMmU2NTZmMmY2ZjY3NDk2MzRm"
    }
  ]
}

Response 2 : Success (For Existing Customer)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "This customer is already registered for DMT service.",
  "responseData": [
    {
      "dcmv": "5000",
      "mcmv": "5000",
      "mpt": "5

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
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "merchantMobileNumber": "string"
}
```

---

### POST — Validate Aadhar (Step 2)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/validate_aadhar`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

If you receive a status of 0 and a statusCode of RS015 in Step 1 (Get Customer), then this endpoint should be used to validate an Aadhaar number by providing the required details, including the mobile number, geographical location, and an authentication token.

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

aadharNumber
YES
string
Customer aadhar number (must be numeric 12 digit).
"123456789012"

token
YES
string
An authentication token required for the request.
{received from step 1 (Get Customer) API}

Notes

- The token must be valid and active for the request to be processed successfully.

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "aadharNumber": "string",
  "token": "string"
}

Response
The response will typically include a status indicating whether the validation was successful or not, along with any relevant messages or error codes. Ensure to handle the response appropriately based on the status returned.

Successful authentication will yield a response containing relevant token or an error message if the authentication fails.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "RS_OB_009",
  "message": "This Aadhaar number is already registered in DMT. Please provide valid Aadhaar number to proceed.",
  "description": "",
  "responseData": null
}

Response 2 : Failure
{
  "status": 0,
  "statusCode": "SBA001",
  "message": "Sorry! Money Transfer (DMT) service is not available for Airtel Payments Bank account holders.",
  "description": "",
  "responseData": null
}

Response 3 : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Congratulations ! Customer is eligible fo

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
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "aadharNumber": "string",
  "token": "string"
}
```

---

### POST — Sender Registration OTP (Step 3)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_otp`
- **Auth:** Auth type: noauth

**Vendor description**

If you receive a status of 0 and a code of RS_OB_009 in Step 2 (Validate Aadhar), then this API is used to send an OTP (One-Time Password) to the customer's mobile number provided. The response will include a verificationToken, which must be used in Step 4 (Sender Registration Validate OTP).

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string"
}

Response
Successful authentication will yield a response containing relevant token or an error message if the authentication fails.

Notes

- The OTP sent to the mobile number will be valid for a limited time (until access token expires {received from step 1 (Get Customer) API}).

- This endpoint is crucial for ensuring that the sender's identity is verified before proceeding with further actions in the Airtel DMT service.

- Click here for detailed instructions on how to enter latitude and longitude values.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "",
  "message": "",
  "description": "",
  "responseData": "[]"
}

Response 2 : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "token": "example-verification-token",
      "tokenType": "VERIFICATION",
      "expiresIn": "3600",
      "authChallengeURI": "/auth/otp/verify"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string"
}
```

---

### POST — Sender Registration Validate OTP (Step 4)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_validate_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to validate the One-Time Password (OTP) sent to the customer's mobile number. Upon successful validation, the API returns an access token, which must be provided in Step 5 (Sender Registration E-KYC).

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

otp
YES
string
The One-Time Password that was sent to the mobile number for verification. (must be numeric 6 digit).
123456

token
YES
string
An authentication token required for the request.
{received from step 3 (Sender Registration OTP) API}

Notes

- The token and otp must be valid and active for the request to be processed successfully.

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "otp": "string",
  "token": "string"
}

Response
Successful authentication will yield a response containing relevant token or an error message if the authentication fails.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "",
  "message": "",
  "description": "",
  "responseData": "[]"
}

Response 2 : Success
{
 "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "token": "example-verification-token",
      "tokenType": "VERIFICATION",
      "expiresIn": "3600",
      "authChallengeURI": "/auth/otp/verify"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "otp": "string",
  "token": "string"
}
```

---

### POST — Sender Registration E-KYC (Step 5)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/sender_registration_ekyc`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint facilitates customer registration through the eKYC (Electronic Know Your Customer) process. It is designed to collect the essential details required to register a customer for the Airtel DMT (Direct Money Transfer) service. Upon successful registration, the API returns an access token, which must be sent in Step 5 (Sender Registration E-KYC)."

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

merchantMobileNumber
YES
string
Merchant mobile number (must be numeric 10 digit).
9829098290

transactionId
YES
string
A unique identifier for the transaction at partner end (between 12 to 25 characters long).
ABC9876543210

token
YES
string
An authentication token required for the request.
{received from step 4 (Sender Registration Validate OTP) API}

bioType
YES
string
The type of biometric data being submitted.
0,1 or 2

pidData
YES
string
The Personal Identification Data related to the customer.
"string" FromBase64String

Remitter KYC Authentication Note
The Remitter KYC process will be considered valid only after successful biometric or face authentication, using the corresponding Aadhaar Wadh value as shown below:

Bio Type
Authentication Type
Wadh Value
F Type

0
Biometric Authentication (Finger Scan)
E0jzJ/P8UopUHAieZn8CKqS4WPMi5ZSYXgfnlfkWjrc=
FMR,FIR

1
Biometric Authentication (IRIS Scan)
NA
FIR

2
Face Authentication
sgydIC09zzy6f8Lb3xaAqzKquKe9lFcNR9uTvYxFp+A=
FID

✅ Ensure that the correct Wadh value is used based on the authentication method selected by the remitter.

Notes

- The token and pidData must be valid and active for the request to be processed successfully.

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "strin

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
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "merchantMobileNo": "string",
  "transactionId": "string",
  "token": "string",
  "bioType": "string",
  "pidData": "string"
}
```

---

### POST — Transaction OTP (Step 6)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to send an OTP (One-Time Password) to the customer's mobile number provided. The response will include a verificationToken, which must be used in Step 7 (Transaction Validate OTP).

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

amount
YES
string
Amount of transaction (must be numeric between 1 and 5000).
77.5945

transactionId
YES
string
A unique identifier for the transaction at partner end (between 12 to 25 characters long).
ABC9876543210

Request Body Example
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "amount": "string",
  "transactionId": "string"
}

Response
Successful authentication will yield a response containing relevant token or an error message if the authentication fails.

Notes

- The OTP sent to the mobile number will be valid for a limited time (until access token expires {received from step 1 (Get Customer) API}).

- This endpoint is crucial for ensuring that the customer's identity is verified before proceeding with further actions in the Airtel DMT service.

- Click here for detailed instructions on how to enter latitude and longitude values.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "",
  "message": "",
  "description": "",
  "responseData": "[]"
}

Response 2 : Success
{
 "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "token": "example-verification-token",
      "tokenType": "VERIFICATION",
      "expiresIn": "3600",
      "authChallengeURI": "/auth/otp/verify"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "amount": "string",
  "transactionId": "string"
}
```

---

### POST — Transaction Validate OTP (Step 7)

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_validate_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint verifies the OTP sent to the user's mobile number for a transaction. On success, it returns an access token required for the transaction API. It also initiates an IMPS or NEFT transfer to the beneficiary's account with the specified amount.

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

latitude
YES
string
The latitude coordinate of the customer's location.
12.9715

longitude
YES
string
The longitude coordinate of the customer's location.
77.5945

otp
YES
string
The One-Time Password that was sent to the mobile number for verification. (must be numeric 6 digit).
123456 {received on mobile from step 6 (Transaction OTP) API}

amount
YES
string
Amount of transaction (must be numeric between 100 and 5000).
100

transactionId
YES
string
A unique identifier for the transaction at partner end (between 12 to 25 characters long).
ABC9876543210

token
YES
string
An authentication token required for the request.
{received from step 6 (Transaction OTP) API}

retailerId
YES
string
between 5 to 15 characters (Alphanumeric)
RID9950244184

beneName
YES
string
The name of the beneficiary receiving the funds
Test Singh

bankName
YES
string
The name of the bank where the beneficiary holds an account.
ICICI Bank

ifsc
YES
string
The IFSC code of the beneficiary's bank (Alphanumeric).
ICIC0000012

beneAccountNumber
YES
string
Beneficiary Account Number (must be numeric)
465464654646445465

beneMobileNumber
YES
string
Beneficiary Mobile Number (must be numeric 10 digit)
9680976135

transferMode
YES
string
Mode of Payment.
IMPS OR NEFT

Notes

- The token and otp must be valid and active for the request to be processed successfully.

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
 "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "otp": "string",
  "amount": "string",
  "transactionId": "string",
  "token": "string",
  "retailerId": "string",


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
  "mobileNumber": "string",
  "latitude": "string",
  "longitude": "string",
  "otp": "string",
  "amount": "string",
  "transactionId": "string",
  "token": "string",
  "retailerId": "string",
  "beneName": "string",
  "bankName": "string",
  "ifsc": "string",
  "beneAccountNumber": "string",
  "beneMobileNumber": "string",
  "transferMode": "string"
}
```

---

### POST — Transaction Status

- **Folder:** `DMT/AIRTEL DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/airtel_dmt/transaction_status`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API endpoint is used to retrieve the status of a transaction.

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

transactionId
YES
string
same transactionId using in Transaction API.
ABC9876543210

Request Body Example
{
  "mobileNumber": "string",
  "transactionId": "string"
}

Response
Successful authentication will yield a response containing relevant status of the transaction or an error message if the authentication fails.

Response 1 : Failure
{
  "status": -1,
  "statusCode": "DB0042",
  "message": "DB Response",
  "description": "No records found",
  "responseData": "[]"
}

Response 2 : Success
{
 "status": 1,
  "statusCode": "DB0031",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "654654654654",
      "bankTransactionId": "7194738830",
      "amount": "100",
      "charges": "12",
      "rrn": "518120786738",
      "transactionStatus": "Success",
      "transactionDate": "2024-06-30 20:09:51.510",
      "transactionLastUpdate": "2024-06-30 20:10:51.510"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "transactionId": "string"
}
```

---

### POST — remitter_login

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/remitter_login`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

The entry point for both flows. Checks whether the mobile number is already registered with Jio Payments Bank.

- registered: true — responseData carries the remitter's profile, including the remittanceUserId you need for transfers, plus a limits block. Go to txn_send_otp.

- registered: false — no remitter for this mobile. Go to reg_send_otp.

Limits
limits is always present when registered is true, and always contains all six fields.

If the bank's limit service is unavailable, the lookup still succeeds and every limit value is returned as 0. Treat an all-zero block as "limits unknown", not as "limit exhausted".

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9.
9876543210

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "WEB",
  "deviceOsType": "WINDOWS",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "publicIp": "192.156.29.55",
  "remitterMobile": "9876543210"
}

Response (Success)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Registration required",
  "responseData": [
    {
      "registered": false
    }
  ]
}

Response (Success)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Remitter found",
  "responseData": [
    {
      "registered": true,
      "remittanceUserId": "13456763222000259",
      "aadharToken": "0b45fdaa03e14d41xxx317b

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
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string"
}
```

---

### POST — reg_send_otp

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/reg_send_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Sends a 6-digit OTP to the remitter's mobile number to begin registration.

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9.
9876543210

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "WEB",
  "deviceOsType": "WINDOWS",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "publicIp": "192.156.29.55",
  "remitterMobile": "9876543210"
}

Response (Success)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "OTP sent",
  "responseData": []
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string"
}
```

---

### POST — reg_verify_otp

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/reg_verify_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Verifies the OTP and returns an authorizationCode. Keep it — register_ekyc will not work without it.

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9. (Same number the OTP was sent to.)
9876543210

otp
YES
string
6 digits
123456

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "WEB",
  "deviceOsType": "WINDOWS",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "publicIp": "192.156.29.55",
  "remitterMobile": "9876543210",
  "otp": "123456"
}

Response (Success)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "OTP verified",
  "responseData": [
    {
      "authorizationCode": "12a689cb-48ec-47c9-a556-9b15dxxd82d7"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string",
  "otp": "string"
}
```

---

### POST — register_ekyc

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/register_ekyc`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Performs the Aadhaar biometric eKYC and creates the remitter at Jio Payments Bank in a single call. Returns the remittanceUserId, which every later call needs. Store it against the mobile number.

What it costs, and when
Registration is a chargeable call, but the charge is taken after the eKYC succeeds. A failed fingerprint, an empty wallet or a duplicate transactionId all stop the call before anything is debited. If the bank then rejects the registration, the charge is reversed automatically.

Retrying
If the call fails after the eKYC succeeded, retry with a new transactionId — the old one is already recorded and will be rejected as a duplicate.

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9.
9876543210

transactionId
YES
string
Your unique reference, 12-15 chars. Use a new one for each attempt.
202409161539465

authorizationCode
YES
string
From reg_verify_otp. Max 256 chars.
12a689cb-48ec-47c9-a556-9b15dxxd82d7

aadhaarNumber
YES
string
12 digits, first digit 1-9.
123412341234

occupationCode
YES
string
Numeric. Defaults to 5 when blank.
5

deviceId
YES
string
Biometric terminal id. Send "" if unused.
device

deviceOsVer
YES
string
Send "" if unused.
30

deviceModel
YES
string
Send "" if unused.
Android

bioType
YES
string
0 = FMR/FIR, 1 = FIR, 2 = FID (face).
0

pidData
YES
string
Base64 of the raw RD-service PID XML. Max 60000.
"BASE64_ENCODED_PID_XML"

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgent

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
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string",
  "transactionId": "string",
  "authorizationCode": "string",
  "aadhaarNumber": "string",
  "occupationCode": "string",
  "deviceId": "string",
  "deviceOsVer": "string",
  "deviceModel": "string",
  "bioType": "string",
  "pidData": "string"
}
```

---

### POST — txn_send_otp

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_send_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Sends the transaction OTP to the remitter. The bank quotes the amount in the SMS, so amount here must match the amount you send to txn_verify_submit.

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9.
9876543210

amount
YES
string
100-5000, whole rupees, no decimals.
5000

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "WEB",
  "deviceOsType": "WINDOWS",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "publicIp": "192.156.29.55",
  "remitterMobile": "9876543210",
  "amount": "5000"
}

Response (Success)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "OTP sent",
  "responseData": []
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string",
  "amount": "string"
}
```

---

### POST — txn_verify_submit

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_verify_submit`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Verifies the OTP and transfers the money in a single call.

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
2024-06-17T21:27:09

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
Encrypted agent handle.
BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9

channel
YES
string
WEB or MOB.
MOB

deviceOsType
YES
string
WINDOWS or ANDROID.
ANDROID

latitude
YES
string
Latitude coordinate of the agent location (Must be 4 decimal places)
e.g. 12.9715.

longitude
YES
string
Longitude coordinate of the agent location (Must be 4 decimal places)
e.g. 77.5945.

publicIp
YES
string
Public IPv4 of the agent's device.
192.156.29.55

remitterMobile
YES
string
10 digits, starting 6-9.
9876543210

remittanceUserId
YES
string
From register_ekyc or remitter_login. Max 50.
13456763222000259

remitterName
YES
string
3-50 chars.
Demo Singh

beneName
YES
string
3-50 chars.
Test Singh

beneAccountAlias
YES
string
Nickname. Defaults to the account number. Max 50.
Test Singh

beneAccountNo
YES
string
9-18 digits.
987654321001234

beneIfscCode
YES
string
11 chars.
ICIC0000012

amount
YES
string
100-5000, whole rupees. Must match txn_send_otp.
5000

transferMode
YES
string
only IMPS allowed
IMPS

otp
YES
string
6 digits.
123456

transactionId
YES
string
Your unique reference, 12-15 chars. Use this with txn_status.
202409161539465

deviceId
YES
string
Biometric terminal id. Send "" if unused.
device

deviceOsVer
YES
string
Send "" if unused.
30

deviceModel
YES
string
Send "" if unused.
Android

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

Request Body Example
{
  "uniqueAgentId": "BOtVNjWl3+7o7NAxo5u0OxUHTIEGui7/iB7b9wgokzr4F03S7fV3AvkkIsr28+d9",
  "channel": "WEB",
  "deviceOsType": "WINDOWS",
  "latitude": "12.9715",
  "longitude": "77.5945",
  "publicIp": "192.156.29.55",
  "remitterMobile": "9876543210",
  "remittanceUserId": "13456763222000259",
  "remitterName": "Demo Singh",
  "beneName": "Test Singh",
  "beneAccountAlias": "Test Singh",
  "beneAccountNo": "987654321001234",
  "beneIfscCode": "ICIC0000012",
  "amount":

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
  "uniqueAgentId": "string",
  "channel": "string",
  "deviceOsType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string",
  "remitterMobile": "string",
  "remittanceUserId": "string",
  "remitterName": "string",
  "beneName": "string",
  "beneAccountAlias": "string",
  "beneAccountNo": "string",
  "beneIfscCode": "string",
  "amount": "string",
  "transferMode": "string",
  "otp": "string",
  "transactionId": "string",
  "deviceId": "string",
  "deviceOsVer": "string",
  "deviceModel": "string"
}
```

---

### POST — txn_status

- **Folder:** `DMT/JIO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/jio_dmt/txn_status`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API endpoint is used to retrieve the status of a transaction.

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
2024-06-17T21:27:09

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

mobileNumber
YES
string
Customer mobile number (must be numeric 10 digit).
9680976136

transactionId
YES
string
same transactionId using in Transaction API.
ABC9876543210

Request Body Example
{
  "mobileNumber": "9876543210",
  "transactionId": "202409161539465"
}

Response
Successful authentication will yield a response containing relevant status of the transaction or an error message if the authentication fails.

Response (Success)
{
  "status": 1,
  "statusCode": "DB0031",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "clientId": 100003,
      "transactionId": "202409161539465",
      "bankTransactionId": "7364042000",
      "amount": 5000,
      "charges": 50,
      "rrn": "6260107319000",
      "transactionStatus": "Pending",
      "transactionDate": "2024-09-16T13:22:28.003",
      "transactionLastUpdate": "2024-09-16T13:22:29.303",
      "transtionMode": "IMPS"
    }
  ]
}

Response (Error)
{
  "status": -1,
  "statusCode": "DB0042",
  "message": "DB Response",
  "description": "No records found",
  "responseData": "[]"
}

Notes

- This API should be used for reconciliation of pending transactions.

- Refunds are auto-processed for failed transactions as per bank policy.

- Final transaction status may take time to update.

- Always rely on transactionStatus of responseData for final confirmation.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "transactionId": "string"
}
```

---

### POST — Search Customer (Step 1)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/search_customer`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint allows you to retrieve customer information based on the provided mobile number and geographical coordinates.

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
2024-06-17T21:27:09

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

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number. (must be numeric 10 digit)
9829098290

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
This endpoint allows you to retrieve customer information based on the provided mobile number and location coordinates. Ensure that the mobile number is valid to receive accurate results.

Successful authentication will yield a response containing relevant customer details or an error message if the authentication fails.

Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Customer is registered",
  "description": "Customer is registered",
  "responseData": [
    {
      "CustomerName": "Demo Singh"
    }
  ]
}

Response : Fail
{
  "status": 0,
  "statusCode": "SS0012",
  "message": "Customer is not registered",
  "description": "Customer is not registered",
  "responseData": null
}

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

- If the customer is not registered, subsequent onboarding steps (eKYC & registration) must be initiated.

- This API acts as the entry point for the complete DMT flow.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Customer Limit (Step 2)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_limit`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to fetch the available transaction limit for a registered customer. It helps determine whether the customer is eligible to proceed with transactions based on the remaining permissible limit.

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
2024-06-17T21:27:09

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

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

Request Body Example
{
  "customerMobileNo": "9123456789"
}

Response
This API returns the current transaction limit available for the customer.

Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "CustomerLimit": 5000
    }
  ]
}

Notes

- The returned CustomerLimit represents the maximum amount the customer can transact.

- If the available limit is insufficient, the transaction flow should not proceed.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "customerMobileNo": "string"
}
```

---

### POST — Customer eKYC (Step 3)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_ekyc`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to perform Aadhaar-based biometric eKYC for the customer.
The eKYC process validates the customer identity using Aadhaar number and biometric PID data.

This step is mandatory for customer onboarding and must be completed successfully before OTP-based registration.

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
2024-06-17T21:27:09

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

customerMobileNo
YES
string
Customer mobile number (must be numeric. 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number (must be numeric. 10 digit)
9829098290

aadharNo
YES
string
Customer Aadhaar number (12 digits).
521312344321

pidData
YES
string
The Personal Identification Data related to the customer.
"string" FromBase64String

bioType
YES
string
The type of biometric data being submitted.
0,1 or 2

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "aadharNo": "521312344321",
  "pidData": "",
  "bioType": "2",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
Upon successful eKYC verification, this API returns a unique eKYC Request ID, which must be used in the customer registration step.

Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "EKYC SuccessFul",
  "description": "EKYC SuccessFul",
  "responseData": [
    {
      "RequestId": "8105828"
    }
  ]
}

Response : Fail
{
  "status": 0,
  "statusCode": "SS0012",
  "message": "998 EKYC Verification failed",
  "description": "998 EKYC Verification failed",
  "responseData": null
}

Response : Error
{
  "status": -1,
  "statusCode": "SS0013",
  "message": "Error",
  "description": "Invalid Pid Data",
  "responseData": null
}

Remitter KYC Authentication Note
The Remitter KYC process will be considered valid only after successful biometric or face authentication, using the corresponding Aadhaar Wa

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
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "aadharNo": "string",
  "pidData": "string",
  "bioType": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Generate OTP Registration (Step 4)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/generate_otp_registration`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to generate an OTP for customer registration after successful eKYC verification. The generated OTP is sent to the customer’s registered mobile number.

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
2024-06-17T21:27:09

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

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number. (must be numeric 10 digit)
9829098290

customerName
YES
string
Full name of the customer.
Demo Singh

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "customerName": "Demo Singh",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
This API generates an OTP and returns a unique OTP Request ID, which must be used during customer registration.

Response : Success (For Existing Customer)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "OTP Generated Successfully",
  "description": "OTP Generated Successfully",
  "responseData": [
    {
      "OtpRequestId": "616737694"
    }
  ]
}

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

- The returned OtpRequestId is mandatory for the Customer Registration API.

- OTP is sent to the customer’s registered mobile number.

- OTP is time-bound and valid only for a limited duration.

- Multiple OTP requests within a short interval may be restricted.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "customerName": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Customer Registration (Step 5)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/customer_registration`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to complete customer registration for the Fino DMT service using OTP verification and the previously completed eKYC request.

This step finalizes the onboarding process and enables the customer to perform money transfer transactions.

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
2024-06-17T21:27:09

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
A unique identifier for the transaction at partner end (between 12 to 25 characters long).
ABC9876543210

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number. (must be numeric 10 digit)
9829098290

otpRequestId
YES
string
OTP request ID received from registration OTP API.
616737694

otp
YES
string
OTP received by the customer. (4 Digit)
9730

ekycRequestId
YES
string
Request ID received from Customer eKYC API.
81058289

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "transactionId": "ABC9876543210",
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "otpRequestId": "616737694",
  "otp": "9730",
  "ekycRequestId": "81058289",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
This API confirms the customer registration status.

Response : Success (For Existing Customer)
{
  "status": 1,
  "statusCode": "DB0031",
  "message": "Success",
  "description": "Customer Registration Successful",
  "responseData": [
    {
      "transactionStatus": "Success",
      "transactionId": "ABC9876543210",
      "bankTransactionId": "7194738830123",
      "charges": "10",
      "detail": "Customer Registration Successful"
    }
  ]
}

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

- Successful execution of this API completes the customer onboarding process.

- The transactionId must be unique for each registration request.

- Incorrect

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
  "transactionId": "string",
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "otpRequestId": "string",
  "otp": "string",
  "ekycRequestId": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Generate OTP Transaction (Step 6)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/generate_otp_transaction`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to generate an OTP for initiating a money transfer transaction. The OTP generated through this API is required to authorize and confirm the fund transfer.

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
2024-06-17T21:27:09

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

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number. (must be numeric 10 digit)
9829098290

customerName
YES
string
Full name of the customer.
Demo Singh

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "customerName": "Demo Singh",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
This API generates an OTP for the transaction and returns an OTP Reference ID, which is required for the fund transfer API.

Response : Success (For Existing Customer)
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "OTP Generated Successfully",
  "description": "OTP Generated Successfully",
  "responseData": [
    {
      "OtpRequestId": "616770236"
    }
  ]
}

Notes

- Click here for detailed instructions on how to enter latitude and longitude values.

- The returned OtpRequestId is mandatory for the Transfer Transaction API.

- OTP is delivered to the customer’s registered mobile number.

- OTP is valid for a limited time and can be used only once.

- Multiple OTP requests in a short duration may be rate-limited.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "customerName": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Transfer Transaction (Step 7)

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/transfer_transaction`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to initiate and complete a money transfer transaction after successful OTP validation.

It debits the sender’s wallet/account and credits the beneficiary’s bank account.

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
2024-06-17T21:27:09

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
A unique identifier for the transaction at partner end (between 12 to 25 characters long).
ABC98765432100

customerMobileNo
YES
string
Customer mobile number. (must be numeric 10 digit)
9123456789

merchantMobileNo
YES
string
Merchant mobile number. (must be numeric 10 digit)
9829098290

customerName
YES
string
Customer Name
Demo Singh

beneName
YES
string
Beneficiary Name
Demo Singh Bene

beneAccountNo
YES
string
Beneficiary Account Number. (must be numeric)
987654321012

beneIfscCode
YES
string
The IFSC code of the beneficiary's bank (Alphanumeric).
ICIC0000012

amount
YES
string
Amount of transaction (must be numeric between 100 and 5000).
4500

transferMode
YES
string
Mode of Payment
IMPS OR NEFT

otpRequestId
YES
string
OTP reference ID received from Generate OTP (Transaction) API.
616770236

otp
YES
string
OTP entered by the customer (4 Digit)
1234

latitude
YES
string
Latitude of customer location.
26.9124

longitude
YES
string
Longitude of customer location.
75.7873

publicIp
YES
string
Public IP address of the request origin.
192.168.20.25

Request Body Example
{
  "transactionId": "ABC98765432100",
  "customerMobileNo": "9123456789",
  "merchantMobileNo": "9829098290",
  "customerName": "Demo Singh",
  "beneName": "Demo Singh Bene",
  "beneAccountNo": "987654321012",
  "beneIfscCode": "ICIC0000012",
  "amount": "4500",
  "transferMode": "IMPS",
  "otpRefrenceId": "616770236",
  "otp": "1234",
  "latitude": "26.9124",
  "longitude": "75.7873",
  "publicIp": "192.168.20.25"
}

Response
This API returns the transaction status, including a unique Transaction ID used for reconciliation and future reference.

Response : Success
{
  "status": 1,
  "statusCode": "DB0031",
  "message": "Success",
  "description": "Transaction successful",
  "response

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
  "transactionId": "string",
  "customerMobileNo": "string",
  "merchantMobileNo": "string",
  "customerName": "string",
  "beneName": "string",
  "beneAccountNo": "string",
  "beneIfscCode": "string",
  "amount": "string",
  "transferMode": "string",
  "otpRefrenceId": "string",
  "otp": "string",
  "latitude": "string",
  "longitude": "string",
  "publicIp": "string"
}
```

---

### POST — Transaction Status

- **Folder:** `DMT/FINO DMT`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/fino_dmt/transaction_status`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to check the status of a money transfer transaction, including success, pending, failure, or refunded states.

It is also used for refund confirmation and reconciliation in case the transaction remains pending or fails.

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
2024-06-17T21:27:09

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

mobileNo
YES
string
Customer mobile number (must be numeric 10 digit)
9123456789

transactionId
YES
string
same transactionId using in Transfer Transaction API
ABC98765432100

Request Body Example
{
  "mobileNo": "9123456789",
  "transactionId": "ABC98765432100",
}

Response
This API returns the latest transaction status along with RRN / Bank Reference Number if available.

Response : Success
{
  "status": 1,
  "statusCode": "DB0031",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "clientId": 4654654654,
      "transactionId": "ABC98765432100",
      "bankTransactionId": "ECO1226202518371094XX123",
      "amount": 4500,
      "charges": 45,
      "rrn": "536018040201",
      "transactionStatus": "Success",
      "transactionDate": "2021-12-26T18:37:10.607",
      "transactionLastUpdate": "2021-12-26T18:37:29.037",
      "transtionMode": "IMPS"
    }
  ]
}

Notes

- This API should be used for reconciliation of pending transactions.

- Refunds are auto-processed for failed transactions as per bank policy.

- Final transaction status may take time to update.

- Always rely on Transaction Status API for final confirmation.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "mobileNumber": "string",
  "transactionId": "string"
}
```

---

### POST — Add Bene

- **Folder:** `DMT/Add-Ons (Bene)`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/bene/add`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API is used to add a new beneficiary for a remitter.

Request
Request Header Parameters

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
2024-06-17T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

remitterMobile
YES
string
Remitter’s registered mobile number (must be numeric 10 digit)
9829012345

accountHolderName
YES
string
Beneficiary account holder name
Demo Singh

accountNumber
YES
string
Beneficiary bank account number
2021215830250000

ifsc
YES
string
IFSC code of beneficiary’s bank
ICIC0000001

bankName
YES
string
Bank name
ICICI BANK LIMITED

beneficiaryMobile
YES
string
Beneficiary mobile number (must be numeric 10 digit)
9123456789

Request Body Example
{
  "remitterMobile": "9829012345",
  "accountHolderName": "Demo Singh",
  "accountNumber": "2021215830250000",
  "ifsc": "ICIC0000001",
  "bankName": "ICICI BANK LIMITED",
  "beneficiaryMobile": "9123456789"
}

Response
Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "New bene added successfully",
  "description": "",
  "responseData": [
    {
      "account_no": "2021215830250000",
      "mobile": "9829012345"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "remitterMobile": "string",
  "accountHolderName": "string",
  "accountNumber": "string",
  "ifsc": "string",
  "bankName": "string",
  "beneficiaryMobile": "string"
}
```

---

### POST — Get Bene

- **Folder:** `DMT/Add-Ons (Bene)`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/bene/get`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Retrieves the list of beneficiaries linked to a remitter.

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
2024-06-17T21:27:09

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

remitterMobile
YES
string
Remitter’s registered mobile number (must be numeric 10 digit)
9829012345

Request Body Example
{
  "remitterMobile": "9829012345"
}

Response
Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "bene list fetched successfully",
  "description": "",
  "responseData": [
    {
      "account_name": "Demo Singh",
      "account_no": "2021215830250000",
      "ifsc": "ICIC0000001",
      "bank": "ICICI BANK LIMITED",
      "bene_mobile": "9123456789"
    },
    {
      "account_name": "Test Wala",
      "account_no": "23645034000",
      "ifsc": "SBIN0000001",
      "bank": "STATE BANK OF INDIA",
      "bene_mobile": "9876543210"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "remitterMobile": "string"
}
```

---

### POST — Delete Bene

- **Folder:** `DMT/Add-Ons (Bene)`
- **URL:** `https://dmt.noblewebstudio.in/api/v1.0/bene/delete`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Removes a beneficiary from a remitter’s list.

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
2024-06-17T21:27:09

Content-Type
YES
string
Request content-type.
application/json

Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

remitterMobile
YES
string
Remitter’s registered mobile number (must be numeric 10 digit)
9829012345

accountNumber
YES
string
Beneficiary bank account number
2021215830250000

ifsc
YES
string
IFSC code of beneficiary’s bank
ICIC0000001

Request Body Example
{
  "remitterMobile": "9829012345",
  "accountNumber": "2021215830250000",
  "ifsc": "AXBL0002100"
}

Response
Response : Success
{
  "status": 1,
  "statusCode": "SS0011",
  "message": "Bene deleted successfully",
  "description": "",
  "responseData": [
    {
      "account_no": "2021215830250000",
      "mobile": "9829012345"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "remitterMobile": "string",
  "accountNumber": "string",
  "ifsc": "string"
}
```

---
