# InstantPay — Asset Verification

> Raw InstantPay Identity / Asset Verification API reference (`InstantPay/Unimplemented/`). Overview: [`OVERVIEW.md`](OVERVIEW.md). **Implement cheat-sheet:** [`ASSET_VERIFICATION_DETAILS.md`](ASSET_VERIFICATION_DETAILS.md). Jab implement ho → root `InstantPay/ASSET_VERIFICATION.md` (AEPS-style) banega.

**Provider:** InstantPay (Identity — Asset Verification)
**Status:** 📄 Docs only — not implemented in AsanPay yet
**Last updated:** 2026-07-20

### Shared headers (sab Asset Verification APIs)

| Name | Type | Description | Mandatory | Provided by InstantPay |
|------|------|-------------|-----------|------------------------|
| `X-Ipay-Auth-Code` | String | Auth Code is `"1"` (Fixed) | M | Y |
| `X-Ipay-Client-Id` | String | Unique Client Id | M | Y |
| `X-Ipay-Client-Secret` | String | Unique Client Secret | M | Y |
| `X-Ipay-Endpoint-Ip` | String | End customer IP Address | M | Y |

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

| # | Service | InstantPay endpoint | Status |
|---|---------|---------------------|--------|
| 1 | UAN Verification Plus | `POST /identity/verifyUan` | 📄 Docs captured |
| 2 | Driving License Verification | `POST /identity/verifyDrivingLicense` | 📄 Docs captured |
| 3 | RC Verification (Plus) | `POST /identity/verifyRcPlus` | 📄 Docs captured |
| 4 | Passport Verification | `POST /identity/verifyPassport` | 📄 Docs captured |
| 5 | Voter ID Verification | `POST /identity/verifyVoterId` | 📄 Docs captured |
| 6 | Offline KYC — Send OTP | `POST /identity/okyc/sendOtp` | 📄 Docs captured |
| 7 | Offline KYC — Verify OTP | `POST /identity/okyc/verify` | 📄 Docs captured |
| 8 | Aadhaar Demographic | `POST /identity/verifyAadhaar` | 📄 Docs captured |

---

## 1. UAN Verification Plus

EPFO UAN verification — personal + employment details (recent/previous employers), pool debit info.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyUan` |
| **OpenAPI operationId** | `epfo-uan-verification` |
| **Summary** | EPFO UAN Verification |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `uanNumber` | String | Mandatory | Customer EPFO UAN Number |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Your Unique Transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (e.g. `"Y"`) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyUan' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "uanNumber": "xxxxxxxxxxxx",
  "consent": "Y",
  "externalRef": "1737352942",
  "latitude": 0.99,
  "longitude": 38
}'
```

```http
POST /identity/verifyUan HTTP/2.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx
Content-Type: application/json

{
  "uanNumber": "xxxxxxxxxxxx",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "uanDetails": {
      "personal_details": {
        "userGender": "FEMALE",
        "userDob": "03-01-19XX",
        "userFullName": "ANURXXXX",
        "userPhoneNumber": null
      },
      "employment_details": {
        "isEmployed": true,
        "dateOfExitMarked": false,
        "uanList": ["1013090XXXX"],
        "uanCount": 1,
        "recentEmployerData": {
          "memberId": "DSNHP13800300001XXXXX",
          "establishmentId": "DSNHP1380XXXXXX",
          "dateOfExit": null,
          "dateOfJoining": "08-10-2024",
          "establishmentName": "xxxxx INDIA LIMITED",
          "uanNumber": "1013090XXXXX"
        },
        "previousEmployerData": [
          {
            "sequenceNumber": "1",
            "uanNumber": "1013090XXXX",
            "dateOfExit": null,
            "dateOfJoining": "08-10-2XXX",
            "establishmentId": "DSNHP1380XXXXX",
            "establishmentName": "INSTANTPAY  INDIA LIMITED",
            "memberId": "DSNHP13800300001XXXXXX",
            "leaveReason": null,
            "mobile": null,
            "aadhaarVerificationStatus": ""
          }
        ]
      }
    },
    "poolReferenceId": "1250121105046RHRHR",
    "pool": {
      "openingBal": "5.41",
      "mode": "DR",
      "amount": "0.00",
      "closingBal": "5.41"
    }
  },
  "timestamp": "2025-01-21 10:50:46",
  "ipay_uuid": "h0009e04da96-6c83-427b-abba-2ac8ba5c1f3d-vCkbEcbI3JrE",
  "orderid": "1250121105046RHRHR",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

**`data.uanDetails.personal_details`**

| Field | Type | Notes |
|-------|------|-------|
| `userGender` | String | e.g. `FEMALE` |
| `userDob` | String | Masked DOB |
| `userFullName` | String | Masked name |
| `userPhoneNumber` | String \| null | |

**`data.uanDetails.employment_details`**

| Field | Type | Notes |
|-------|------|-------|
| `isEmployed` | Boolean | |
| `dateOfExitMarked` | Boolean | |
| `uanList` | String[] | |
| `uanCount` | Integer | |
| `recentEmployerData` | Object | `memberId`, `establishmentId`, `dateOfExit`, `dateOfJoining`, `establishmentName`, `uanNumber` |
| `previousEmployerData` | Object[] | + `sequenceNumber`, `leaveReason`, `mobile`, `aadhaarVerificationStatus` |

**`data.pool` / billing**

| Field | Type | Notes |
|-------|------|-------|
| `poolReferenceId` | String | Also mirrors `orderid` in sample |
| `pool.openingBal` | String | |
| `pool.mode` | String | e.g. `DR` |
| `pool.amount` | String | |
| `pool.closingBal` | String | |

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyUan`
- `400` response documented as empty object `{}`

