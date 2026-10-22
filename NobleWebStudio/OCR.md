# Noble Web Studio — OCR

> Aadhaar and PAN OCR extraction.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble OCR** inside AsanPay. Do not mix InstantPay request shapes with these URLs.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | AADHAAR | `https://service.noblewebstudio.in/api/v1.0/ocr/aadhaar` |
| 2 | `POST` | PAN | `https://service.noblewebstudio.in/api/v1.0/ocr/pan` |

## Endpoint details

### POST — AADHAAR

- **Folder:** `OCR`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/ocr/aadhaar`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is used to perform Optical Character Recognition (OCR) on an Aadhaar card image. It processes the provided image URL and returns relevant information extracted from the Aadhaar card.

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

imageURL
YES
string
The URL of the Aadhaar card image. (png,jpg,jpeg allowed)
https://www.example.com/myaadhaar.jpg

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "imageURL": "string",
  "transactionId": "string"
}

Response
Response 1 : Success
{
  "status": 1,
  "statusCode": "OC0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "Demo Singh",
      "aadhaarNumber": "XXXX XXXX 1234",
      "dob": "19/12/2000",
      "gender": "MALE",
      "mobileNumber": "9829098290",
      "vid": "Demo Singh",
      "address": "SO Noble Singh, 123, Jaipur, Rajasthan 302001",
      "state": "Rajasthan",
      "pinCode": "302001",
      "relativeType": "SO",
      "relativeName": "Noble Singh",
      "enrollmentNo": "2180/72802/12345",
      "detail": "Success",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "OC0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "",
      "aadhaarNumber": "",
      "dob": "",
      "gender": "",
      "mobileNumber": "",
      "vid": "",
      "address": "",
      "state": "",
      "pinCode": "",
      "relativeType": "",
      "relativeName": "",
      "enrollmentNo": "",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "OC0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "OC0003",
  "message": "Error",


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
  "imageURL": "string",
  "transactionId": "string"
}
```

---

### POST — PAN

- **Folder:** `OCR`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/ocr/pan`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint is designed to process Optical Character Recognition (OCR) for PAN (Permanent Account Number) images.

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

imageURL
YES
string
The URL of the Aadhaar card image. (png,jpg,jpeg allowed)
https://www.example.com/myaadhaar.jpg

transactionId
YES
string
between 12 to 25 characters long (must be unique).
NBSCMS1234567

Request Body Example
{
  "imageURL": "string",
  "transactionId": "string"
}

Response
Response 1 : Success
{
  "status": 1,
  "statusCode": "OC0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "Demo Singh",
      "dob": "19/12/2000",
      "panNumber": "ABCDE1234F",
      "relativeType": "FATHER",
      "relativeName": "Noble Singh",
      "detail": "Success",
      "tranStatus": "Success"
    }
  ]
}

Response 2 : Failure
{
  "status": 1,
  "statusCode": "OC0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "transactionId": "NBSCMS1234567",
      "apiTransactionId": "202510131239167",
      "fullName": "",
      "dob": "",
      "panNumber": "",
      "relativeType": "",
      "relativeName": "",
      "detail": "",
      "tranStatus": "Failed"
    }
  ]
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "OC0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

Response 4 : Error
{
  "status": -1,
  "statusCode": "OC0003",
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
  "imageURL": "string",
  "transactionId": "string"
}
```

---
