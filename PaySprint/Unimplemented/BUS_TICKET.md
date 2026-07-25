# PaySprint — Bus Ticket Booking

> Raw PaySprint docs. **Cheat-sheet:** [`BUS_TICKET_DETAILS.md`](BUS_TICKET_DETAILS.md).

**Provider:** PaySprint (Bus Ticket Booking)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20
**Source PDF:** `PaySprint Doc 2.pdf` (pages ~165–283)

### Shared headers / auth

| Header | Type | Mandatory | Env | Description |
|--------|------|-----------|-----|-------------|
| `Token` | String | M | UAT+Live | JWT (HS256) |
| `Authorisedkey` | String | M on UAT* | UAT | Not required on Live |
| `Content-Type` | String | M | Both | `application/json` |


JWT `Token` + UAT `Authorisedkey`. See [`AUTHENTICATION.md`](AUTHENTICATION.md).

### Common response envelope

| Field | Type | Description |
|-------|------|-------------|
| `status` | Boolean/Number | Success flag |
| `response_code` | Number/String | Provider code |
| `message` | String | Status text |
| `data` | Object/Array | Payload |
| `ackno` / `refid` / `utr` | String | Txn ids |


### PDF / OpenAPI pollution

- Placeholder server `xyz.xyz.in` / sample hosts — use PaySprint Live/UAT
- Copy-paste operationIds; prefer tables + curl
- Mask secrets/PII (`xxxxx`)


---

## Product notes

**Bus Ticket Booking** — Generate URL (webview) **or** Raw APIs (RedBus-style collection).

Raw API chain: source cities → available trips → trip details → boarding point → block → book → check/get ticket → cancellation data → cancel.

Postman collection linked: `service-api/download/redbus_collection.json`.


## Service-wise status

| # | Service / API | Endpoint | Status |
|---|---------------|----------|--------|
| 1 | Generate Url | `POST /bus/generateurl` | 📄 Docs captured |
| 2 | Generate Url | `POST /bus/generateurl` | 📄 Docs captured |
| 3 | Get Source City | `POST /bus/ticket/source` | 📄 Docs captured |
| 4 | Get Available Trips | `POST /bus/ticket/availabletrips` | 📄 Docs captured |
| 5 | Get Current Trip Details | `POST /bus/ticket/tripdetails` | 📄 Docs captured |
| 6 | Get Boarding Point Detail | `POST /bus/ticket/boardingPoint` | 📄 Docs captured |
| 7 | Block Ticket | `POST /bus/ticket/blockticket` | 📄 Docs captured |
| 8 | Book Ticket | `POST /bus/ticket/bookticket` | 📄 Docs captured |
| 9 | Check Booked Ticket | `POST /bus/ticket/check_booked_ticket` | 📄 Docs captured |
| 10 | Get Booked Ticket | `POST /bus/ticket/get_ticket` | 📄 Docs captured |
| 11 | Get Cancelation Data | `POST /bus/ticket/get_cancellation_data` | 📄 Docs captured |
| 12 | Ticket Cancelation | `POST /bus/ticket/cancel_ticket` | 📄 Docs captured |

---