---

## 2. Driving License Verification

Authenticate driving licence validity; extract personal info, permissible vehicle types (COV), and RTO-registered user photo.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyDrivingLicense` |
| **OpenAPI operationId** | `identity-verification-driving-license-verification` |
| **Summary** | Driving License Verification |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `drivingLicenseNumber` | String | Mandatory | Driving License Number |
| `dob` | String | Mandatory | DOB linked with DL (`YYYY-MM-DD`) |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Your Unique Transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (e.g. `"Y"`) |

> Note: OpenAPI schema omits `dob` (docs/sample include it) — treat `dob` as mandatory per request params + sample.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyDrivingLicense' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "drivingLicenseNumber": "MH09123456xxx",
  "dob": "2000-12-01",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/verifyDrivingLicense HTTP/2.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx
Content-Type: application/json

{
  "drivingLicenseNumber": "xxxxxxxxxxxx",
  "dob": "xxxx-xx-xx",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "drivingLicenseDetail": {
      "userAddress": [
        {
          "addressLine1": "Sample Address",
          "completeAddress": "Full Address",
          "country": "INDIA",
          "district": "TAL-PANHALA,",
          "pin": "",
          "state": "Maharashtra",
          "type": "Permanent"
        },
        {
          "addressLine1": "Sample Address,",
          "completeAddress": "Full Address",
          "country": "INDIA",
          "district": "TAL-PANHALA,",
          "pin": "",
          "state": "Maharashtra",
          "type": "Present"
        }
      ],
      "userBloodGroup": "U",
      "dlNumber": "MH09 123456789",
      "userDob": "07/05/2000",
      "endorseDate": "",
      "endorseNumber": "",
      "expiryDate": "28/02/2020",
      "fatherOrHusband": "Sample Name",
      "issuedDate": "29/02/2000",
      "nonTransportValidity": { "from": "29/02/2000", "to": "28/02/2020" },
      "state": "Maharashtra",
      "status": "Active",
      "statusDetails": { "from": "", "remarks": "", "to": "" },
      "transportValidity": { "from": "", "to": "" },
      "userFullName": "Sample Name",
      "userImage": "/9j/4AAQhAMVm9O1yXvI4ZgJVLbDIDyD/MVoweDyD2Q==",
      "vehicleCategoryDetails": [
        { "cov": "MCWG", "expiryDate": "", "issueDate": "" },
        { "cov": "LMV", "expiryDate": "", "issueDate": "" }
      ]
    },
    "pool": {
      "referenceId": "1231005102115NHXPE",
      "openingBalance": "47.77",
      "paymentAmount": "0.00",
      "mode": "DR",
      "closingBalance": "47.77"
    }
  },
  "timestamp": "2023-10-05 10:21:15",
  "ipay_uuid": "h0059a4b4991-b430-4411-80fe-f5c24af38c84-jPAvyqyJmw4H",
  "orderid": "1231005102115NHXPE",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

**`data.drivingLicenseDetail`**

| Field | Type | Notes |
|-------|------|-------|
| `userAddress` | Object[] | `addressLine1`, `completeAddress`, `country`, `district`, `pin`, `state`, `type` (`Permanent` / `Present`) |
| `userBloodGroup` | String | |
| `dlNumber` | String | |
| `userDob` | String | Response format often `DD/MM/YYYY` |
| `endorseDate` / `endorseNumber` | String | |
| `expiryDate` | String | |
| `fatherOrHusband` | String | |
| `issuedDate` | String | |
| `nonTransportValidity` | Object | `from`, `to` |
| `transportValidity` | Object | `from`, `to` |
| `state` | String | |
| `status` | String | e.g. `Active` |
| `statusDetails` | Object | `from`, `remarks`, `to` |
| `userFullName` | String | |
| `userImage` | String | Base64 (RTO photo) |
| `vehicleCategoryDetails` | Object[] | `cov` (e.g. `MCWG`, `LMV`), `expiryDate`, `issueDate` |

**`data.pool` / billing**

| Field | Type | Notes |
|-------|------|-------|
| `referenceId` | String | Mirrors `orderid` in sample |
| `openingBalance` | String | |
| `paymentAmount` | String | |
| `mode` | String | e.g. `DR` |
| `closingBalance` | String | |

> Pool field names differ from UAN Plus (`openingBalance` / `paymentAmount` / `closingBalance` vs `openingBal` / `amount` / `closingBal`).

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyDrivingLicense`
- `400` response documented as empty object `{}`

