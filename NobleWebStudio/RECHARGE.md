# Noble Web Studio — RECHARGE

> Mobile/DTH plans, B2B/B2C recharge, status, complaints.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble RECHARGE** inside AsanPay.

## Suggested flow order

- Mobile: operator_and_circle → recharge_plans_mobile → recharge_b2b/b2c → recharge_status.
- DTH: dth_customer_info → recharge_plans_dth → recharge → status.
- Complaints: complaint → complaint_status.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Operator & Circle | `https://rcapi.noblewebstudio.in/v1.0/recharge/operator_and_circle` |
| 2 | `POST` | Recharge Plans Mobile | `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_plans_mobile` |
| 3 | `POST` | DTH Customer Info | `https://rcapi.noblewebstudio.in/v1.0/recharge/dth_customer_info` |
| 4 | `POST` | Recharge Plans DTH | `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_plans_dth` |
| 5 | `POST` | Recharge (B2B) | `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_b2b` |
| 6 | `POST` | Recharge (B2C) | `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_b2c` |
| 7 | `POST` | Recharge Status | `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_status` |
| 8 | `POST` | Complaint Registration | `https://rcapi.noblewebstudio.in/v1.0/recharge/complaint` |
| 9 | `POST` | Complaint Status | `https://rcapi.noblewebstudio.in/v1.0/recharge/complaint_status` |

## Endpoint details

### POST — Operator & Circle

- **Folder:** `Recharge/Add-Ons (Recharge)/Mobile`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/operator_and_circle`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Detects operator and circle based on the given recharge number.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

rechargeNumber
YES
string
Recharge number to know its operator and circle (must be numeric 10 digit)
9876543210

Request Body
{
  "rechargeNumber": "string"
}

Sample Request Body
{
  "rechargeNumber": "9876543210"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "apiTransactionId": "2404221130235110106",
      "operatorCodeB2B": "AIRTEL_B2B",
      "operatorCodeB2C": "AIRTEL_B2C",
      "circleCode": "30",
      "remark": "Airtel, PREPAID, Madhya Pradesh and Chhattisgarh"
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
  "rechargeNumber": "string"
}
```

---

### POST — Recharge Plans Mobile

- **Folder:** `Recharge/Add-Ons (Recharge)/Mobile`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_plans_mobile`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Returns available recharge plans based on operator and circle.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

rechargeNumber
YES
string
Recharge number to view the available recharge plans (must be numeric 10 digit)
9876543210

operatorCode
YES
string
Must be in Capital letters
AIRTEL_B2B

circleCode
YES
string
must be numeric 2 digit)
30

Request Body
{
  "rechargeNumber": "string",
  "operatorCode": "string",
  "circleCode": "string"
}

Sample Request Body
{
  "rechargeNumber": "9876543210",
  "operatorCode": "AIRTEL_B2B",
  "circleCode": "30"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "apiTransactionId": "2604221143219588312",
      "operatorCode": "AIRTEL_B2B",
      "circleCode": "30",
      "packs": [
        {
          "packCategory": "Top Data Packs",
          "pack": [
            {
              "amount": "48",
              "validity": "1 Month",
              "description": "Data : 1GB | Details : JioHotstar Mobile Subscription for 1 month"
            },
            {
              "amount": "100",
              "validity": "30 days",
              "description": "Data : 6GB | Details : JioHotstar Mobile Subscription for 30 days"
            },
            {
              "amount": "49",
              "validity": "1 day",
              "description": "Data : Unlimited | Validity : 1 day"
            },
            {
              "amount": "195",
              "validity": "30 days",
              "description": "Data: 12GB |\nDetails: JioHotstar Subscription for 3 Months, Airtel Xstream Play Premium for 30 days, Better choice over Rs. 161 pack"
            },
            {
              "amount": "279",
              "validity": "1 month",
              "description": "Data : 1GB | Details :  Netflix, JioHotstar, Airtel Xstream Play & Zee5 for 1 month."
            },
            {
              "amount": "361",
              "validity": "30 days",
              "description": "Data: 50GB | Validity: 30 days | Details: JioHotstar Subscription for 3 Months. Better choice over Rs. 161 & Rs. 195 pack"
            },
            {
              "amount": "161",
              "validity": "30 days",
              "description": "Data : 12GB | Validity : 30 days | Details : Better choice over Rs. 77, Rs. 100 & Rs. 121 pack"
            },
            {
              "amount": "33",
              "validity": "1 Day",


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
  "rechargeNumber": "string",
  "operatorCode": "string",
  "circleCode": "string"
}
```

