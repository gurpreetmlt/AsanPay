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
| 0 | Branch `rn-0.88` off `main`; confirm current release APK builds (baseline) | done 30 Oct — branch pushed; baseline release APK installed OK on 0.77.3 |
| 1 | JS deps: `react-native`, `react`, `@react-native/*`, `@react-native-community/cli*`, `@types/react` 19, metro / babel config per upgrade-helper | done 30 Oct — RN 0.88.1, React 19.3.0, CLI 20.2.0, TS 6, `@react-native/jest-preset` (+ `jest.config.js`), `@types/jest`, lucide 0.469 → 0.577 (0.469 peer blocks React 19). Babel / metro unchanged (template same; metro pins still needed). `tsconfig` extends `@react-native/typescript-config` (package now exports only `.`). RN 0.88 types: `StyleSheet.absoluteFillObject` → `absoluteFill`, refs → `ScrollViewInstance` / `TextInputInstance`, `Modal onRequestClose` must return void. `tsc` left with 13 older `ApiResponse` union errors (`SignupScreen`, `AepsScreen` read `data.data` without checking `success`) — not from the upgrade. Android build broken until phase 2 |
| 2 | Android native: Gradle wrapper 9.x, root + app `build.gradle`, `settings.gradle`, `gradle.properties` (edge-to-edge flag if template has it), `MainApplication.kt` (new host API), ProGuard; keep signing, brand key, in-app update, adaptive icon, FLAG_SECURE | done 30 Oct — Gradle 9.4.1 / AGP 9.2.1 configure + 53 tasks OK; `assembleRelease` then stops in lib C++ (phase 3). Gradle 9.4.1-bin, Kotlin 2.2.0, compileSdk / buildTools 37 (target 36), `edgeToEdgeEnabled=true` + `android.builtInKotlin=false` / `android.newDsl=false`, `MainApplication` → `loadReactNative` + lazy `getDefaultReactHost(packageList)` (Rd / MockLocation packages kept), `MainActivity` drops androidx `enableEdgeToEdge()` (ReactActivity does it), `proguard-android-optimize.txt` (AGP 9 removed the old file), JSC artifact → `io.github.react-native-community`, `buildFeatures.buildConfig true`, `codegenDir` → repo-root `node_modules` (mobile-local has none), `react-native` → `react-android` substitution reads version from `package.json`. Manifest cleartext kept as-is (main `false`, debug override `true`). Lib-module compile errors (vision-camera, async-storage…) belong to phase 3 |
| 3 | Native libs: vision-camera 4→5 (`CardCameraModal`, `ScanQrModal`), async-storage 2→3 (3 files), webview 13→14, screens, safe-area-context 5, svg, image-picker 8, datetimepicker 9, jail-monkey 3; confirm biometrics / keychain / crop-picker / image-resizer / geolocation / linear-gradient / clipboard build | done 30 Oct — `assembleRelease` OK (Gradle 9.6.1, 886 tasks); `tsc` only the 13 old `ApiResponse` errors. `metro.config.js` pinning now resolves by name from the app root (direct file paths skipped RN 0.88 `exports`, e.g. `react-native/react-private-interface`). Gradle daemon → `-Xmx4096m -XX:MaxMetaspaceSize=1024m` (ran out of Metaspace). Root `node_modules` still has extraneous RN 0.86 copies → phase 5. Bumped: svg 15.16.0, screens 4.30.1, safe-area-context 5.11.0, qrcode-svg 6.3.49, webview 14.0.1, image-picker 8.3.0, async-storage 3.1.1 (only `getItem` / `setItem` / `removeItem` used → no code change; KSP picks `2.2.0-2.0.2` for Kotlin 2.2.0), jail-monkey 3.0.0 (TurboModule `JailMonkey` → `geoCapture.ts` guard checks `TurboModuleRegistry` too). Vision Camera 4 → 5.2.4 + `react-native-nitro-modules` 0.37.1 + `react-native-nitro-image` 0.15.2: `CardCameraModal` → `usePhotoOutput` (FHD 16:9 JPEG) + `capturePhotoToFile`, `orientationSource="interface"` (was `outputOrientation="preview"`); VC5 core throws on Android for object output, so `ScanQrModal` uses `react-native-vision-camera-barcode-scanner` 5.2.4 (ML Kit bundled) `useBarcodeScannerOutput(["qr-code"])`. Removed `VisionCamera_enableCodeScanner` (v4-only). Gradle wrapper 9.4.1 → 9.6.1 = newest that works: RN 0.88's `@react-native/gradle-plugin` compiles with Kotlin 2.2.0 (reads metadata ≤ 2.3), and 9.6.x embeds Kotlin 2.3.21. 9.7+ embeds Kotlin 2.4 — 9.8.2 was tried and fails in `:gradle-plugin:settings-plugin:compileKotlin`. Move past 9.6 only when RN's plugin moves to Kotlin 2.3+. Dropped `@react-native-community/datetimepicker` — not imported anywhere (`DateRangeCard` is pure JS). biometrics / keychain / crop-picker / image-resizer / geolocation / linear-gradient / clipboard already latest — confirm in build |
| 4 | Custom modules: `RdServiceModule`, `MockLocationModule` work via interop layer — else convert to TurboModule | done 30 Oct — interop, no conversion. RN 0.88 `ReactNativeNewArchitectureFeatureFlagsDefaults.useTurboModuleInterop() = true`; `ReactPackageTurboModuleManagerDelegate` loads plain `ReactPackage` modules when bridgeless + interop (we don't set the minify-legacy-architecture switch, which would force interop off). Both modules already use `reactContext.currentActivity` (only the base-class `getCurrentActivity()` is deprecated in 0.80+); `addActivityEventListener` works on the bridgeless context. Release keep rules cover them (`com.asanpay.mobile.**` + RN's `NativeModule` keep). Device proof: AEPS fingerprint capture with no RD app must show "No UIDAI fingerprint RD Service detected", not "RD Service native module missing"; MockLocation uses the same package path. Revisit only if a later RN drops interop |
| 5 | Monorepo cleanup: drop React-18 zustand copy in `link-navigation.sh`; one React 19 across repo | done 30 Oct — `npm ci` clean (one react 19.3.0 / react-native 0.88.1 / scheduler 0.28.0 in the lockfile), admin / agent / Frontend `next build` OK, mobile `tsc` only the 13 old errors, `assembleRelease` OK (886 tasks) + installed. Cause of the split: mobile RN 0.88.1 peers `react ^19.3.0`, portals pinned 19.2.7 / Frontend 19.2.4 → npm nested react + react-native under the app and auto-installed a peer `react-native` 0.86.0 at the root for the hoisted RN libs. Fix: admin-portal, agent-portal, Frontend → `react` / `react-dom` 19.3.0 (Next 16.2.10 peers `^19`), so react + react-native hoist to the root and the 0.86 copy goes. `link-navigation.sh` no longer copies zustand (removes a stale app copy). Gradle (`android/build.gradle` version read, `app/build.gradle` `reactNativeDir` / `cliFile`) and `metro.config.js` `extraNodeModules` now look in the app `node_modules` first, then the root — layout-agnostic. Navigation + RN UI lib copies in `link-navigation.sh` kept (Metro pins resolve them from the app root). Lockfile kept the old layout on `npm install` and `npm update` (stale `react-native` 0.86 peer at root; `@react-native/debugger-shell` 0.88.1 missing → RN `react-native.config.js` threw → CLI config empty → autolinking empty) — fixed by hand in `package-lock.json` (debugger-shell + `fb-dotslash` 0.5.8 added, `dev-middleware`'s stray `debug` 2.6.9 moved under `send`); `npm ci` clean. Gradle autolinking cache `android/build/generated/autolinking/` is keyed on the app `package.json` only — delete it whenever packages move in the root lockfile. RN gradle plugin looks for `hermes-compiler` only under the app's `node_modules` → `app/build.gradle` sets `hermesCommand` (same app-then-root lookup) |
| 6 | Device test (checklist below) on Android 15/16 + one older phone | partial 30 Oct — release APK installs, app opens, login OK. AEPS with the RD device deferred: the daily 2FA gate is hidden until AEPS agent onboarding is done, and 2FA calls the provider API with the agent id. Finish the rest of the checklist on the internal-testing build (phase 7) before promoting to production |
| 7 | Release: bump versionCode, `bundleRelease`, **internal testing** track first, read pre-launch report, then production | **CURRENT** — versionCode 10 / 1.0.7 (`app/build.gradle` + `src/lib/appVersion.ts`). Material 1.12.0 → 1.14.0 (guards its deprecated status / navigation bar calls on API 35+). Edge-to-edge warning will still list RN `WindowUtilKt.enableEdgeToEdge` (open upstream, not fixed on RN main as of 30 Oct). Bitmap downsampling: no-`Options` decode calls live in image-crop-picker, image-picker, image-resizer, nitro-image — all already latest; fixing needs local patches |

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