---

## 3. RC Verification (Plus)

Authenticate vehicle Registration Certificate details and enrich with insurance, fitness, permit, PUCC, finance, and owner data. InstantPay titles this **RC Verification Plus**.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyRcPlus` |
| **OpenAPI operationId** | `identity-verification-rc-verification-plus` |
| **Summary** | RC Verification Plus |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `vehicleRegistrationNumber` | String | Mandatory | Vehicle Registration Number |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Your Unique Transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (e.g. `"Y"`) |

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyRcPlus' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "vehicleRegistrationNumber": "UP85BX1xxx",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/verifyRcPlus HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx
Content-Type: application/json

{
  "vehicleRegistrationNumber": "UP81AB1234",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

### Sample success response

> Provider sample JSON appears truncated/malformed (envelope fields nested under `data`, missing closing braces). Shape below follows the pasted payload; treat top-level envelope as standard InstantPay response when implementing.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "vehicalData": {
      "rcBlacklistStatus": "NA",
      "bodyTypeDescription": "2WHEELER",
      "rcChassisNumber": "MD626B******C40204",
      "fatherName": "Sample Name",
      "financer": "NA",
      "insurance": {
        "company": "Acko General Insurance Limited",
        "expiryDate": "26/05/2024",
        "policyNumber": "DBCR00******044/00"
      },
      "nationalPermitExpiryDate": "NA",
      "nationalPermitIssuedBy": "NA",
      "nationalPermitNumber": "NA",
      "normsDescription": "BHARAT STAGE III",
      "vehicleOwnerNumber": "2",
      "userPermanentAddress": "Address",
      "rcEngineNumber": "BG4*****675",
      "rcExpiryDate": "03/06/2031",
      "rcFitUpto": "03/06/2031",
      "rcNocDetails": "NA",
      "rcPermitExpiryDate": "NA",
      "rcPermitIssuedDate": "NA",
      "rcPermitNumber": "NA",
      "rcPermitStartDate": "NA",
      "rcPermitType": "NA",
      "rcPuccExpiryDate": "17/03/2024",
      "rcPuccNo": "UP01*****100",
      "rcRegistrationDate": "26/05/2016",
      "rcRegistrationLocation": "SOUTH DELHI, Delhi",
      "rcRegistrationNumber": "DL3SDE8521",
      "rcStateCode": "DL",
      "rcStatus": "ACTIVE",
      "rcStatusAsOn": "05/10/2023",
      "rcTaxUpto": "LTT",
      "rcSource": "P",
      "userName": "Sample name",
      "userPresentAddress": " Address",
      "vehicleCategory": "2WN",
      "vehicleClassDescription": "M-Cycle/Scooter(2WN)",
      "vehicleColor": "TITANIUM GREY",
      "vehicleCubicCapacity": "109.7",
      "vehicleFuelDescription": "PETROL",
      "vehicleGrossWeight": "238",
      "vehicleMakeModel": "TVS JUPITER",
      "vehicleMakerDescription": "TVS MOTOR COMPANY LTD",
      "vehicleManufacturedDate": "03/2016",
      "vehicleNumberOfCylinders": "1",
      "vehicleSeatingCapacity": "2",
      "vehicleSleeperCapacity": "NA",
      "vehicleStandCapacity": "NA",
      "vehicleUnladenWeight": "108",
      "vehicleWheelbase": "1275",
      "vehicleType": "2W",
      "rcCommercialStatus": "NO",
      "rcRtoCode": "DL-3",
      "vehicleFinanced": "NA",
      "monthYearRemainingForInsuranceExp": "NA",
      "insuranceExpired": "N",
      "vehicleFitnessExpired": "N",
      "vehicleAge": "7 years 4 months",
      "city": "South Delhi",
      "state": "DELHI",
      "invoiceInfo": {
        "purchaseDate": "NA",
        "purchaseAmount": "NA",
        "dealerName": "NA",
        "dealerAddress": "NA"
      }
    }
  },
  "timestamp": "2022-02-16 15:56:47",
  "ipay_uuid": "h006959ccf00-ce00-43e6-9583-ebc118a77f82",
  "orderid": "1220**********JSKY",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

> Key is spelled **`vehicalData`** (provider typo) — keep as-is when parsing.

**`data.vehicalData` — registration / status**

| Field | Notes |
|-------|-------|
| `rcRegistrationNumber`, `rcStateCode`, `rcRtoCode`, `rcRegistrationDate`, `rcRegistrationLocation` | RC identity |
| `rcStatus`, `rcStatusAsOn`, `rcSource`, `rcBlacklistStatus`, `rcCommercialStatus` | Status |
| `rcExpiryDate`, `rcFitUpto`, `rcTaxUpto`, `rcNocDetails` | Validity / tax |
| `rcChassisNumber`, `rcEngineNumber` | Often masked |

**Owner / address**

| Field | Notes |
|-------|-------|
| `userName`, `fatherName`, `vehicleOwnerNumber` | |
| `userPermanentAddress`, `userPresentAddress`, `city`, `state` | |

**Vehicle specs**

| Field | Notes |
|-------|-------|
| `vehicleType`, `vehicleCategory`, `vehicleClassDescription`, `bodyTypeDescription` | e.g. `2W`, `2WN` |
| `vehicleMakeModel`, `vehicleMakerDescription`, `vehicleColor`, `vehicleFuelDescription` | |
| `vehicleCubicCapacity`, `vehicleGrossWeight`, `vehicleUnladenWeight`, `vehicleWheelbase` | |
| `vehicleNumberOfCylinders`, `vehicleSeatingCapacity`, `vehicleSleeperCapacity`, `vehicleStandCapacity` | |
| `vehicleManufacturedDate`, `vehicleAge`, `normsDescription` | |

**Insurance / finance / permits / PUCC**

| Field | Notes |
|-------|-------|
| `insurance.company`, `insurance.expiryDate`, `insurance.policyNumber` | |
| `insuranceExpired`, `monthYearRemainingForInsuranceExp` | |
| `financer`, `vehicleFinanced` | |
| `rcPuccNo`, `rcPuccExpiryDate` | |
| `rcPermit*`, `nationalPermit*` | Often `"NA"` for non-commercial |
| `vehicleFitnessExpired` | `Y` / `N` |
| `invoiceInfo` | `purchaseDate`, `purchaseAmount`, `dealerName`, `dealerAddress` |

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyRcPlus`
- `400` response documented as empty object `{}`
- OpenAPI property description for `vehicleRegistrationNumber` incorrectly says `udyamNumber` (copy-paste error in provider docs)