---

### POST — DTH Customer Info

- **Folder:** `Recharge/Add-Ons (Recharge)/DTH`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/dth_customer_info`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Returns available DTH customer information based on operator and type.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

operatorCode
YES
string
Must be in Capital letters
DISHTV_B2B

type
YES
string
Must be in Capital letters
MOBILE OR ID

mobileOrId
YES
string
Mobile number or Id based on type (must be numeric)
01528277XXX

Request Body
{
  "operatorCode": "string",
  "type": "string",
  "mobileOrId": "string"
}

Sample Request Body
{
  "operatorCode": "DISHTV_B2B",
  "type": "ID",
  "mobileOrId": "01528277XXX"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "apiTransactionId": "2404211330237719770",
      "mobile": "",
      "id": "01528277XXX",
      "customerName": "Demo Singh",
      "planName": "DTH Special Plan",
      "monthlyRecharge": "350",
      "balance": "199.55",
      "lastRechargeAmount": "350",
      "lastRechargeDate": "12/04/2024",
      "NextRechargeDate": "12/05/2025",
      "accountStatus": "Active"
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
  "operatorCode": "string",
  "type": "string",
  "mobileOrId": "string"
}
```

---

### POST — Recharge Plans DTH

- **Folder:** `Recharge/Add-Ons (Recharge)/DTH`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_plans_dth`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Returns available recharge plans (DTH) based on operator.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

operatorCode
YES
string
Must be in Capital letters
AIRTELTV_B2B

Request Body
{
  "operatorCode": "string"
}

Sample Request Body
{
  "operatorCode": "AIRTELTV_B2B"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Successfully Fetched",
  "responseData": [
    {
      "apiTransactionId": "2404211521379696195",
      "operatorCode": "AIRTELTV_B2B",
      "packs": [
        {
          "key": "bengali",
          "value": {
            "addOn": [
              {
                "name": "Airtel Bengali",
                "pictureQuality": "SD",
                "languages": [
                  "Bengali"
                ],
                "prices": [
                  {
                    "amount": "95.00",
                    "validityMonths": "1"
                  }
                ]
              },
              {
                "name": "Airtel Bengali HD",
                "pictureQuality": "HD",
                "languages": [
                  "Bengali"
                ],
                "prices": [
                  {
                    "amount": "108.00",
                    "validityMonths": "1"
                  }
                ]
              },
              {
                "name": "Airtel Bengali Mini",
                "pictureQuality": "SD",
                "languages": [
                  "Bengali"
                ],
                "prices": [
                  {
                    "amount": "58.00",
                    "validityMonths": "1"
                  }
                ]
              },
              {
                "name": "Airtel Bengali Mini HD",
                "pictureQuality": "HD",
                "languages": [
                  "Bengali"
                ],
                "prices": [
                  {
                    "amount": "58.00",
                    "validityMonths": "1"
                  }
                ]
              },
              {
                "name": "Bangla Entertainment News Top Up",
                "pictureQuality": "SD",
                "languages": [
                  "Bengali"
                ],
                "prices": [
                  {
                    "amount": "62.00",
                    "validityMonths": "1"
                  }
                ]
              }
            ],
            "pl

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
  "operatorCode": "string"
}
```

