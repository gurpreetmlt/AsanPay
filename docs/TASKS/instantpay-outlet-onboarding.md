# InstantPay Register Outlet = retailer onboarding

## Product decision
Retailer primary onboarding uses **InstantPay Register Outlet** (Min-KYC), not Adhikari `/kyc`.

Funnel: Login/Signup → `/onboarding/outlet` → `/onboarding/pin` → Dashboard
Mobile: Signup **Outlet Details** → `POST /onboarding/instantpay` (same Min-KYC body).
Next chat: Bio-KYC UI + `wadh`.

## Done
- [x] `AuthUser.hasInstantpayOutlet`
- [x] `nextOnboardingPath` / gate → `/onboarding/outlet`
- [x] Web Min-KYC form → `POST /onboarding/instantpay`
- [x] Mobile signup Outlet Details → InstantPay Min-KYC (address, city, pincode, lat/long, email, DOB, gender)

## Read ONLY
- `InstantPay/ONBOARDING.md`
- `apps/web/app/onboarding/outlet/page.tsx`
- `apps/web/lib/onboarding.ts`
- `apps/backend/src/modules/onboarding/*`
- `packages/shared-types/index.ts`
- `apps/asanpay-mobile-app/src/screens/signup/SignupScreen.tsx`

## Still pending
- Bio-KYC screens + `wadh` RD capture
- Standalone mobile Register Outlet screen (if needed post-login for incomplete outlet)
