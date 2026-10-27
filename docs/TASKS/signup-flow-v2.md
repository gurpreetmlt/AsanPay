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

## Part 2 — shop + home location (next)
- Location capture: mobile **Fetch location** button (high-accuracy GPS, mock check); web = existing
  phone QR (`geo_link_requests`, PL-03). The QR flow needs the AsanPay app logged in to the same
  account — account exists from step 2, so this works; show that hint next to the QR.
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
- [ ] Old APK signup still works (backend accepts name / location when sent)
- [ ] Geofence: shop 15 km / home 5 km covered by unit test (`compliance` pure helper)
- [ ] CHECKLIST updated
