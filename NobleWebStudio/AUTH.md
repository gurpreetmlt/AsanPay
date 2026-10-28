# Noble Web Studio — AUTH

> Client authentication — exchange apiKey/apiValue for Bearer token.
>
> Source: Postman NOBLE APIs · see also [OVERVIEW.md](OVERVIEW.md) · [ENDPOINTS_INDEX.md](ENDPOINTS_INDEX.md)

## When to read this

Implementing or debugging **Noble AUTH** inside AsanPay.

## Suggested flow order

- 1. POST login with apiKey + apiValue (+ X-Timestamp).
- 2. Save Bearer token for all later calls.

## Endpoint catalog

| # | Method | Name | URL |
|---|--------|------|-----|
| 1 | `POST` | Authorization | `https://service.noblewebstudio.in/api/v1.0/client_auth/login` |

## Endpoint details

### POST — Authorization

- **Folder:** `Authentication`
- **URL:** `https://service.noblewebstudio.in/api/v1.0/client_auth/login`
- **Auth:** Auth type: noauth

**Vendor description**

This endpoint is used for client authentication by logging in with the provided API key and value. (Ensure that the API key and value are correct to avoid authentication errors.)

Request
Request Header

PARAMS
REQUIRED
DATA TYPE
DESCRIPTION
EXAMPLE

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

apiKey
YES
string
The API key used for authentication.
"string"

apiValue
YES
string
The corresponding value for the API key.
"string"

Request Body Example
{
  "apiKey": "string",
  "apiValue": "string"
}

Response
Successful authentication will yield a response containing relevant token or an error message if the authentication fails.

Response 1 : Failure
{
  "status": 0,
  "statusCode": "IC0007",
  "message": "Invalid Credentials",
  "description": "Authentication failed",
  "responseData": []
}

Response 2 : Success
 {
  "status": 1,
  "statusCode": "SS0011",
  "message": "Success",
  "description": "Success",
  "responseData": [
    {
      "token": "zyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJRCI6IjEwMDAwMyIsIkFwaUtleSI6IjJmYmMxMzMyLWFhOGQtNDM3OC05NGNlLWFhNjQwNWQ3ZjY0NSIsIklwQWRkcmVzcyI6IjEyNy4wLjAuMSwgOjoxLCAxMjIuMTgwLjMwLjI1MCIsIlRva2VuVmFsaWRpdHlJbk1pbnV0ZXMiOiI2MDAwIiwiUmF0ZUxpbWl0IjoiNSIsIlJhdGVMaW1pdFZhbGlkaXR5SW5NaW51dGVzIjoiMSIsIkVuZHBvaW50UGF0aCI6Ii9hcGkvdjEuMC9haXJ0ZWxfZG10L2dldF9jdXN0b21lciwgL2FwaS92MS4wL2FpcnRlbF9kbXQvdmFsaWRhdGVfYWFkaGFyLCAvYXBpL3YxLjAvYWlydGVsX2RtdC9zZW5kZXJfcmVnaXN0cmF0aW9uX290cCwgL2FwaS92MS4wL2FpcnRlbF9kbXQvc2VuZGVyX3JlZ2lzdHJhdGlvbl92YWxpZGF0ZV9vdHAsIC9hcGkvdjEuMC9haXJ0ZWxfZG10L3NlbmRlcl9yZWdpc3RyYXRpb25fZWt5YywgL2FwaS92MS4wL2FpcnRlbF9kbXQvdHJhbnNhY3Rpb25fb3RwLCAvYXBpL3YxLjAvYWlydGVsX2RtdC90cmFuc2FjdGlvbl92YWxpZGF0ZV9vdHAsIC9hcGkvdjEuMC9haXJ0ZWxfZG10L3RyYW5zYWN0aW9uX2ltcHNfc3RhdHVzLCAvYXBpL3YxLjAvYWlydGVsX2RtdC90cmFuc2FjdGlvbl9uZWZ0X3N0YXR1cywgL2FwaS92MS4wL2FpcnRlbF9kbXQvcGFydG5lcl9iYWxhbmNlLCAvYXBpL3YxLjAvYWlydGVsX2RtdC90ZXN0X2F1dGhlbnRpY2F0aW9uLCAvYXBpL3YxLjAvYWlydGVsX2RtdC9nZXRfdG9rZW4sIC9hcGkvdjEuMC9jbGllbnRfYXV0aC9sb2dpbiwgL2FwaS92MS4wL2xvZ2dpbmcvZ2V0X2xvZ3MiLCJleHAiOjE3NTEzODgzNTcsImlzcyI6Im5ld19kbXQiLCJhdWQiOiJuZXdfZG10X2NsaWVudHMifQ.rYW2uiiG3XUf5rsTowqD90WGv9BiceLZR4c29LA7caM"
    }
  ]
}

**Headers**

| Header | Example / value | Notes |
|--------|-----------------|-------|
| `X-Timestamp` | `2024-06-27T21:27:09` |  |
| `Content-Type` | `application/json` |  |

**Request body (sample from Postman)**

```json
{
  "apiKey": "string",
  "apiValue": "string"
}
```

---