---

## 4. Passport Verification

Fetch passport details using application/file number + DOB; verify passport status and related info in real time from the issuing authority.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyPassport` |
| **OpenAPI operationId** | `post_mobileaddressLookup-1` (provider copy-paste; ignore name) |
| **Summary** | Passport Verification |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `passportFileNumber` | String | Mandatory | Passport / application file number (docs table says “Passport Number”; page intro says Application Number) |
| `dob` | String | Mandatory | Passport holder DOB (sample request: `YYYY-MM-DD`) |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Your Unique Transaction id |

> No `consent` field in this API’s request params (unlike UAN / DL / RC).

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyPassport' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "passportFileNumber": "GZ606xxx4976225",
  "dob": "1999-02-22",
  "latitude": "28.5245",
  "longitude": "77.2688",
  "externalRef": "1764061199"
}'
```

```http
POST /identity/verifyPassport HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx
Content-Type: application/json

{
  "passportFileNumber": "GZ6066204976225",
  "dob": "1999-02-22",
  "latitude": "28.5245",
  "longitude": "77.2688",
  "externalRef": "1764061199"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "passportData": {
      "passportFileNumber": "GZ606xxx4976225",
      "dob": "22/02/1999",
      "passportNumber": null,
      "name": "John",
      "surname": "Doe",
      "applicationType": "Normal",
      "applicationDate": "17/11/2025",
      "dateOfDispatch": null
    },
    "poolReferenceId": "1251127173134EZFJY",
    "pool": {
      "openingBal": "11.13",
      "mode": "DR",
      "amount": "2.36",
      "closingBal": "8.77"
    }
  },
  "timestamp": "2025-11-27 17:31:34",
  "ipay_uuid": "h000a0750700-f103-4e99-b590-b6af7be51727-TztOuvmr0eDo",
  "orderid": "1251127173134EZFJY",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

**`data.passportData`**

| Field | Type | Notes |
|-------|------|-------|
| `passportFileNumber` | String | May be masked |
| `dob` | String | Response often `DD/MM/YYYY` (request uses `YYYY-MM-DD`) |
| `passportNumber` | String \| null | |
| `name` | String | |
| `surname` | String | |
| `applicationType` | String | e.g. `Normal` |
| `applicationDate` | String | |
| `dateOfDispatch` | String \| null | |

**`data.pool` / billing** (UAN-style field names)

| Field | Type | Notes |
|-------|------|-------|
| `poolReferenceId` | String | Mirrors `orderid` |
| `pool.openingBal` | String | |
| `pool.mode` | String | e.g. `DR` |
| `pool.amount` | String | |
| `pool.closingBal` | String | |

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyPassport`
- Provider OpenAPI summary/description wrongly copy-pasted from **Voter ID Verification** — ignore; use page intro above
- `400` response documented as empty object `{}`

