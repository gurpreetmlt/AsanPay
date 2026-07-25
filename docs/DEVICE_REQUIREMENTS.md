# AsanPay — Biometric Device Requirements

**Product:** AsanPay (AePS)
**Audience:** Device OEM / RD Service vendor / integration partner
**Scope:** Android mobile app + Agent Web (Windows browser)
**Auth modes:** Fingerprint (primary) · Iris (planned)

---

## 1. Compliance (mandatory)

| Requirement | Detail |
|-------------|--------|
| Certification | **UIDAI L1 Registered Device (RD)** only |
| Spec | Aadhaar Registered Devices 2.0 (or current UIDAI revision) |
| Output | Encrypted **PidData** XML (PID ver 2.0) from RD Service |
| No raw images | App/web must never receive raw fingerprint/iris images — only RD-signed PidData |

---

## 2. Supported capture modes

| Mode | Status in AsanPay | UIDAI Intent / API |
|------|------------------------|--------------------|
| **Fingerprint** | Live (mobile + web) | `in.gov.uidai.rdservice.fp.INFO` / `fp.CAPTURE` |
| **Iris** | UI ready — needs vendor RD + integration | `in.gov.uidai.rdservice.iris.INFO` / `iris.CAPTURE` |

---

## 3. Android mobile app

### 3.1 Platform

| Item | Requirement |
|------|-------------|
| OS | Android **8.0+** (API 26+); target current Play Store requirements |
| Architecture | ARM64 preferred |
| USB | OTG / host mode for USB biometric devices |
| Network | Internet for RD management server (OEM requirement); localhost loopback for RD HTTP if used |

### 3.2 Integration method (required)

AsanPay Android app uses **UIDAI Intent API** (not a hard-coded port):

1. Discover RD package that handles `in.gov.uidai.rdservice.fp.CAPTURE` (fingerprint) or `iris.CAPTURE` (iris).
2. `startActivityForResult` with extra **`PID_OPTIONS`** (PidOptions XML).
3. Receive **`PID_DATA`** (PidData XML) in activity result.

**Package visibility (Android 11+):** App must be allowed to query RD packages / CAPTURE intents.

### 3.3 Fingerprint — known working reference

| Item | Value |
|------|--------|
| Device example | **Mantra MFS110 L1** |
| RD Service package (Play Store) | `com.mantra.mfs110.rdservice` |
| RD Service app | Mantra L1 RDService (installed & running; device **Connected**) |
| Capture | Intent `in.gov.uidai.rdservice.fp.CAPTURE` + `PID_OPTIONS` |

Other L1 vendors (Morpho, Startek, Evolute, VisionTek, Precision, etc.) are acceptable **if** they register the same UIDAI CAPTURE/INFO intents and return standard PidData.

### 3.4 Iris — mobile requirements (for vendor)

| Item | Requirement |
|------|-------------|
| Hardware | UIDAI-certified **L1 iris** device |
| RD Service | Android RD Service APK registering `in.gov.uidai.rdservice.iris.INFO` and `iris.CAPTURE` |
| Package name | Vendor to provide exact Play Store / APK package id |
| PidOptions | Iris: `iCount` / `iType` per UIDAI (typically `iCount="1"`, `iType="0"`) |
| Result | `PID_DATA` with iris biometric block |

Vendor must provide: sample app, package name, PidOptions sample, and test device for AsanPay QA.

---

## 4. Agent Web (Windows PC + browser)

### 4.1 Platform

| Item | Requirement |
|------|-------------|
| OS | **Windows 10 / 11** (x64) |
| Browser | **Google Chrome** (latest) or Edge Chromium |
| RD Service | Windows **L1 RD Service** for the connected device |
| Scanner | USB connected to **same PC** as the browser |
| Network | PC must reach OEM management server (e.g. Mantra) as per RD install guide |

### 4.2 Integration method (required)

Web does **not** use Android intents. It uses **local RD HTTP API** on loopback:

| Item | Requirement |
|------|-------------|
| Host | `127.0.0.1` only (no public IP) |
| Port | Dynamic — typically **11100–11120** (RD Service screen shows exact URL) |
| Schemes | `http://127.0.0.1:<port>` and/or `https://127.0.0.1:<port>` |
| Discover | App probes ports; caches last working endpoint |
| Capture | HTTP method **`CAPTURE`** (UIDAI) with PidOptions XML body |
| Paths | Prefer `/rd/capture` or `/` (vendor to confirm) |
| Response | PidData XML |