---

### POST — Recharge (B2B)

- **Folder:** `Recharge`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_b2b`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Performs recharge for B2B users.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

operatorCode
YES
string
operatorCode used to identify operator of recharge number (Must be in Capital letters)
AIRTEL_B2B

circleCode
YES
string
circleCode used to identify circle of recharge number
50

rechargeNumber
YES
string
Recharge No on which recharge needs to be initiated
9829012345

amount
YES
string
recharge amount (must be numeric)
299

transactionId
YES
string
A unique identifier for the transaction at partner end (between 12 to 25 characters long)
TRANID123456789

Recharge (B2B): If the circleCode is unknown, please use 50 as the default value.

Request Body
{
  "operatorCode": "string",
  "circleCode": "string",
  "rechargeNumber": "string",
  "amount": "string",
  "transactionId": "string"
}

Sample Request Body
{
  "operatorCode": "AIRTEL_B2B",
  "circleCode": "50",
  "rechargeNumber": "9829012345",
  "amount": "299",
  "transactionId": "TRANID123456789"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Recharge successful",
  "responseData": [
    {
      "transactionId": "TRANID123456789",
      "apiTransactionId": "2202231910362280426",
      "operatorTransactionId": "BCXX123789",
      "amount": "299.00",
      "commission": "3.00",
      "tranStatus": "Success"
    }
  ]
}

⚠️ Notes

- Please do not consider on status & statusCode for determining the final transaction status. Always consider tranStatus as the outcome.

- If tranStatus is not available in the response, you should call the Recharge Status API to fetch the final status: /v1.0/recharge/recharge_status

- The tranStatus field indicates the outcome:

- Success → Recharge successful

- Failed → Recharge failed

- Pending → Recharge in process

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "operatorCode": "string",
  "circleCode": "string",
  "rechargeNumber": "string",
  "amount": "string",
  "transactionId": "string"
}
```

---

### POST — Recharge (B2C)

- **Folder:** `Recharge`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_b2c`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Performs recharge for B2C users.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

operatorCode
YES
string
operatorCode used to identify operator of recharge number (Must be in Capital letters)
AIRTEL_B2C

circleCode
YES
string
circleCode used to identify circle of recharge number
22

rechargeNumber
YES
string
Recharge No on which recharge needs to be initiated
9829012345

amount
YES
string
recharge amount (must be numeric)
299

transactionId
YES
string
A unique identifier for the transaction at partner end (between 12 to 25 characters long)
TRANID123456789

Request Body
{
  "operatorCode": "string",
  "circleCode": "string",
  "rechargeNumber": "string",
  "amount": "string",
  "transactionId": "string"
}

Sample Request Body
{
  "operatorCode": "AIRTEL_B2C",
  "circleCode": "22",
  "rechargeNumber": "9829012345",
  "amount": "299",
  "transactionId": "TRANID123456789"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Recharge successful",
  "responseData": [
    {
      "transactionId": "TRANID123456789",
      "apiTransactionId": "2202231910362280426",
      "operatorTransactionId": "BCXX123789",
      "amount": "299.00",
      "commission": "3.00",
      "tranStatus": "Success"
    }
  ]
}

⚠️ Notes

- Please do not consider on status & statusCode for determining the final transaction status. Always consider tranStatus as the outcome.

- If tranStatus is not available in the response, you should call the Recharge Status API to fetch the final status: /v1.0/recharge/recharge_status

- The tranStatus field indicates the outcome:

- Success → Recharge successful

- Failed → Recharge failed

- Pending → Recharge in process

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "operatorCode": "string",
  "circleCode": "string",
  "rechargeNumber": "string",
  "amount": "string",
  "transactionId": "string"
}
```

---

### POST — Recharge Status

