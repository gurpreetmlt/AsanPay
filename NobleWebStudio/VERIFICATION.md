# Noble Web Studio — VERIFICATION

> Aadhaar OTP, PAN, GST, CIN, bank penny drop / penniless.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble VERIFICATION** inside AsanPay.

## Suggested flow order

- Aadhaar: generate_otp → verify_otp.
- Bank: pennydrop or penniless → penny_status_check.
- Identity: pan_basic/detail, gst_basic/advanced, cin_basic/advanced, voterid.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Aadhaar (Generate OTP) | `https://service.noblewebstudio.in/api/v1.0/verification/aadhaar_generate_otp` |
| 2 | `POST` | Aadhaar (Verify OTP) | `https://service.noblewebstudio.in/api/v1.0/verification/aadhaar_verify_otp` |
| 3 | `POST` | Bank Account (Penny Drop) | `https://service.noblewebstudio.in/api/v1.0/verification/pennydrop` |
| 4 | `POST` | Bank Account (Penny Less) | `https://service.noblewebstudio.in/api/v1.0/verification/penniless` |
| 5 | `POST` | Bank Account (Penny Status Check) | `https://service.noblewebstudio.in/api/v1.0/verification/penny_status_check` |
| 6 | `POST` | CIN (Basic) | `https://service.noblewebstudio.in/api/v1.0/verification/cin_basic` |
| 7 | `POST` | CIN (Advanced) | `https://service.noblewebstudio.in/api/v1.0/verification/cin_advanced` |
| 8 | `POST` | GST (Basic) | `https://service.noblewebstudio.in/api/v1.0/verification/gst_basic` |
| 9 | `POST` | GST (Advanced) | `https://service.noblewebstudio.in/api/v1.0/verification/gst_advanced` |
| 10 | `POST` | PAN (Basic) | `https://service.noblewebstudio.in/api/v1.0/verification/pan_basic` |
| 11 | `POST` | PAN (Detail) | `https://service.noblewebstudio.in/api/v1.0/verification/pan_detail` |
| 12 | `POST` | Voter ID | `https://service.noblewebstudio.in/api/v1.0/verification/voterid` |

## Endpoint details

### POST — Aadhaar (Generate OTP)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/aadhaar_generate_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Aadhaar OTP Verification APIs
API Dependency Flow
Aadhaar Generate OTP
          ↓
OTP Sent to Aadhaar Linked Mobile Number
          ↓
Aadhaar Verify OTP
          ↓
Aadhaar Details Retrieved Successfully

1. Aadhaar Generate OTP
Description
Generates an OTP and sends it to the mobile number linked with the provided Aadhaar number.

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

aadhaarNumber
YES
string
Valid 12-digit Aadhaar number.
68420404XXXX

transactionId
YES
string
Unique client transaction ID.
NWSTEST12345678910

Request Body Example
{
  "aadhaarNumber": "68420404XXXX",
  "transactionId": "NWSTEST12345678910"
}

Response
Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "OTP sent on linked mobile no",
  "responseData": [
    {
      "transactionId": "NWSTEST12345678910",
      "apiTransactionId": "20240622170522872",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Duplicate Transaction ID",
}

Response 3 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "aadhaarNumber": "string",
  "transactionId": "string"
}
```

---

### POST — Aadhaar (Verify OTP)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/aadhaar_verify_otp`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

2. Aadhaar Verify OTP
Description
Verifies the OTP received on the Aadhaar-linked mobile number and returns the Aadhaar holder's demographic details.

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

apiTransactionId
YES
string
API transaction ID received from the Aadhaar Generate OTP API.
20240622170522872

otp
YES
string
OTP received on the Aadhaar-linked mobile number.
123456

Request Body Example
{
  "apiTransactionId": "20240622170522872",
  "otp": "123456"
}

Response
Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "20240622181331127",
      "apiTransactionId": "20240622170522872",
      "name": "Demo Singh",
      "gender": "M",
      "dob": "31-12-2000",
      "careof": "S/O: Example Singh",
      "house": "111",
      "street": "Khatipura Road",
      "landmark": "Near Shiv Temple",
      "locality": "Jhotwara",
      "pincode": "302012",
      "postOffice": "Jhotwara",
      "subDistrict": "Jaipur",
      "district": "Jaipur",
      "state": "Rajasthan",
      "consent": "true",
      "consentType": "explicit",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failed Message",
}