## 1. Generate Url

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/generateurl` |
| **OpenAPI path** | `/bus/generateurl` |
| **OpenAPI operationId** | `generate-url-2` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `redirect_url` | — | From docs | M/O | Confirm |
| `encdata` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/generateurl' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, redirect_url, encdata */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Generate Url`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 2. Generate Url

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/generateurl` |
| **OpenAPI path** | `/bus/generateurl` |
| **OpenAPI operationId** | `generate-url-2` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `redirect_url` | — | From docs | M/O | Confirm |
| `encdata` | — | From docs | M/O | Confirm |
| `cities` | — | From docs | M/O | Confirm |
| `id` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `locationType` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `state` | — | From docs | M/O | Confirm |
| `stateId` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/generateurl' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, redirect_url, encdata, cities, id, latitude, locationType, longitude */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Generate Url`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 3. Get Source City

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/source` |
| **OpenAPI path** | `/bus/ticket/source` |
| **OpenAPI operationId** | `get-source-city` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `cities` | — | From docs | M/O | Confirm |
| `id` | — | From docs | M/O | Confirm |
| `latitude` | — | From docs | M/O | Confirm |
| `locationType` | — | From docs | M/O | Confirm |
| `longitude` | — | From docs | M/O | Confirm |
| `state` | — | From docs | M/O | Confirm |
| `stateId` | — | From docs | M/O | Confirm |
| `source_id` | — | From docs | M/O | Confirm |
| `destination_id` | — | From docs | M/O | Confirm |
| `date_of_journey` | — | From docs | M/O | Confirm |
| `availableTrips` | — | From docs | M/O | Confirm |
| `AC` | — | From docs | M/O | Confirm |
| `additionalCommission` | — | From docs | M/O | Confirm |
| `agentServiceCharge` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/source' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* cities, id, latitude, locationType, longitude, state, stateId, source_id */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Source City`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 4. Get Available Trips

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/availabletrips` |
| **OpenAPI path** | `/bus/ticket/availabletrips` |
| **OpenAPI operationId** | `get-available-trips` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `source_id` | — | From docs | M/O | Confirm |
| `destination_id` | — | From docs | M/O | Confirm |
| `date_of_journey` | — | From docs | M/O | Confirm |
| `availableTrips` | — | From docs | M/O | Confirm |
| `AC` | — | From docs | M/O | Confirm |
| `additionalCommission` | — | From docs | M/O | Confirm |
| `agentServiceCharge` | — | From docs | M/O | Confirm |
| `agentServiceChargeAllowed` | — | From docs | M/O | Confirm |
| `arrivalTime` | — | From docs | M/O | Confirm |
| `availCatCard` | — | From docs | M/O | Confirm |
| `availSrCitizen` | — | From docs | M/O | Confirm |
| `availableSeats` | — | From docs | M/O | Confirm |
| `avlWindowSeats` | — | From docs | M/O | Confirm |
| `boCommission` | — | From docs | M/O | Confirm |
| `boardingTimes` | — | From docs | M/O | Confirm |
| `address` | — | From docs | M/O | Confirm |
| `bpId` | — | From docs | M/O | Confirm |
| `bpName` | — | From docs | M/O | Confirm |
| `contactNumber` | — | From docs | M/O | Confirm |
| `landmark` | — | From docs | M/O | Confirm |
| `location` | — | From docs | M/O | Confirm |
| `prime` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/availabletrips' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* source_id, destination_id, date_of_journey, availableTrips, AC, additionalCommission, agentServiceCharge, agentServiceChargeAllowed */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Available Trips`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 5. Get Current Trip Details

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/tripdetails` |
| **OpenAPI path** | `/bus/ticket/tripdetails` |
| **OpenAPI operationId** | `get-current-trip-details` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `trip_id` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/tripdetails' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* trip_id */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Current Trip Details`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 6. Get Boarding Point Detail

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/boardingPoint` |
| **OpenAPI path** | `/bus/ticket/boardingPoint` |
| **OpenAPI operationId** | `get-boarding-point-detail` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `mobile` | — | From docs | M/O | Confirm |
| `title` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `age` | — | From docs | M/O | Confirm |
| `gender` | — | From docs | M/O | Confirm |
| `idType` | — | From docs | M/O | Confirm |
| `idNumber` | — | From docs | M/O | Confirm |
| `primary` | — | From docs | M/O | Confirm |
| `seatName` | — | From docs | M/O | Confirm |
| `fare` | — | From docs | M/O | Confirm |
| `serviceTax` | — | From docs | M/O | Confirm |
| `operatorServiceCharge` | — | From docs | M/O | Confirm |
| `ladiesSeat` | — | From docs | M/O | Confirm |
| `bpId` | — | From docs | M/O | Confirm |
| `trip_id` | — | From docs | M/O | Confirm |
| `address` | — | From docs | M/O | Confirm |
| `contactnumber` | — | From docs | M/O | Confirm |
| `id` | — | From docs | M/O | Confirm |
| `landmark` | — | From docs | M/O | Confirm |
| `locationName` | — | From docs | M/O | Confirm |
| `rbMasterId` | — | From docs | M/O | Confirm |
| `availableTripId` | — | From docs | M/O | Confirm |
| `boardingPointId` | — | From docs | M/O | Confirm |
| `droppingPointId` | — | From docs | M/O | Confirm |
| `source` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/boardingPoint' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* mobile, title, email, age, gender, idType, idNumber, primary */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Boarding Point Detail`
- Required (may be polluted): `mobile, title, email, age, gender, idType, idNumber, primary, seatName, fare, serviceTax, operatorServiceCharge, ladiesSeat`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 7. Block Ticket

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/blockticket` |
| **OpenAPI path** | `/bus/ticket/blockticket` |
| **OpenAPI operationId** | `block-ticket` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `mobile` | — | From docs | M/O | Confirm |
| `title` | — | From docs | M/O | Confirm |
| `email` | — | From docs | M/O | Confirm |
| `age` | — | From docs | M/O | Confirm |
| `gender` | — | From docs | M/O | Confirm |
| `idType` | — | From docs | M/O | Confirm |
| `idNumber` | — | From docs | M/O | Confirm |
| `primary` | — | From docs | M/O | Confirm |
| `seatName` | — | From docs | M/O | Confirm |
| `fare` | — | From docs | M/O | Confirm |
| `serviceTax` | — | From docs | M/O | Confirm |
| `operatorServiceCharge` | — | From docs | M/O | Confirm |
| `ladiesSeat` | — | From docs | M/O | Confirm |
| `availableTripId` | — | From docs | M/O | Confirm |
| `boardingPointId` | — | From docs | M/O | Confirm |
| `droppingPointId` | — | From docs | M/O | Confirm |
| `source` | — | From docs | M/O | Confirm |
| `destination` | — | From docs | M/O | Confirm |
| `address` | — | From docs | M/O | Confirm |
| `bookingType` | — | From docs | M/O | Confirm |
| `paymentMode` | — | From docs | M/O | Confirm |
| `serviceCharge` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/blockticket' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* mobile, title, email, age, gender, idType, idNumber, primary */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Block Ticket`
- Required (may be polluted): `mobile, title, email, age, gender, idType, idNumber, primary, seatName, fare, serviceTax, operatorServiceCharge, ladiesSeat`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 8. Book Ticket

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/bookticket` |
| **OpenAPI path** | `/bus/ticket/bookticket` |
| **OpenAPI operationId** | `book-ticket` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `amount` | — | From docs | M/O | Confirm |
| `base_fare` | — | From docs | M/O | Confirm |
| `blockKey` | — | From docs | M/O | Confirm |
| `passenger_phone` | — | From docs | M/O | Confirm |
| `passenger_email` | — | From docs | M/O | Confirm |
| `bookingFee` | — | From docs | M/O | Confirm |
| `busType` | — | From docs | M/O | Confirm |
| `cancellationCalculationTimestamp` | — | From docs | M/O | Confirm |
| `cancellationMessage` | — | From docs | M/O | Confirm |
| `cancellationPolicy` | — | From docs | M/O | Confirm |
| `dateOfIssue` | — | From docs | M/O | Confirm |
| `destinationCity` | — | From docs | M/O | Confirm |
| `destinationCityId` | — | From docs | M/O | Confirm |
| `doj` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/bookticket' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, amount, base_fare, blockKey, passenger_phone, passenger_email, bookingFee, busType */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Book Ticket`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 9. Check Booked Ticket

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/check_booked_ticket` |
| **OpenAPI path** | `/bus/ticket/check_booked_ticket` |
| **OpenAPI operationId** | `check-booked-ticket` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `bookingFee` | — | From docs | M/O | Confirm |
| `busType` | — | From docs | M/O | Confirm |
| `cancellationCalculationTimestamp` | — | From docs | M/O | Confirm |
| `cancellationMessage` | — | From docs | M/O | Confirm |
| `cancellationPolicy` | — | From docs | M/O | Confirm |
| `dateOfIssue` | — | From docs | M/O | Confirm |
| `destinationCity` | — | From docs | M/O | Confirm |
| `destinationCityId` | — | From docs | M/O | Confirm |
| `doj` | — | From docs | M/O | Confirm |
| `dropLocation` | — | From docs | M/O | Confirm |
| `dropLocationAddress` | — | From docs | M/O | Confirm |
| `dropLocationId` | — | From docs | M/O | Confirm |
| `dropLocationLandmark` | — | From docs | M/O | Confirm |
| `dropTime` | — | From docs | M/O | Confirm |
| `firstBoardingPointTime` | — | From docs | M/O | Confirm |
| `hasRTCBreakup` | — | From docs | M/O | Confirm |
| `hasSpecialTemplate` | — | From docs | M/O | Confirm |
| `inventoryId` | — | From docs | M/O | Confirm |
| `inventoryItems` | — | From docs | M/O | Confirm |
| `fare` | — | From docs | M/O | Confirm |
| `ladiesSeat` | — | From docs | M/O | Confirm |
| `malesSeat` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/check_booked_ticket' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, bookingFee, busType, cancellationCalculationTimestamp, cancellationMessage, cancellationPolicy, dateOfIssue, destinationCity */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Check Booked Ticket`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 10. Get Booked Ticket

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/get_ticket` |
| **OpenAPI path** | `/bus/ticket/get_ticket` |
| **OpenAPI operationId** | `get-booked-ticket` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `bookingFee` | — | From docs | M/O | Confirm |
| `busType` | — | From docs | M/O | Confirm |
| `cancellationCalculationTimestamp` | — | From docs | M/O | Confirm |
| `cancellationMessage` | — | From docs | M/O | Confirm |
| `cancellationPolicy` | — | From docs | M/O | Confirm |
| `dateOfIssue` | — | From docs | M/O | Confirm |
| `destinationCity` | — | From docs | M/O | Confirm |
| `destinationCityId` | — | From docs | M/O | Confirm |
| `doj` | — | From docs | M/O | Confirm |
| `dropLocation` | — | From docs | M/O | Confirm |
| `dropLocationAddress` | — | From docs | M/O | Confirm |
| `dropLocationId` | — | From docs | M/O | Confirm |
| `dropLocationLandmark` | — | From docs | M/O | Confirm |
| `dropTime` | — | From docs | M/O | Confirm |
| `firstBoardingPointTime` | — | From docs | M/O | Confirm |
| `hasRTCBreakup` | — | From docs | M/O | Confirm |
| `hasSpecialTemplate` | — | From docs | M/O | Confirm |
| `inventoryId` | — | From docs | M/O | Confirm |
| `inventoryItems` | — | From docs | M/O | Confirm |
| `fare` | — | From docs | M/O | Confirm |
| `ladiesSeat` | — | From docs | M/O | Confirm |
| `malesSeat` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/get_ticket' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, bookingFee, busType, cancellationCalculationTimestamp, cancellationMessage, cancellationPolicy, dateOfIssue, destinationCity */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Booked Ticket`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 11. Get Cancelation Data

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/get_cancellation_data` |
| **OpenAPI path** | `/bus/ticket/get_cancellation_data` |
| **OpenAPI operationId** | `get-cancelation-data` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `cancellationCharges` | — | From docs | M/O | Confirm |
| `entry` | — | From docs | M/O | Confirm |
| `key` | — | From docs | M/O | Confirm |
| `value` | — | From docs | M/O | Confirm |
| `fares` | — | From docs | M/O | Confirm |
| `freeCancellationTime` | — | From docs | M/O | Confirm |
| `serviceCharge` | — | From docs | M/O | Confirm |
| `tatkalTime` | — | From docs | M/O | Confirm |
| `cancellationCharge` | — | From docs | M/O | Confirm |
| `refundAmount` | — | From docs | M/O | Confirm |
| `tin` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/get_cancellation_data' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, cancellationCharges, entry, key, value, fares, freeCancellationTime, serviceCharge */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Get Cancelation Data`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