---

## 5. Voter ID Verification

Verify Voter ID details using **EPIC Number** against Election Commission data.

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyVoterId` |
| **OpenAPI operationId** | `identity-verification-voterid-verification` |
| **Summary** | Voter ID Verification |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `voterId` | String | Mandatory | Voter Id EPIC Number |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Your Unique Transaction id |
| `consent` | String | Mandatory | Consent accepted by customer (e.g. `"Y"`) |

### Consent text (provider)

> I hereby give my consent and submit voluntarily at my own discretion, my Voter ID for the purpose of establishing my identity on the portal. The Voter ID submitted herewith shall not be used for any purpose other than mentioned, or as per the requirements of the law.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyVoterId' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--header 'Content-Type: application/json' \
--data '{
  "voterId": "XXXXXXX78",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}'
```

```http
POST /identity/verifyVoterId HTTP/1.1
Host: api.instantpay.in
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx
Content-Type: application/json

{
  "voterId": "XXXXXXX78",
  "consent": "Y",
  "latitude": 0.99,
  "longitude": 38,
  "externalRef": "jdnjdi89"
}
```

### Sample success response

> Provider sample masks some numbers with `*` which breaks JSON — cleaned placeholders below; field names unchanged. Response key is **`VoterCardDetail`** (PascalCase).

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "VoterCardDetail": {
      "address": {
        "districtCode": 52,
        "districtName": "NIWARI",
        "districtNameVernacular": "निवाडी",
        "state": "Madhya Pradesh",
        "stateCode": "S12"
      },
      "userAge": 45,
      "assemblyConstituencyName": "PRITHVIPUR",
      "assemblyConstituencyNameVernacular": "पृथ्वीपुर",
      "assemblyConstituencyNumber": 46,
      "constituencyPartName": "PRITHVIPUR ",
      "constituencyPartNameVernacular": "पृथ्वीपुर",
      "constituencyPartNumber": 12,
      "constituencySectionNumber": 1,
      "epicNumber": "XXXXXXX78",
      "userGender": "M",
      "parliamentaryConstituencyName": "XXXXXXXX",
      "parliamentaryConstituencyNameVernacular": "XXXXXX",
      "parliamentaryConstituencyNumber": "1",
      "pollingBooth": {
        "latLong": "XX.21016616,XX.75255656",
        "name": "Sample Name",
        "nameVernacular": "",
        "number": 10
      },
      "relativeNameEnglish": "XXXXRA",
      "relativeNameVernacular": "XXजेंद्र",
      "relativeRelation": "FTHR",
      "serialNumberApplicablePart": 100,
      "status": "N",
      "userNameEnglish": "XXXit",
      "userNameVernacular": "अXXXित",
      "voterLastUpdatedDate": "2023-09-14T12:16:59.664+00:00"
    },
    "pool": {
      "referenceId": "1231005102932ZDVQP",
      "openingBalance": "47.77",
      "paymentAmount": "0.00",
      "mode": "DR",
      "closingBalance": "47.77"
    }
  },
  "timestamp": "2023-10-05 10:29:32",
  "ipay_uuid": "h0069a4b4c88-bc28-498b-9b14-1a126f47b691-0rg0hEqKrhr5",
  "orderid": "1231005102932ZDVQP",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

