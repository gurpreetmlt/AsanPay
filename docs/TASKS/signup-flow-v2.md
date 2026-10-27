# Signup flow v2 — 8 steps, name from PAN, shop + home location

Planning: PL-18 · Surfaces: web (`apps/agent-portal/app/signup/page.tsx`), mobile
(`apps/asanpay-mobile-app/src/screens/signup/SignupScreen.tsx`), backend.

## Final flow (owner-approved 27 Oct)

| # | Step | Fields |
|---|------|--------|
| 1 | Create account | Mobile · Terms · OTP · Password |
| 2 | Role | Retailer / Direct Retailer · Distributor mobile (Retailer only) → creates account |
| 3 | PAN | PAN (auto-verify) · Full Name (auto from PAN, locked) · DOB · Gender · Father name · PAN photo |
| 4 | Aadhaar | Number · OTP · front + back photo |
| 5 | Contact & address | Email + OTP · Home address · Pincode → city/district/state (auto) · **Home location** |
| 6 | Business | Shop name/type/category/turnover/proof · Shop address · Pincode → auto · **Shop location** |
| 7 | Bank | IFSC → bank/branch (auto) · Account no ×2 · Holder name · Cheque photo |
| 8 | Photos & submit | Live selfie · Live shop photo · Agreement · Submit KYC |

Auto-filled only: name (PAN), city/district/state (pincode), bank/branch (IFSC), locations (GPS).
Anniversary date leaves signup (Profile, optional). Distributor / Super Distributor = invite link only
(already the case).

## Part 1 — done (27 Oct)
- Password moved to step 1; step 2 = role + distributor (Continue creates the account).
- PAN step order: PAN → Name → DOB → Gender → Father name → photo; anniversary removed.
- Full Name removed from role step; account starts with a placeholder name (`Retailer ••3006`) and
  takes the PAN name on PAN verify. PAN / Aadhaar photo uploads locked until their fields are filled.

## Part 2 — shop + home location (built 27 Oct — migrate `0080` + npm install + APK + live test pending)

**Built**
- ✅ Migration `0080_signup_home_location`: `users.home_latitude/home_longitude/home_location_at`,
  `geo_link_requests.capture_ip`.
- ✅ `geo_link_requests` purposes `shop` | `home`: `POST /api/geo-link/start` (any agent role for these two),
  public `GET /api/geo-link/public/:token` + `POST /api/geo-link/public/:token/confirm` (no login, rate-limited
  40 / 15 min per IP). 10 min scan window, single capture, ±150 m rule with the exact copy; the captured point
  stays usable for KYC submit for 7 days (drafts finished another day). App-scan purposes unchanged.
- ✅ Web: `components/signup/SignupGeoCapture.tsx` on steps 5 / 6 (QR = `<portal origin>/geo/<token>`, polls,
  "Generate new QR" on expiry); public phone page `app/geo/[token]/page.tsx` (high-accuracy watch ≤ 12 s).
- ✅ Mobile: `components/SignupLocationCard.tsx` + `captureSignupLocation()` in `lib/geoCapture.ts`
  (high-accuracy watch ≤ 15 s, native mock check + `jail-monkey` mock check, root = risk flag only).
- ✅ `submitKyc`: `shopGeoLinkToken` / `homeGeoLinkToken` (server-stored coords) or `shopLocation` /
  `homeLocation` (app GPS). Shop → `outlet_*`, home → `home_*`. Both optional on the server (old APKs).
- ✅ Geofence `serviceGeofenceDecision`: 15 km shop OR 5 km home (`SHOP_GEOFENCE_KM`, `HOME_GEOFENCE_KM`;
  `AEPS_GEOFENCE_KM` only as shop fallback). Applies where the gate already ran: AePS (balance, mini
  statement, withdraw + OTP, deposit), Aadhaar Pay (+ OTP), DMT transfer. Unit tests in `aepsCompliance.test.ts`.
- ✅ Risk signals (Admin → Risk alerts): `shop_far_from_pincode` (> 25 km, Nominatim, cached),
  `possible_vpn` (GeoLite2 if `GEOLITE2_DB_PATH`, ip-api.com if `IP_PROXY_CHECK_ENABLED=true`), `rooted_device`.
  `kyc.submit` audit metadata has `homeLocation`, `shopLocation`, `homeToShopKm`.
