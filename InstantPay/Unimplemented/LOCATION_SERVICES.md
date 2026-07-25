# InstantPay — Location Services

> Raw InstantPay Location Services docs (`InstantPay/Unimplemented/`). **Implement cheat-sheet:** [`LOCATION_SERVICES_DETAILS.md`](LOCATION_SERVICES_DETAILS.md). Jab implement ho → root `InstantPay/LOCATION_SERVICES.md` (AEPS-style) banega.

**Provider:** InstantPay (Location Services / GEO Intelligence)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (when APIs paste)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Y (all Location APIs so far) |

### Common response envelope

| Parameter | Type | Description |
|-----------|------|-------------|
| `statuscode` | String | InstantPay Status Code |
| `actcode` | String | Action Code |
| `status` | String/Array | Status message |
| `data` | Object/String | Response Data (if present) |
| `timestamp` | String | Response time (`YYYY-MM-DD HH:II:SS`) |
| `ipay_uuid` | String | Request reference number |
| `orderid` | String | Transaction Id (null if not a transaction) |
| `environment` | String | Live / Sandbox |
| `internalCode` | String | Usually null |

---

## Service-wise status

> Sidebar order under **LOCATION SERVICES** — fill as pages paste.

| # | Service | InstantPay endpoint / area | Status |
|---|---------|------------------------------|--------|
| 1 | GEO Intelligence — Overview | Product overview (IP Lookup · PIN Code Lookup · Reverse Geocoding) | 📄 Docs captured |
| 2 | IP Lookup | `POST /identity/ip/lookup` | 📄 Docs captured |
| 3 | PIN Code Lookup | `POST /identity/pincode/lookup` | 📄 Docs captured |
| 4 | Reverse Geocoding | `POST /identity/reverseGeocoding` | 📄 Docs captured |

---

## 1. GEO Intelligence — Overview

**Title (provider):** Overview

**Headline:** Unlock Location Insights with Instantpay’s GEO Intelligence API

Instantpay's **GEO Intelligence API** gives firms precise location data. It boosts efficiency and aids decision-making. This solution has **IP Lookup**, **PIN Code Lookup**, and **Reverse Geocoding**. It provides geographic insights for use in various applications.

### Capabilities (from overview)

| Capability | Detail |
|------------|--------|
| **IP Lookup** | Geographical details of an IP address (country, region, city). Helps with user profiling and geo-targeting; find customers' locations and improve service. |
| **PIN Code Lookup** | Location information linked to postal PIN codes. Ideal for accurate geographic data; optimise logistics, service areas, and customer outreach by postal region. |
| **Reverse Geocoding** | Convert geographic coordinates into readable addresses. Turns latitude/longitude into place names; supports mapping, navigation, and GPS apps. |

### Positioning

| Item | Detail |
|------|--------|
| **Product area** | Location Services → GEO Intelligence |
| **Purpose** | Better targeting, improved logistics, enhanced customer experiences via geo-intelligence |
| **Related APIs (sidebar)** | **IP Lookup** · **PIN Code Lookup** · **Reverse Geocoding** |

