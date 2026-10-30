# React Native upgrade 0.77.3 → 0.88.x (PL-36)

**Size:** XL — one phase per chat. **Surface:** mobile only (`apps/asanpay-mobile-app`).

## Why

Play Console "recommended actions" on release 8 (1.0.5):

| Warning | Source | Expected after upgrade |
|---|---|---|
| Upgrade Android Gradle plugin to 9.0+ | RN 0.77 ships AGP 8.x | **Gone** — RN 0.87+ uses AGP 9.2.1 |
| Deprecated edge-to-edge APIs (`setStatusBarColor` etc.) | RN `StatusBarModule`, `WindowUtilKt`, Material `c.a` | RN parts should go; Material part may stay until Material drops it |
| Edge-to-edge may not display for all users | Follows from the deprecated-API warning | Should go with it |
| Bitmap downsampling `t1.c.c` | Fresco `DefaultDecoder` (RN image pipeline) | May stay — not our code |

None of these block upload or updates. Verify in the Play **pre-launch report** after an internal-testing upload.

## Facts (checked 30 Oct 2026)

- Latest RN `0.88.1`: needs **React 19.3+**, Node `^22.13 || ^24.3 || >=26` (Mac has Node 26 ✅), Kotlin 2.2.0, AGP 9.2.1.
- `newArchEnabled=true` already; Hermes on.
- Custom legacy bridge modules: `RdServiceModule.kt` (**AEPS fingerprint RD service**), `MockLocationModule.kt`.
- `scripts/link-navigation.sh` copies zustand so it uses mobile React 18 — remove once mobile is on React 19 (portals already on React 19.2).

## Read ONLY

`AGENTS.md`, this file, `apps/asanpay-mobile-app/package.json`, `apps/asanpay-mobile-app/android/**/*.gradle`,
`gradle.properties`, `gradle/wrapper/gradle-wrapper.properties`, `MainApplication.kt`, `MainActivity.kt`,
plus only the files named in the current phase.

Reference diff: <https://react-native-community.github.io/upgrade-helper/?from=0.77.3&to=0.88.1>

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Branch `rn-0.88` off `main`; confirm current release APK builds (baseline) | **CURRENT** |
| 1 | JS deps: `react-native`, `react`, `@react-native/*`, `@react-native-community/cli*`, `@types/react` 19, metro / babel config per upgrade-helper | |
| 2 | Android native: Gradle wrapper 9.x, root + app `build.gradle`, `settings.gradle`, `gradle.properties` (edge-to-edge flag if template has it), `MainApplication.kt` (new host API), ProGuard; keep signing, brand key, in-app update, adaptive icon, FLAG_SECURE | |
| 3 | Native libs: vision-camera 4→5 (`CardCameraModal`, `ScanQrModal`), async-storage 2→3 (3 files), webview 13→14, screens, safe-area-context 5, svg, image-picker 8, datetimepicker 9, jail-monkey 3; confirm biometrics / keychain / crop-picker / image-resizer / geolocation / linear-gradient / clipboard build | |
| 4 | Custom modules: `RdServiceModule`, `MockLocationModule` work via interop layer — else convert to TurboModule | |
| 5 | Monorepo cleanup: drop React-18 zustand copy in `link-navigation.sh`; one React 19 across repo | |
| 6 | Device test (checklist below) on Android 15/16 + one older phone | |
| 7 | Release: bump versionCode, `bundleRelease`, **internal testing** track first, read pre-launch report, then production | |

## Device test checklist (phase 6)

- [ ] Login, MPIN, biometric unlock (keychain + biometrics)
- [ ] Signup KYC: camera capture, crop (zoom / rotate tabs), image resize, location, chips multi-select
- [ ] AEPS with real RD fingerprint device (cash withdrawal, balance, mini statement)
- [ ] DMT, BBPS, recharge, QR scan (vision-camera), CMS
- [ ] Settlements, fund request, clipboard copy, date range picker, exports
- [ ] Status bar / edge-to-edge on every main screen, modals, keyboard insets
- [ ] Launcher icon (adaptive + themed), splash
- [ ] Play in-app update prompt (internal-testing install)

## Done when

Release built on RN 0.88.x passes the checklist and the Play pre-launch report no longer shows the AGP 9 and RN edge-to-edge warnings.