- **Folder:** `Recharge`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/recharge_status`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Checks current or final recharge status using transactionId.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

statusBy
YES
string
statusBy must be either ATI or TI_TD
ATI / TI_TD

apiTransactionId
Conditional
string
Received in Recharge B2B/B2C Api (apiTransactionId is required when statusBy is ATI)
2202231910362280426

transactionId
Conditional
string
Which using at Recharge B2B/B2C Api (transactionId is required when statusBy is TI_TD)
TRANID123456789

transactionDate
Conditional
string
Transaction Date (YYYY-MM-DD) (transactionDate is required when statusBy is TI_TD)
2024-02-20

Request Body
{
  "statusBy": "string",
  "apiTransactionId": "string",
  "transactionId": "string",
  "transactionDate": "string"
}

Sample Request Body
{
  "statusBy": "TI_TD",
  "apiTransactionId": "",
  "transactionId": "TRANID123456789",
  "transactionDate": "2024-02-20"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Recharge successful",
  "responseData": [
    {
      "transactionId": "TRANID123456789",
      "apiTransactionId": "2202231910362280426",
      "operatorTransactionId": "BCXX123789",
      "amount": "299.00",
      "commission": "3.00",
      "tranStatus": "Success"
    }
  ]
}

⚠️ Notes

- Please do not consider on status & statusCode for determining the final transaction status. Always consider tranStatus as the outcome.

- If tranStatus is not available in the response, you should call the Recharge Status API to fetch the final status: /v1.0/recharge/recharge_status

- The tranStatus field indicates the outcome:

- Success → Recharge successful

- Failed → Recharge failed

- Pending → Recharge in process

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "statusBy": "string",
  "apiTransactionId": "string",
  "transactionId": "string",
  "transactionDate": "string"
}
```

---

### POST — Complaint Registration

- **Folder:** `Recharge`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/complaint`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Registers complaint against a recharge transaction.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

transactionId
YES
string
Which using at Recharge B2B/B2C Api
TRANID123456789

complaintCode
YES
string
Predefined complaint code provided by the Noble
11

complaintDesc
YES
string
Description of the complaint (maximum 255 characters)
"Amount was deducted from my wallet, but the recharge was not successful. Please resolve."

Request Body
{
  "transactionId": "string",
  "complaintCode": "string",
  "complaintDesc": "string"
}

Sample Request Body
{
  "transactionId": "TRANID123456789",
  "complaintCode": "11",
  "complaintDesc": "Amount was deducted from my wallet, but the recharge was not successful. Please resolve."
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Complaint registered successfully",
  "responseData": [
    {
      "complaintNumber": "CN123456789"
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
  "transactionId": "string",
  "complaintCode": "string",
  "complaintDesc": "string"
}
```

---

### POST — Complaint Status

- **Folder:** `Recharge`
- **URL:** `https://rcapi.noblewebstudio.in/v1.0/recharge/complaint_status`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

Tracks the status of a registered complaint.

Request
Request Body Parameters

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

complaintNumber
YES
string
Received by Complaint Api
CN123456789

Request Body
{
  "complaintNumber": "string"
}

Sample Request Body
{
  "complaintNumber": "CN123456789"
}

Response
{
  "status": 1,
  "statusCode": "RE0001",
  "message": "Success",
  "description": "Pending",
  "responseData": [
    {
      "complaintNumber": "CN123456789",
      "complaintDetails": "We are working on it",
      "complaintStatus": "Processing"
    }
  ]
}

Important Notes

- Please do not consider on status & statusCode for determining the final complaint status. Always consider complaintStatus as the outcome.

- The complaintStatus field indicates the current complaint status:

complaintStatus
Description

Processing
Complaint has been registered successfully and is being processed.

Open
The complaint is under investigation and the support team is working on it.

Closed
The complaint has been resolved and closed successfully.

- The final complaint status is generally available within 24 business hours (Monday to Friday).

- Please note that the resolution time may be longer in case of public holidays or weekends.

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "complaintNumber": "string"
}
```

---