> Overview only — no endpoint / sample on this page. APIs: IP Lookup (#2), PIN Code Lookup (#3), Reverse Geocoding (#4).

### Gotchas

- Overview names three rails; confirm exact paths / method / fees on each API paste.
- Distinct from Identity / Financial Verification location fields (`latitude` / `longitude` on other InstantPay APIs) — this suite is dedicated GEO lookup.

### Related

- IP Lookup (#2)
- PIN Code Lookup (#3)
- Reverse Geocoding (#4)

---

## 2. IP Lookup

**Title (provider):** IP Lookup

Instantpay’s **IP Intelligence** — locate visitors, enrich forms, target mobile IPs, detect VPN, fraud prevention, log analysis, geo IP redirects.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/ip/lookup` |
| **OpenAPI operationId** | `geo-intelligence-ip-lookup` |
| **Summary** | IP Lookup |
| **OpenAPI title** | `ip-lookup` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity/ip` + path `/lookup` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Accept: application/json`, `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `ip` | String | Mandatory | IP address to look up |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Unique transaction id |

> OpenAPI wrongly describes `ip` as “ifsc code of the bank” — **ignore**; trust param table + curl sample.

### Sample request

> Provider HTTP sample leaked live-looking secrets — placeholders below.

```bash
curl --location 'https://api.instantpay.in/identity/ip/lookup' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
    "ip": "49.249.72.66",
    "latitude": "27.897394",
    "longitude": "78.088013",
    "externalRef": "233"
}'
```

```http
POST /identity/ip/lookup HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
    "ip": "49.249.72.66",
    "latitude": "27.897394",
    "longitude": "78.088013",
    "externalRef": "233"
}
```

### Sample success response

> Request sample IP (`49.249.72.66`) ≠ response sample IP (`160.19.164.0`) — illustrative SANDBOX payload.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Data Fetched Successful",
  "data": {
    "ipData": {
      "ip": "160.19.164.0",
      "type": "IPv4",
      "hostname": null,
      "carrier": { "name": null, "mcc": null, "mnc": null },
      "company": { "domain": null, "name": null, "type": "business" },
      "connection": {
        "asn": null,
        "domain": null,
        "organization": null,
        "route": null,
        "type": null
      },
      "currency": {
        "code": "USD",
        "name": "US Dollar",
        "nameNative": "US Dollar",
        "plural": "US dollars",
        "pluralNative": "US dollars",
        "symbol": "$",
        "symbolNative": "$",
        "format": {
          "negative": { "prefix": "-$", "suffix": "" },
          "positive": { "prefix": "$", "suffix": "" }
        }
      },
      "location": {
        "continent": { "code": "NA", "name": "North America" },
        "country": {
          "area": 9629091,
          "borders": ["CA", "MX"],
          "callingCode": "1",
          "capital": "Washington D.C.",
          "code": "US",
          "name": "United States",
          "population": 333287557,
          "populationDensity": 34.61,
          "flag": { "emoji": ":us:", "emojiUnicode": "U+1F1FA U+1F1F8" },
          "languages": [
            { "code": "en", "name": "English", "native": "English" },
            { "code": "es", "name": "Spanish", "native": "español" },
            { "code": "fr", "name": "French", "native": "français" }
          ],
          "tld": ".us"
        },
        "region": { "code": "US-MO", "name": "Missouri" },
        "city": "Schell City",
        "postal": "64780",
        "latitude": 38.03056,
        "longitude": -94.0897,
        "language": { "code": "en", "name": "English", "native": "English" },
        "inEu": false
      },
      "security": {
        "isAbuser": false,
        "isAttacker": true,
        "isBogon": true,
        "isCloudProvider": false,
        "isProxy": false,
        "isRelay": false,
        "isTor": false,
        "isTorExit": false,
        "isVpn": false,
        "isAnonymous": false,
        "isThreat": true
      },
      "timeZone": {
        "id": "America/Chicago",
        "abbreviation": "CST",
        "currentTime": "2023-08-21T04:25:09-05:00",
        "name": "Central Standard Time",
        "offset": -18000,
        "inDaylightSaving": true
      }
    },
    "poolReferenceId": "1230821175848KCEUF",
    "pool": {
      "openingBal": "997499.76",
      "amount": "0.12",
      "closingBal": "997499.64"
    }
  },
  "timestamp": "2023-08-21 17:58:48",
  "ipay_uuid": "h00099f166e5-5630-48f6-8ebb-f93b89e2f71c-cKMctQaskOEt",
  "orderid": "1230821175848KCEUF",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response notes (`data.ipData`)

| Area | Fields |
|------|--------|
| Identity | `ip`, `type` (e.g. IPv4), `hostname` |
| Carrier / company / connection | Often null in sample; `company.type` e.g. `business` |
| Currency | `code`, symbols, format prefixes |
| Location | continent, country (+ flag/languages), region, city, postal, lat/long, `inEu` |
| Security | `isVpn`, `isProxy`, `isTor`, `isThreat`, `isAttacker`, `isBogon`, … |
| Time zone | `id`, `abbreviation`, `offset`, `inDaylightSaving` |
| Pool | `poolReferenceId`, `pool.amount` sample **`0.12`**; `orderid` matches pool ref |

### Gotchas

- OpenAPI `ip` description copy-paste error (“ifsc code”).
- Body `latitude` / `longitude` = **end customer** coords (consent/geo for call), not the looked-up IP’s coords — those come back under `ipData.location`.
- Header `X-Ipay-Endpoint-Ip` ≠ body `ip` (lookup target).
- Sample request IP ≠ sample response IP.
- Fee from sample pool: **~0.12**.

### Related

- GEO Intelligence Overview (#1)
- PIN Code Lookup (#3)
- Reverse Geocoding (#4)

---

## 3. PIN Code Lookup

**Title (provider):** PIN Code Lookup

Instantpay’s **PIN Code Verification Service** — verify a postal PIN and get regional location data (logistics, service delivery, demographics, geo compliance).

| | |
|--|--|
| **Method** | `POST` (trust curl/HTTP samples) |
| **URL** | `https://api.instantpay.in/identity/pincode/lookup` |
| **OpenAPI operationId** | `geo-intelliegence-pin-code-lookup` (provider typo: “intelliegence”) |
| **Summary** | PIN Code Lookup |
| **OpenAPI title** | `pin-code-lookup` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity/pincode` + path `/lookup` |

> OpenAPI marks path as **`get`** but puts a JSON **`requestBody`** and all samples are **`POST`** — **implement as POST**.

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Accept: application/json`, `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `pincode` | String | Mandatory | Postal PIN code |
| `latitude` | String | Mandatory | End customer latitude |
| `longitude` | String | Mandatory | End customer longitude |
| `externalRef` | String | Mandatory | Unique transaction id |

### Sample request

> Provider sample wrongly sets `pincode` to an IP (`49.249.72.66`) — copy-paste from IP Lookup. Use a real PIN (response sample: `110025`). Secrets → placeholders.

```bash
curl --location 'https://api.instantpay.in/identity/pincode/lookup' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
    "pincode": "110025",
    "latitude": "27.897394",
    "longitude": "78.088013",
    "externalRef": "233"
}'
```

```http
POST /identity/pincode/lookup HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
    "pincode": "110025",
    "latitude": "27.897394",
    "longitude": "78.088013",
    "externalRef": "233"
}
```

### Sample success response

> LIVE sample. `city` can be empty string.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1230918180511SJUVR",
    "pool": {
      "account": "7428585742",
      "openingBal": "6.93",
      "mode": "DR",
      "amount": "0.12",
      "closingBal": "6.81"
    },
    "pincodeDetails": {
      "pincode": "110025",
      "city": "",
      "district": "SOUTH DELHI",
      "stateName": "DELHI",
      "stateCode": "DL",
      "gstStateCode": "07",
      "stateZone": "N",
      "geoLat": "28.5621470000",
      "geoLong": "77.4532100000"
    }
  },
  "timestamp": "2023-09-18 18:05:11",
  "ipay_uuid": "h0689a29bcc1-26e3-4989-8308-d5e3398ee686-ipPleKMgk49d",
  "orderid": "1230918180511SJUVR",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response notes (`data.pincodeDetails`)

| Field | Notes |
|-------|-------|
| `pincode` | Echo / resolved PIN |
| `city` | May be `""` |
| `district` / `stateName` / `stateCode` | e.g. SOUTH DELHI / DELHI / DL |
| `gstStateCode` | GST state code (e.g. `07`) |
| `stateZone` | e.g. `N` |
| `geoLat` / `geoLong` | Centroid / geo of PIN (strings) |
| Pool | `mode: DR`, sample fee **`0.12`**; includes `account` |

### Gotchas

- OpenAPI **GET** + body vs samples **POST** → use **POST**.
- Sample request `pincode` value is an IP — broken docs; send real 6-digit PIN.
- `operationId` typo: `intelliegence`.
- Body lat/long = end customer; PIN geo comes back as `geoLat` / `geoLong`.
- Fee sample **~0.12** (same ballpark as IP Lookup).

### Related

- GEO Intelligence Overview (#1)
- IP Lookup (#2)
- Reverse Geocoding (#4)

---

## 4. Reverse Geocoding

**Title (provider):** Reverse Geocoding

Instantpay’s **Reverse Geocoding Service** — convert latitude/longitude into readable addresses (navigation, mapping, logistics).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/reverseGeocoding` |
| **OpenAPI operationId** | `geo-intelligence-reverse-geo-coding` |
| **Summary** | Reverse Geocoding |
| **OpenAPI title** | `identity-georeverse` v1.0 |
| **OpenAPI server** | `https://api.instantpay.in/identity` + path `/reverseGeocoding` |

### Headers

| Header | Type | Mandatory | Provided by IPAY | Description |
|--------|------|-----------|------------------|-------------|
| `X-Ipay-Auth-Code` | String | M | Y | `"1"` (fixed) |
| `X-Ipay-Client-Id` | String | M | Y | Client ID |
| `X-Ipay-Client-Secret` | String | M | Y | Client secret |
| `X-Ipay-Endpoint-Ip` | String | M | Y | End-customer IP |

> Also send `Accept: application/json`, `Content-Type: application/json`.

### Request body

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `latitude` | String / Number | Mandatory | **Location** latitude to reverse (param table). Sample sends JSON **number**. |
| `longitude` | String / Number | Mandatory | **Location** longitude to reverse. Sample sends JSON **number**. |
| `externalRef` | String | Mandatory | Unique transaction id |

> Unlike IP/PIN Lookup, there is **no separate** lookup-target field — body lat/long **are** the coordinates being reverse-geocoded. OpenAPI still labels them “End Customer Latitude/Longitude” (copy-paste); trust param table (“Location Latitude/Longitude”).

### Sample request

> Secrets → placeholders. Sample uses numeric lat/long (not quoted strings).

```bash
curl --location 'https://api.instantpay.in/identity/reverseGeocoding' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
    "latitude": 28.5047896,
    "longitude": 77.297967,
    "externalRef": "8e8"
}'
```

```http
POST /identity/reverseGeocoding HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: {{clientId}}
X-Ipay-Client-Secret: {{clientSecret}}
X-Ipay-Endpoint-Ip: {{endPointIP}}

{
    "latitude": 28.5047896,
    "longitude": 77.297967,
    "externalRef": "8e8"
}
```

### Sample success response

> SANDBOX. Truncated `addressComponents` list kept in full below (Google-style place payload).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "poolReferenceId": "1230919170205EVNBT",
    "pool": {
      "account": "7428585742",
      "openingBal": "98386.66",
      "mode": "DR",
      "amount": "1.18",
      "closingBal": "98385.48"
    },
    "reverseGeocodingDetail": {
      "addressComponents": [
        { "longName": "G73X+X4M", "shortName": "G73X+X4M", "types": ["plus_code"] },
        { "longName": "Block B-1", "shortName": "Block B-1", "types": ["neighborhood", "political"] },
        { "longName": "Block E", "shortName": "Block E", "types": ["political", "sublocality", "sublocality_level_3"] },
        { "longName": "Mohan Cooperative Industrial Estate", "shortName": "Mohan Cooperative Industrial Estate", "types": ["political", "sublocality", "sublocality_level_2"] },
        { "longName": "Badarpur", "shortName": "Badarpur", "types": ["political", "sublocality", "sublocality_level_1"] },
        { "longName": "New Delhi", "shortName": "New Delhi", "types": ["locality", "political"] },
        { "longName": "South East Delhi", "shortName": "South East Delhi", "types": ["administrative_area_level_3", "political"] },
        { "longName": "Delhi Division", "shortName": "Delhi Division", "types": ["administrative_area_level_2", "political"] },
        { "longName": "Delhi", "shortName": "DL", "types": ["administrative_area_level_1", "political"] },
        { "longName": "India", "shortName": "IN", "types": ["country", "political"] },
        { "longName": "110044", "shortName": "110044", "types": ["postal_code"] }
      ],
      "formattedAddress": "G73X+X4M, Block B-1, Block E, Mohan Cooperative Industrial Estate, Badarpur, New Delhi, Delhi 110044, India",
      "geometry": {
        "location": { "lat": 28.5049603, "lng": 77.2978078 },
        "locationType": "GEOMETRIC_CENTER",
        "viewport": {
          "northeast": { "lat": 28.50630928029151, "lng": 77.29915678029151 },
          "southwest": { "lat": 28.5036113197085, "lng": 77.29645881970849 }
        }
      },
      "placeId": "ChIJZ3CxYVLnDDkRDsf2vBruc24",
      "types": ["establishment", "food", "point_of_interest"]
    }
  },
  "timestamp": "2023-09-19 17:02:05",
  "ipay_uuid": "h0009a2ba92b-13b3-4069-879a-d9ac7f7fdedc-4WDM6nWRP818",
  "orderid": "1230919170205EVNBT",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response notes (`data.reverseGeocodingDetail`)

| Field | Notes |
|-------|-------|
| `formattedAddress` | Primary display string |
| `addressComponents[]` | `longName`, `shortName`, `types[]` (plus_code, locality, country, postal_code, …) |
| `geometry.location` | Resolved `lat` / `lng` (may differ slightly from request) |
| `geometry.locationType` | e.g. `GEOMETRIC_CENTER` |
| `geometry.viewport` | NE / SW bounds |
| `placeId` | Provider place id |
| `types` | Place categories (e.g. establishment, food, POI) |
| Pool | `mode: DR`, sample fee **`1.18`** (higher than IP/PIN ~0.12) |

### Gotchas

- Body lat/long = **coordinates to reverse**, not a separate “consent” pair alongside another target field.
- OpenAPI schema type `string` but sample uses **numbers** — accept both or coerce to number.
- Fee sample **~1.18** vs IP/PIN **~0.12**.
- Singular key: `reverseGeocodingDetail` (not `…Details`).

### Related

- GEO Intelligence Overview (#1)
- IP Lookup (#2)
- PIN Code Lookup (#3)
