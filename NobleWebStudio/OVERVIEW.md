# Noble Web Studio — Overview (AI + implementers)

## Vendor

- **Product name in docs:** NOBLE APIs / Noble Web Studio
- **Panel:** Register + create API user under Settings → API → Add New API User
- **Architecture:** REST + JSON request/response
- **Official doc:** https://documenter.getpostman.com/view/45133648/2sB3QJPqzn

## Base hosts

| Alias | Base URL | Used for |
|-------|----------|----------|
| service | `https://service.noblewebstudio.in` | Auth, Common, OCR, Verification |
| aeapi | `https://aeapi.noblewebstudio.in` | AEPS family |
| dmt | `https://dmt.noblewebstudio.in` | DMT + Bene |
| rcapi | `https://rcapi.noblewebstudio.in` | Recharge |
| cms | `https://cms.noblewebstudio.in` | Airtel CMS |

## Authentication flow

1. Create API user in Noble panel (unique email; modules selected).
2. Receive API credentials (panel / email — treat as secrets).
3. Call **Authorization** (`POST /api/v1.0/client_auth/login`) with `apiKey` + `apiValue`.
4. Receive Bearer token.
5. Send `Authorization: Bearer <token>` on subsequent APIs (as shown per-endpoint).

### Common headers (many endpoints)

| Header | Required | Notes |
|--------|----------|-------|
| `Content-Type` | Yes | `application/json` |
| `X-Timestamp` | Often Yes | Format `yyyy-MM-dd'T'HH:mm:ss` — skew ~15s |
| `Authorization` | After login | `Bearer <token>` |

Exact header sets differ by endpoint — always check the service doc section.

## Hard rules (from vendor guidelines)

- Parameters are **case sensitive**.
- Valid credentials hit **real account data** (sandbox vs live depends on Noble account — confirm with vendor).
- Prefer documented HTTP methods only (mostly POST; balance check is GET).
- Do not invent undocumented fields.

## Vendor intro (cleaned)

Welcome to NOBLE API's API Documentation. We've designed this document to help developers and NOBLE users fully understand and integrate our API for a seamless and easy deployment. These APIs enable you to utilize most of your NOBLE account's panel features fully.

We've listed all the APIs, their required parameters, and their example requests and responses on the right for easy understanding.

Our APIs are based around REST architecture and use the basic HTTP request methods. Our APIs accept JSON - encoded body requests and return data in the same form.

Read through the following sections for the integration process.

Getting Started
First, you need to register with us and create an account. Click on this link to complete the sign-up process.

After the sign-up process is complete, follow the steps listed below to create an API user:

- Log in to your NOBLE account.

- From the left-hand menu, go to: Settings → API → Add New API User

- Click on "Create API User."

- In the pop-up form: Enter a unique email address (must be different from the one used for your main login). Under Modules to Access, select the relevant API modules you want your user to access. Under Buyer's Details Access, choose either "Allowed" or "Not Allowed" based on your requirement.

- Click on "Create User."

- The password for the API user will be sent to your registered email address (not the API user email ID).

Once created, you can proceed to generate an auth token using the Authentication API for further integration.

Document and API Usage Guidelines

- Our APIs use the basic HTTP request codes: POST, GET, PATCH, & PUT.

- You can select the required response and request code language according to you.

- Any requests made using the valid API credentials will affect the real-time data in your account.

- Make sure to provide valid values for all parameters to ensure a successful request.

- All parameters are case sensitive and must be passed in same way as mentioned in the document.

- Authorization: Bearer

- All the APIs are provided with their appropriate example requests and responses for successful and failed calls. The example definitions are:

- Successful Call: The API call was correct.

- Invalid Data: The data entered was incorrect.

- Missing Fields: Some of the required fields are missing.

- Wrong Format: There is a syntax error in the code.

- Note: The transactionId defined by you at the time of transaction. All our APIs will use this transactionId to access your created transaction unless stated otherwise.

Required Header Parameters (For All API Requests)
All API requests must include the following 3 header parameters:

Header Name
Value Format
Description

Authorization
Bearer {Token}
Received from Authorization (POST) API

X-Timestamp
yyyy-MM-ddTHH:mm:ss
Ex: 2024-06-17T21:27:09
Current Indian Standard Time (IST)

Content-Type
application/json
Request body content type

Exception: These headers are not required for the following endpoint:
POST /api/v1.0/client_auth/login

Errors and Response codes
1. Most Common API Error Codes (HTTP Status Code)
While using Airtel DMT's APIs, you may run into some standard response and error codes. The most common ones are listed along with their descriptions as follows:

RESPONSE CODE
DESCRIPTION

200 & 202 - OK & Accepted
Everything worked as expected, and you'll get a response. Some APIs may respond with an error message if data is invalid.

400 - Bad Request
The request was invalid or cannot be otherwise served.

401 - Unauthorized
There is some error during validation. You need to check your token or credentials.

404 - Not Found
The URI requested is invalid or the resource requested does not exist.

405 - Method Not Allowed
The API was accessed using the wrong method. Check your HTTP method.

422 - Unprocessable Entity
It means the request contains incorrect syntax or cannot be fulfilled. Try checking your code for errors.

429 - Too Many Requests
You have exceeded the API call rate limit.

500, 502, 503, 504 - Server Errors
Some server error has occurred. Some APIs may show this due to syntax or parameter errors. Try contacting support if this persists.

2. Most Common API Error Codes (Status Code with Details)

Status
StatusCode
Message
Description

0
IR0001
Invalid Request
Malformed or invalid request body. Check syntax and required fields.

0
PM0002
Parameter Missing
{Value} parameter is missing

0
VF0003
Validation Failed
{Value} is required

0
IE0004
Invalid Api Endpoin

## Env vars to plan for AsanPay (suggested names — not live yet)

```
NOBLE_API_KEY=
NOBLE_API_VALUE=
NOBLE_BASE_SERVICE=https://service.noblewebstudio.in
NOBLE_BASE_AEPS=https://aeapi.noblewebstudio.in
NOBLE_BASE_DMT=https://dmt.noblewebstudio.in
NOBLE_BASE_RECHARGE=https://rcapi.noblewebstudio.in
NOBLE_BASE_CMS=https://cms.noblewebstudio.in
```

Store only in Coolify / local `.env` — never in git.
