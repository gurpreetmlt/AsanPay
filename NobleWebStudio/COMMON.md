# Noble Web Studio — COMMON

> Wallet / account balance check.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble COMMON** inside AsanPay. Do not mix InstantPay request shapes with these URLs.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `GET` | Balance Check | `https://service.noblewebstudio.in/api/v1.0/common/balance_check` |

## Endpoint details

### GET — Balance Check

- **Folder:** `Common`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/common/balance_check`
- **Auth:** Authorization: Bearer {{token}}

**Vendor description**

This endpoint allows partners to check their current balance.

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
This endpoint does not require any request parameters.

Response
Successful authentication will yield a response containing relevant balance information or an error message if the authentication fails.

Response 1 : Success
{
  "status": 1,
  "statusCode": "DB0001",
  "message": "Success",
  "description": "",
  "responseData": [
    {
      "accountBalance": 50000.00
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `Authorization` | `Bearer <Authtoken>` |  |
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

---