- ✅ Step-1 location gate removed (web + mobile); `latitude/longitude` optional on signup request / complete.

**Owner change 27 Oct — home location optional at signup:** signup is done in one sitting, usually at the
shop. Shop location stays required; home is optional ("Skip"). Added later once via `POST /kyc/home-location`
(`{ geoLinkToken }` web QR / `{ location }` app GPS, same ±150 m + mock checks), from web Settings → Profile & KYC
(`components/settings/HomeLocationCard.tsx`) and mobile Account → Profile & KYC. Set once: a second call →
409 `HOME_LOCATION_ALREADY_SET` (re-capturing "home" anywhere would move the 5 km zone). `/kyc/me` →
`homeLocationAt`. Audit `kyc.home_location_set` (coords, source, accuracy, homeToShopKm).

**Left**
- [ ] Admin KYC view: show both pins + distance (data is in the `kyc.submit` audit metadata).
- [ ] No geofence today on recharge, BBPS, CMS, UPI cash point, settlements / payouts (no geo sent).
- [ ] VPN check on the mobile path (only the web phone-page capture IP is checked today).
- [ ] `riskSignal.evaluateGeoSignal` still logs `out_of_zone` at 3 km from the shop (log-only).

**Spec**
- Location capture: mobile **Fetch location** button (high-accuracy GPS + mock check + jail-monkey).
- **Web = phone camera QR, no app (owner decision 27 Oct):** QR encodes an https URL to a public
  AsanPay page (e.g. agent-portal `/geo/<token>`). Phone camera / Lens opens it in the browser →
  "Allow location" → phone GPS posted to the backend with the token. Token: bound to the signup user,
  purpose `shop` | `home`, single use, 10 min expiry. Reject accuracy worse than ±150 m with
  "Location is not accurate enough. Turn on GPS, go near a window and try again." Web polls and shows
  "Location captured ✓ · accuracy N m". Reuse `geo_link_requests` (PL-03) where possible; the existing
  app-scan flow keeps working.
- **Risk flags (never block on their own, shown to admin):**
  - Shop GPS > 25 km from the typed shop pincode → flag (pincode → lat/lng: OpenStreetMap Nominatim
    with cache, or an offline pincode lat/lng list; free only).
  - IP of the capture request: country/region via MaxMind GeoLite2 (optional, `GEOLITE2_DB_PATH`) and
    VPN / proxy flag via ip-api.com (optional, env-gated). Foreign IP or proxy → "Possible VPN" flag.
- VPN does not change phone GPS; the ±150 m rule rejects IP-only rough locations.
- Step 5: Home location (required). Step 6: Shop location (required, "stand inside your shop").
- Migration: `users.home_latitude`, `users.home_longitude` (+ captured-at). Shop stays in
  `outlet_latitude/longitude`. `submitKyc` takes server-stored geo-link coords, never browser coords.
- Geofence (all services, not only AePS): allowed if within **15 km of shop** OR **5 km of home**.
  Env `SHOP_GEOFENCE_KM=15`, `HOME_GEOFENCE_KM=5` (replace `AEPS_GEOFENCE_KM` usage in
  `modules/aeps/compliance.ts`; keep the old env as fallback for shop).
- Remove the step-1 location gate (web + mobile) and make `latitude/longitude` optional on
  `/auth/signup/request` + `/auth/signup/complete` — only after shop location capture ships.
- Admin KYC view: show both pins + distance between them.

## Part 3 — merge Photos + Agreement (8 steps)
- One step: live selfie + live shop photo + agreement + Submit KYC.
- Update stepper labels, `SIGNUP_STEPS`, `getSignupResumeStep`, `maxStepReached` clamp, `stepIndex === 8`
  submit checks, "Step N of 9" copy, and `kycDocCheckSlotsForStep` (PAN/Aadhaar indices unchanged).
- Old drafts with `stepIndex` 8 → clamp to 7.

## Done check
- [ ] Web + mobile match on every step
- [x] Old APK signup still works (backend accepts name / location when sent; home optional on the server)
- [x] Geofence: shop 15 km / home 5 km covered by unit test (`compliance` pure helper)
- [x] CHECKLIST updated (Part 2)