Response 3 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message"
}

Make sure to provide valid inputs to ensure accurate verification results.

Important Notes

- The Aadhaar Verify OTP API must be called only after a successful response from the Aadhaar Generate OTP API.

- Pass the apiTransactionId received from the Aadhaar Generate OTP response to the Aadhaar Verify OTP request.

- The OTP is sent only to the mobile number linked with the provided Aadhaar number.

- ApiTransactionId is valid only for 10 minutes..

- After successful verification, the API returns the Aadhaar holder's demographic details, including:

- Name

- Gender

- Date of Birth

- C

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
  "apiTransactionId": "string",
  "otp": "string"
}
```

---

### POST — Bank Account (Penny Drop)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/pennydrop`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to initiate a verification process for a financial transaction of Rs. 1 through the PennyDrop service. It requires specific account details to validate the transaction.

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

accountNumber
YES
string
Customer account number (must be numeric).
00120160XXXX

ifsc
YES
string
The IFSC code of the customer's bank (Alphanumeric).
ICIC0000012

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "accountNumber": "string",
  "ifsc": "string",
  "transactionId": "string"
}

Response
A successful response will return the beneficiaryName and a tranStatus value of "Success".

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Beneficiary Available",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "DEMO SINGH",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "Beneficiary Available",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "accountNumber": "string",
  "ifsc": "string",
  "transactionId": "string"
}
```

---

### POST — Bank Account (Penny Less)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/penniless`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to initiate a verification process through the PennyLess service (Instant name verification without actual fund transfer). It requires specific account details to validate the transaction.

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

accountNumber
YES
string
Customer account number (must be numeric).
00120160XXXX

ifsc
YES
string
The IFSC code of the customer's bank (Alphanumeric).
ICIC0000012

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "accountNumber": "string",
  "ifsc": "string",
  "transactionId": "string"
}

Response
A successful response will return the beneficiaryName and a tranStatus value of "Success".

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Beneficiary Available",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "DEMO SINGH",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "Beneficiary Available",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "accountNumber": "string",
  "ifsc": "string",
  "transactionId": "string"
}
```

---

### POST — Bank Account (Penny Status Check)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/penny_status_check`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API endpoint is used to retrieve the status of a penny transaction.

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

transactionId
YES
string
between 12 to 25 characters long.
NBSCMS1234567

Request Body Example
{
  "transactionId": "string"
}

Response
Successful authentication will yield a response containing relevant status of the penny transaction or an error message if the authentication fails.

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Beneficiary Available",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "DEMO SINGH",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "Beneficiary Available",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "beneficiaryName": "",
      "beneficiaryAccountNumber": "00120160XXXX",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "transactionId": "DemoAU123456783"
}
```

---

### POST — CIN (Basic)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/cin_basic`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API is used to verify the validity of a 21-character Corporate Identification Number (CIN) issued by the Ministry of Corporate Affairs (India). It checks whether the provided CIN exists and returns company registration and compliance details.

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

cin
YES
string
Corporate Identification Number (must be 21 characters).
U12345MH2020PTC123456

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "cin": "U12345MH2020PTC123456",
  "transactionId": "NBSCMS1234567"
}

Response
Once the CIN is successfully validated, the API returns the following information:

1. Company Basic Details

- Company Name

- CIN Number

- Company Status (Active/Inactive)

- Registration Number

- Category & Class of Company

- Date of Incorporation

- Registered Address

- Email ID

- Listing Status

- AGM & Balance Sheet Dates

- etc...

2. Directors Details

- DIN (Director Identification Number)

- Name

- Appointment Date

- Resignation Date (if applicable)

