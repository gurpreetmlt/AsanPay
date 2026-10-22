# Noble Web Studio — CMS

> Airtel CMS start + status.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble CMS** inside AsanPay. Do not mix InstantPay request shapes with these URLs.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Start | `https://cms.noblewebstudio.in/api/v1.0/airtel_cms/start` |
| 2 | `POST` | Status Check | `https://cms.noblewebstudio.in/api/v1.0/airtel_cms/status_check` |

## Endpoint details

### POST — Start

- **Folder:** `CMS/AIRTEL CMS`
- **URL:** `https://cms.noblewebstudio.in/api/v1.0/airtel_cms/start`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint initiates a transaction process for the Airtel CMS service.

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
2024-10-20T21:27:09

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

merchantId
YES
string
must be numeric upto 10 digit).
9829098290

transactionId
YES
string
between 12 to 25 characters long
NBSCMS1234567

Request Body Example
{
  "merchantId": "string",
  "transactionId": "string"
}

Response
Upon successful authentication, the API returns a redirection URL within the responseData object. This URL should be used to redirect the user to the Airtel Bank Retailer CMS Plugin for further processing.

Response 1 : Success
{
  "status": 1,
  "statusCode": "AC0001",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "redirectionUrl": "https://api.airtelbank.com/RetailerPlugin?param=yy0149d7cb3ee4250c9169d76bd68ec6"
    }
  ]
}

Response 2 : Error
{
  "status": -1,
  "statusCode": "AC0003",
  "message": "Error",
  "description": "Error Message",
  "responseData": "[]"
}

Response 3 : Failure
{
  "status": 0,
  "statusCode": "AC0002",
  "message": "Failed",
  "description": "Failure Message",
  "responseData": "[]"
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-10-20T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "merchantId": "string",
  "transactionId": "string"
}
```

---

### POST — Status Check

- **Folder:** `CMS/AIRTEL CMS`
- **URL:** `https://cms.noblewebstudio.in/api/v1.0/airtel_cms/status_check`
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

transactionId
YES
string
between 12 to 25 characters long.
NCMS428F49XXX

Request Body Example
{
  "transactionId": "string"
}

Response
Successful authentication will yield a response containing relevant status of the transaction or an error message if the authentication fails.

Response :
{
  "status": 1,
  "statusCode": "AC0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "merchantId": "34654654",
      "amount": "100",
      "transactionId": "NCMS428F49XXX",
      "billerId": "174540XXX",
      "billerName": "Biller Name PRIVATE LIMITED_AGENT",
      "mobile": "9829098290",
      "tranDateTime": "07-10-2024 16:47:02",
      "utr": "PH51007169752XXXX",
      "commission": "0",
       "otherFields": "",
      "description": "",
      "tranStatus": "Failed"
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
  "transactionId": "string"
}
```

---