**`data.VoterCardDetail`**

| Field | Notes |
|-------|-------|
| `epicNumber` | EPIC |
| `userNameEnglish`, `userNameVernacular` | |
| `userAge`, `userGender` | |
| `relativeNameEnglish`, `relativeNameVernacular`, `relativeRelation` | e.g. `FTHR` |
| `status` | |
| `voterLastUpdatedDate` | ISO datetime |
| `address` | `districtCode`, `districtName`, `districtNameVernacular`, `state`, `stateCode` |
| `assemblyConstituencyName` (+ Vernacular / Number) | |
| `parliamentaryConstituencyName` (+ Vernacular / Number) | |
| `constituencyPartName` (+ Vernacular / Number), `constituencySectionNumber` | |
| `serialNumberApplicablePart` | |
| `pollingBooth` | `latLong`, `name`, `nameVernacular`, `number` |

**`data.pool` / billing** (DL-style field names)

| Field | Type | Notes |
|-------|------|-------|
| `referenceId` | String | Mirrors `orderid` |
| `openingBalance` | String | |
| `paymentAmount` | String | |
| `mode` | String | e.g. `DR` |
| `closingBalance` | String | |

### OpenAPI notes

- Spec title: `identity` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyVoterId`
- `400` response documented as empty object `{}`

---

## Offline KYC (Aadhaar)

Aadhaar Offline eKYC flow under `/identity/okyc/*`. Aadhaar number must be sent **AES-256-CBC encrypted** on Send OTP.

```
1. Send OTP     POST /identity/okyc/sendOtp   → otpReferenceID
2. Verify OTP   POST /identity/okyc/verify    → KYC demographics + profilePic + xmlContent
```

> Note: For OKYC headers, `X-Ipay-Endpoint-Ip` is **customer-provided** (InstantPay docs: Provided by InstantPay = **N**).

---

## 6. Offline KYC — Send OTP

Send OTP to the mobile number registered with Aadhaar (offline eKYC step 1).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/okyc/sendOtp` |
| **OpenAPI operationId** | `identity-verification-aadhar-offline-ekyc-send-otp` |
| **Summary** | Send OTP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `aadhaarNumber` | String | Mandatory | Aadhaar Number in **AES-256-CBC** encryption |
| `latitude` | String/Number | Mandatory | End Customer Latitude |
| `longitude` | String/Number | Mandatory | End Customer Longitude |
| `consent` | Enum (`Y`/`N`) | Mandatory | Consent accepted by customer |

### Consent text (provider)

> I hereby give my consent and submit voluntarily at my own discretion, my Aadhaar Number or VID for the purpose of establishing my identity on the portal. The Aadhaar submitted herewith shall not be used for any purpose other than mentioned, or as per the requirements of the law.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/okyc/sendOtp' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "aadhaarNumber": "{{aes256CbcEncryptedAadhaar}}",
  "latitude": 21.2273,
  "longitude": 153.5984,
  "consent": "Y"
}'
```

```http
POST /identity/okyc/sendOtp HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx

{
  "aadhaarNumber": "{{aes256CbcEncryptedAadhaar}}",
  "latitude": -76.2614,
  "longitude": 96.9252,
  "consent": "Y"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": "OtpGenerated",
  "status": "OTP sent to registered mobile number",
  "data": {
    "otpReferenceID": "ZGNjMTJkNjItZTI0ZS00YzYyLWE2YzUtY2UzMjdlZDg3MTgy",
    "aadhaarNumber": "xxxxxxxx6077"
  },
  "timestamp": "2023-05-26 10:06:31",
  "ipay_uuid": "h0059941ba55-9c81-4f4d-a068-4f9b0a44beff",
  "orderid": null,
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

| Field | Type | Notes |
|-------|------|-------|
| `otpReferenceID` | String | Pass to next OKYC step (verify OTP) |
| `aadhaarNumber` | String | Masked Aadhaar (e.g. `xxxxxxxx6077`) |

Notable envelope: `actcode` = `OtpGenerated`; `orderid` may be `null`.

### OpenAPI notes

- Spec title: `send-otp` v1.0
- Server: `https://api.instantpay.in/identity/okyc`
- Path: `POST /sendOtp`
- `400` response documented as empty object `{}`

---

## 7. Offline KYC — Verify OTP

Verify OTP from Send OTP and return offline Aadhaar KYC data (demographics, photo, signed XML).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/okyc/verify` |
| **OpenAPI operationId** | `identity-verification-aadhar-offline-ekyc-verify-otp` |
| **Summary** | Verify OTP |

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `otp` | String | Mandatory | OTP received on mobile |
| `otpReferenceID` | String | Mandatory | Same as Send OTP response |
| `latitude` | String/Number | Mandatory | End Customer Latitude |
| `longitude` | String/Number | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Unique transaction id |
| `consent` | Enum (`Y`/`N`) | Mandatory | Consent accepted by customer |

> Provider sample JSON is missing a comma between `"externalRef"` and `"consent"` — valid body must include the comma.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/okyc/verify' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "otp": "794257",
  "otpReferenceID": "ZGNjMTJkNjItZTI0ZS00YzYyLWE2YzUtY2UzMjdlZDg3MTgy",
  "latitude": 29.9344,
  "longitude": 37.3568,
  "externalRef": "1234567",
  "consent": "Y"
}'
```

```http
POST /identity/okyc/verify HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx

{
  "otp": "794257",
  "otpReferenceID": "ZGNjMTJkNjItZTI0ZS00YzYyLWE2YzUtY2UzMjdlZDg3MTgy",
  "latitude": 42.6930,
  "longitude": 47.9585,
  "externalRef": "1234567",
  "consent": "Y"
}
```

### Sample success response

> `profilePic` (JPEG base64) and `xmlContent` (base64 OfflinePaperlessKyc XML) are large — truncated below. Full blobs come in live response.

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Transaction Successful",
  "data": {
    "fullName": "Sample Name",
    "isMobileVerified": false,
    "isEmailVerified": false,
    "shortAadhaarNumber": "6077",
    "dateOfBirth": "01-12-1999",
    "gender": "M",
    "address": {
      "country": "India",
      "dist": "South  Delhi",
      "state": "Delhi",
      "po": "Post Office Name",
      "loc": "Locality Name",
      "vtc": "Sample Address",
      "subdist": "",
      "street": "Street Name",
      "house": "House Number",
      "landmark": "",
      "pc": "Pin Code",
      "careof": "Sample Name"
    },
    "profilePic": "/9j/4AAQ…(base64 JPEG truncated)…",
    "xmlContent": "PD94bWwg…(base64 OfflinePaperlessKyc XML truncated)…",
    "externalRef": "123456789",
    "pool": {
      "referenceId": "1240220115212UJNPF",
      "openingBalance": "40.58",
      "mode": "DR",
      "closingBalance": "40.58",
      "transactionValue": "0.00",
      "payableValue": "0.00"
    }
  },
  "timestamp": "2024-02-20 11:52:12",
  "ipay_uuid": "h0069b6105de-45eb-455b-8523-05e131676c57-oIksbc0Sp87m",
  "orderid": "1240220115212UJNPF",
  "environment": "LIVE",
  "internalCode": null
}
```

### Response `data` shape (success)

| Field | Type | Notes |
|-------|------|-------|
| `fullName` | String | |
| `isMobileVerified` | Boolean | |
| `isEmailVerified` | Boolean | |
| `shortAadhaarNumber` | String | Last 4 digits |
| `dateOfBirth` | String | e.g. `01-12-1999` |
| `gender` | String | e.g. `M` |
| `address` | Object | `country`, `dist`, `state`, `po`, `loc`, `vtc`, `subdist`, `street`, `house`, `landmark`, `pc`, `careof` |
| `profilePic` | String | Base64 JPEG |
| `xmlContent` | String | Base64 Aadhaar OfflinePaperlessKyc XML (+ signature) |
| `externalRef` | String | Echo of request |
| `pool` | Object | `referenceId`, `openingBalance`, `mode`, `closingBalance`, `transactionValue`, `payableValue` |

### OpenAPI notes

- Spec title: `identity` v1.0
- Server listed as `https://api.instantpay.in/identity` with path `/okyc/verify` (full URL still `…/identity/okyc/verify`)
- `400` response documented as empty object `{}`

---

## 8. Aadhaar Demographic

Verify demographic details associated with an Aadhaar number (address/age band/gender/masked mobile — returned as optional label/value pairs).

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `https://api.instantpay.in/identity/verifyAadhaar` |
| **OpenAPI operationId** | `identity-verification-aadhaar-demographic` |
| **Summary** | Aadhaar Demographic |

> `X-Ipay-Endpoint-Ip` is **customer-provided** (Provided by InstantPay = **N**).

### Request parameters

| Parameter | Type | Requirement | Description |
|-----------|------|-------------|-------------|
| `aadhaarNumber` | String | Mandatory | Aadhaar Number in **AES-256-CBC** encryption |
| `latitude` | String | Mandatory | End Customer Latitude |
| `longitude` | String | Mandatory | End Customer Longitude |
| `externalRef` | String | Mandatory | Unique Transaction Id |
| `consent` | String | Mandatory | `Y` or `N` |

### Consent text (provider)

> I hereby give my consent and submit voluntarily at my own discretion, my Aadhaar Number or VID for the purpose of establishing my identity on the portal. The Aadhaar submitted herewith shall not be used for any purpose other than mentioned, or as per the requirements of the law.

### Sample request

```bash
curl --location 'https://api.instantpay.in/identity/verifyAadhaar' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json' \
--header 'X-Ipay-Auth-Code: {{authCode}}' \
--header 'X-Ipay-Client-Id: {{clientId}}' \
--header 'X-Ipay-Client-Secret: {{clientSecret}}' \
--header 'X-Ipay-Endpoint-Ip: {{endPointIP}}' \
--data '{
  "aadhaarNumber": "{{aes256CbcEncryptedAadhaar}}",
  "latitude": "80.123456",
  "longitude": "12.234567",
  "externalRef": "abc1256",
  "consent": "Y"
}'
```

```http
POST /identity/verifyAadhaar HTTP/1.1
Host: api.instantpay.in
Accept: application/json
Content-Type: application/json
X-Ipay-Auth-Code: 1
X-Ipay-Client-Id: xxxxxxxxxxxxxxxx
X-Ipay-Client-Secret: xxxxxxxxxxxxxxxx
X-Ipay-Endpoint-Ip: xxxxxxxxxxxxxx

{
  "aadhaarNumber": "{{aes256CbcEncryptedAadhaar}}",
  "latitude": "80.123456",
  "longitude": "12.234567",
  "externalRef": "abc1256",
  "consent": "Y"
}
```

### Sample success response

```json
{
  "statuscode": "TXN",
  "actcode": null,
  "status": "Aadhaar Verification Successful",
  "data": {
    "poolReferenceId": "1230717111733NHBJQ",
    "pool": {
      "openingBal": "96180.83",
      "amount": "3.54",
      "closingBal": "96177.29"
    },
    "optional1Label": "Address",
    "optional1": "Uttar Pradesh",
    "optional2Label": "Age Band",
    "optional2": "20-30",
    "optional3Label": "Gender",
    "optional3": "M",
    "optional4Label": "Mobile Number",
    "optional4": "*******547"
  },
  "timestamp": "2023-07-17 11:17:33",
  "ipay_uuid": "h00099aa6ef7-75e2-496c-b256-2a775fea2156",
  "orderid": "1230717111733NHBJQ",
  "environment": "SANDBOX",
  "internalCode": null
}
```

### Response `data` shape (success)

Demographics come as **optionalN / optionalNLabel** pairs (labels may vary by environment):

| Field | Sample label | Sample value |
|-------|--------------|--------------|
| `optional1` / `optional1Label` | Address | `Uttar Pradesh` |
| `optional2` / `optional2Label` | Age Band | `20-30` |
| `optional3` / `optional3Label` | Gender | `M` |
| `optional4` / `optional4Label` | Mobile Number | `*******547` (masked) |

**Pool**

| Field | Notes |
|-------|-------|
| `poolReferenceId` | Mirrors `orderid` |
| `pool.openingBal` / `amount` / `closingBal` | UAN-style naming (no `mode` in sample) |

### OpenAPI notes

- Spec title: `verify-aadhaar` v1.0
- Server: `https://api.instantpay.in/identity`
- Path: `POST /verifyAadhaar`
- `400` response documented as empty object `{}`
- Some provider code samples omit `consent` in OpenAPI curl — request params table requires it