Response (Success)
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Successful Transaction",
  "responseData": [
    {
      "tranStatus": "Success",
      "apiTransactionId": "202304031520189",
      "companyDetails": {
        "companyStatus": "Active",
        "cin": "U12345MH2020PTC123456",
        "companyId": "",
        "companyName": "EXAMPLE PRIVATE LIMITED",
        "rocCode": "ROC Jaipur",
        "registrationNumber": "123456",
        "companyCategory": "Company limited by shares",
        "companySubcategory": "Non-government company",
        "classOfCompany": "Private",
        "authorisedCapital": "200000",
        "paidUpCapital": "200000",
        "numberOfMembers": "",
        "dateOfIncorporation": "18/09/2023",
        "registeredAddress": "A-1, MANSAROVAR, Jaipur, Rajasthan, India, 302021",
        "emailId": "example@gmail.com",
        "listingStatus": "Unlisted",
        "dateOfLastAgm": "30/09/20

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
  "cin": "string",
  "transactionId": "string"
}
```

---

### POST — CIN (Advanced)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/cin_advanced`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

The CIN Advanced version includes all features available in the CIN Basic version, plus additional compliance, charge, and director-level insights.

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

cin
YES
string
Corporate Identification Number (must be 21 characters).
U12345MH2020PTC123456

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "cin": "U12345MH2020PTC123456",
  "transactionId": "NBSCMS1234567"
}

Response
Once the CIN is successfully validated, the API returns the following information:

Additional Details in Advanced
1. Extended Company Information

- Registered State, City, Pincode

- Active Compliance Status

- CIRP Status (Insolvency)

2. Charges (Loan / Security Details)

- Charge Holder Name

- Charge Amount

- Date of Creation / Modification / Satisfaction

- Charge Status (Open/Closed)

- Asset Details

3. Detailed Directors Information
Present Directors

- DIN

- Name

- PAN (Masked)

- Mobile (Masked)

- Email

- Nationality

- Gender

- Qualification

Past Directors

- Historical director records

4. Related Parties

- Associated companies linked via directors

5. All Directorships

- Director-wise company associations

- Role (Director / Nominee Director)

- Appointment details

Response (Success)
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Successful Transaction",
  "responseData": [
    {
      "tranStatus": "Success",
      "apiTransactionId": "202304031520189",
      "companyDetails": {
        "companyStatus": "Active",
        "cin": "U12345MH2020PTC123456",
        "companyId": "",
        "companyName": "EXAMPLE PRIVATE LIMITED",
        "rocCode": "ROC Jaipur",
        "registrationNumber": "123456",
        "companyCategory": "Company limited by shares",
        "companySubcategory": "Non-government company",
        "classOfCompany": "Private",
        "authorisedCapital": "200000",
        "paidUpCapital": "200000",
        "numberOfMembers": "",
        "

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
  "cin": "string",
  "transactionId": "string"
}
```

---

### POST — GST (Basic)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/gst_basic`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API is used to verify the validity of a 15-digit GSTIN issued by the Goods and Services Tax Network (GSTN), India. It checks whether the provided GSTIN exists and is valid.

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

gstin
YES
string
GST number (must be 15-character).
08AAAAA9999C1Z3

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "gstin": "08AAAAA9999C1Z3",
  "transactionId": "NBSCMS1234567"
}

Response
Once the GSTIN is successfully validated, the API returns the following information:

1. Basic GST Taxpayer Details

- Trade Name

- Legal Name

- Registered Address

- Registration Date

- GSTIN Status (Active / Cancelled)

- Cancellation Date (if applicable)

- etc...

2. Recent Tax Return Filing Details
Provides recent filing history based on the taxpayer category:

- Last 10 filing statuses of GSTR-1 and GSTR-3B

- Last 3 filing statuses of GSTR-4, GSTR-9, and GSTR-9C

- Last 8 filing statuses of CMP-08

- Other applicable return details

3. Registered Goods & Services

- List of goods and services registered under the provided GSTIN

Response (Success)
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "tranStatus": "Success",
      "apiTransactionId": "GDGDGDG4545DFGDFGD578",
      "basicDetails": {
        "gstStatus": "Active",
        "gstNumber": "08AAAAA9999C1Z3",
        "tradeName": "ABC PRIVATE LIMITED",
        "legalName": "ABC PRIVATE LIMITED",
        "constitutionOfBusiness": "Private Limited Company",
        "taxpayerType": "Regular",
        "natureOfBusiness": "SPO",
        "registrationDate": "01/01/2021",
        "cancellationDate": "",
        "natureOfBusinessActivity": "Supplier of Services",
        "address": "FIRST FLOOR, 126-126A, DEMO TOWER, New Gajab Road, B2 BY PASS CICRCLE, Maa Durge Property, Mansarovar, Jaipur, Jaipur, Rajasthan, 302020",
        "eKycVerified": "No",
        "aadhaarVerified": "No",


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
  "gstin": "string",
  "transactionId": "string"
}
```

---

### POST — GST (Advanced)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/gst_advanced`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This API is used to verify the validity of a 15-digit GSTIN issued by the Goods and Services Tax Network (GSTN), India. It checks whether the provided GSTIN exists and is valid.

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

gstin
YES
string
GST number (must be 15-character).
08AAAAA9999C1Z3

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "gstin": "08AAAAA9999C1Z3",
  "transactionId": "NBSCMS1234567"
}

Response
Once the GSTIN is successfully validated, the API returns the following information:

1. Basic GST Taxpayer Details

- Trade Name

- Legal Name

- Registered Address

- Registration Date

- GSTIN Status (Active / Cancelled)

- Cancellation Date (if applicable)

- etc...

2. Advanced GST Taxpayer Details

- Percent Tax In Cash

- Percent Tax In Cash FY

- Aggregated TurnOver

- Aggregated TurnOver FY

- Gross Total Income

- Gross Total Income FY

- Compliance Details Available Status

- Mandatede Invoice Status

- Contact Name

- Contact Mobile No

- Contact Email

- Members/Directors Name

- PdfUrl / GST Certificate URL (Valid for 10 minutes)

- etc...

3. Recent Tax Return Filing Details (Filling Status, GST Filling Delay Summary, GST Filling Gap)
Provides recent filing history based on the taxpayer category:

- Last 10 filing statuses of GSTR-1 and GSTR-3B

- Last 3 filing statuses of GSTR-4, GSTR-9, and GSTR-9C

- Last 8 filing statuses of CMP-08

- Other applicable return details

4. Registered Goods & Services

- List of goods and services registered under the provided GSTIN

Response (Success)
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
    "tranStatus": "Success",
    "apiTransactionId": "GDGDGDG4545DFGDFGD578",
    "basicDetails": {
        "gstStatus": "Active",
        "gstNumber": "08AAAAA9999C1Z3",
        "tradeName": "ABC PRIVATE LIMITED",
        "legalName": "ABC PRIVATE LIMITED",
        "constitutionOfBusiness": "Private Lim

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
  "gstin": "string",
  "transactionId": "string"
}
```

---

### POST — PAN (Basic)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/pan_basic`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to verify a user's PAN (Permanent Account Number) details based on the provided panNumber.

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

panNumber
YES
string
PAN number (must be 10-character).
AAAAA9999A

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "panNumber": "string",
  "transactionId": "string"
}