## 12. Ticket Cancelation

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.paysprint.in/service-api/api/v1/service/bus/ticket/cancel_ticket` |
| **OpenAPI path** | `/bus/ticket/cancel_ticket` |
| **OpenAPI operationId** | `ticket-cancelation` |

### Headers

| Header | Type | Mandatory | Description |
|--------|------|-----------|-------------|
| `Token` | String | M/O | See auth |
| `Authorisedkey` | String | M/O | See auth |

### Request params

| Param | Type | Description | Mandatory | Notes |
|-------|------|-------------|-----------|-------|
| `refid` | — | From docs | M/O | Confirm |
| `cancellationCharge` | — | From docs | M/O | Confirm |
| `refundAmount` | — | From docs | M/O | Confirm |
| `tin` | — | From docs | M/O | Confirm |

### Sample request

```bash
curl --location --request POST 'https://api.paysprint.in/service-api/api/v1/service/bus/ticket/cancel_ticket' \
--header 'Token: {{jwt}}' \
--header 'Authorisedkey: {{authorisedkey}}' \
--header 'Content-Type: application/json' \
--data-raw '{ /* refid, cancellationCharge, refundAmount, tin */ }'
```

### Sample response

```json
{
  "status": true,
  "response_code": 1,
  "message": "Success"
}
```

### Notes

- Summary: `Ticket Cancelation`
- Required (may be polluted): `RAW_BODY`

### Gotchas

- Prefer live samples; mask PII; timeout → status API.

### Related

—


---

## Flows

### Webview path
1. `bus/generateurl` → open URL → callback

### Raw API path
1. source → availabletrips → tripdetails → boardingPoint
2. blockticket → bookticket
3. check_booked_ticket / get_ticket
4. get_cancellation_data → cancel_ticket