**Important:** Browser and RD Service must run on the **same Windows machine** as the USB scanner.

### 4.3 HTTPS live site (Chrome)

If Agent Web is served over **HTTPS**, vendor/support should document Chrome flags for customers:

1. `chrome://flags/#allow-insecure-localhost` → **Enabled** (for RD HTTPS self-signed cert)
2. `chrome://flags/#block-insecure-private-network-requests` → **Disabled**

Prefer also providing a Windows Web RD test URL (e.g. Mantra `https://rdtest.aadhaardevice.com/`).

### 4.4 Fingerprint — web reference

| Item | Value |
|------|--------|
| Device | Mantra MFS110 L1 (or other UIDAI L1) |
| Windows RD | Mantra L1 RDService (Windows) |
| UI check | Device connected + local URL e.g. `http://127.0.0.1:11100` |

### 4.5 Iris — web requirements (for vendor)

| Item | Requirement |
|------|-------------|
| Windows RD Service | Iris L1 RD exposing same localhost HTTP CAPTURE API |
| Intent N/A | Web uses HTTP only |
| PidOptions | Iris counts/types per UIDAI |
| Port / path | Vendor to document port range + capture URL |
| Browser | Same Chrome localhost / private-network guidance |

---

## 5. PidOptions (fingerprint — current AsanPay)

Example used for fingerprint capture:

```xml
<PidOptions ver="1.0">
  <Opts fCount="1" fType="2" iCount="0" pCount="0"
        format="0" pidVer="2.0" timeout="20000"
        posh="UNKNOWN" env="P"/>
</PidOptions>
```

| Attribute | Notes |
|-----------|--------|
| `fType` | `0` = FMR, `2` = FMR+FIR (L1 common) — confirm with aggregator |
| `env` | `P` = Production (PP/S for UAT as needed) |
| `timeout` | Milliseconds |

**Iris PidOptions** (vendor to confirm):

```xml
<PidOptions ver="1.0">
  <Opts fCount="0" iCount="1" iType="0" pCount="0"
        format="0" pidVer="2.0" timeout="20000"
        posh="UNKNOWN" env="P"/>
</PidOptions>
```

---

## 6. What AsanPay needs from the company

Please provide for **each** device model (fingerprint and iris):

1. **UIDAI L1 certificate** / model name & RD version
2. **Android:** package name(s), Play Store / APK link, Intent actions supported
3. **Windows:** RD Service installer, default port range, capture URL path, HTTP vs HTTPS
4. **Sample PidOptions** (fingerprint + iris) accepted by your RD
5. **Sample PidData** success XML (sanitized)
6. **Error codes** list (`errCode` / `errInfo`) for not connected, timeout, poor quality
7. **Test devices** (loaner) for fingerprint + iris
8. **Management server** / AMC / registration process for production devices
9. **Web SDK / docs** (if any beyond standard UIDAI localhost API)
10. **Support contact** for RD install issues at retailer shops

---

## 7. Retailer shop checklist (operations)

### Mobile (Android)

- [ ] Install AsanPay app
- [ ] Install vendor **L1 RD Service** from Play Store
- [ ] Open RD Service → plug device → status **Connected**
- [ ] Grant USB permission when prompted
- [ ] AePS → select device → Scan

### Web (Windows)

- [ ] Install Windows L1 RD Service + drivers
- [ ] Open RD Service → Device connected (note `127.0.0.1:PORT`)
- [ ] Chrome on **same PC** → Agent Web → AePS
- [ ] For HTTPS site: apply Chrome localhost flags if capture fails
- [ ] Scan Finger when UI shows **Scanner ready**

---

## 8. Out of scope / not accepted

- Non-UIDAI / uncertified biometric devices
- Apps that only work inside OEM demo app and do **not** expose Intent (Android) or localhost CAPTURE (Windows)
- Sending raw biometric templates to AsanPay servers without RD encryption
- Iris on web/mobile without certified L1 iris RD Service

---

## 9. Contact (AsanPay)

Integration questions / package confirmation:
**[Add your company email / phone]**

---

*Document version: 1.0 · For vendor configuration & commercial discussion*