Response
This API verifies the PAN number and returns the holder name and PAN status.

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "Demo Singh",
      "pan": "AGYPXXXXXX",
      "panStatus": "Active",
      "detail": "",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "",
      "pan": "",
      "panStatus": "",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "panNumber": "string",
  "transactionId": "string"
}
```

---

### POST — PAN (Detail)

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/pan_detail`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to verify PAN (Permanent Account Number) details. It accepts a POST request to the specified endpoint and returns the verification results based on the provided PAN number.

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

panNumber
YES
string
PAN number (must be 10-character).
AAAAA9999A

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "panNumber": "string",
  "transactionId": "string"
}

Response
A successful response will return detailed PAN information, including DOB, gender, PAN type, and Aadhaar linkage status.

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "Demo Singh",
      "dob": "20/10/1999",
      "gender": "male",
      "aadhaarLinked": "true",
      "aadhaarNumber": "XXXXXXXX2332",
      "panType": "Individual",
      "detail": "",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "",
      "dob": "",
      "gender": "",
      "aadhaarLinked": "",
      "aadhaarNumber": "",
      "panType": "",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "panNumber": "string",
  "transactionId": "string"
}
```

---

### POST — Voter ID

- **Folder:** `Verification`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/verification/voterid`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Validates Voter ID (EPIC number) and returns voter details such as name, gender, age, district, and state.

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

epicNumber
YES
string
EPIC (Electors Photo Identity Card) number (must be 10 to 23 characters).
XYZ1234567

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "epicNumber": "string",
  "transactionId": "string"
}

Response
A successful response will return the voter details such as name, gender, age, district, and state.

Response 1 : Success
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "Demo Singh",
      "gender": "male",
      "age": "28",
      "districtName": "Jaipur",
      "stateName": "Rajasthan",
      "detail": "",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "VR0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "",
      "gender": "",
      "age": "",
      "districtName": "",
      "stateName": "",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "VR0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "VR0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Make sure to provide valid inputs to ensure accurate verification results.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "epicNumber": "string",
  "transactionId": "string"
}
```

---
