# InstantPay Register Outlet = retailer onboarding

## Product decision
Retailer primary onboarding uses **InstantPay Register Outlet** (Min-KYC), not Adhikari `/kyc`.

Funnel: Login/Signup → `/onboarding/outlet` → `/onboarding/bio-kyc` → Dashboard
Mobile: Account → Register InstantPay outlet → Biometric KYC (after Min-KYC).

## Done
- [x] `AuthUser.hasInstantpayOutlet`
- [x] Web Min-KYC form → `POST /onboarding/instantpay` (`/onboarding/outlet`)
- [x] Web Bio-KYC UI + RD `wadh` → `/onboarding/bio-kyc`
- [x] Mobile Register Outlet modal (`POST /onboarding/instantpay`)
- [x] Mobile Bio-KYC modal + RD `wadh`
- [x] Web/mobile `captureFingerprint*` accept `{ otp?, wadh? }`

## Read ONLY
- `InstantPay/ONBOARDING.md`
- `apps/web/app/onboarding/outlet/page.tsx`
- `apps/web/app/onboarding/bio-kyc/page.tsx`
- `apps/web/lib/rdServiceFingerprint.ts`
- `apps/backend/src/modules/onboarding/*`
- `apps/asanpay-mobile-app/src/screens/shared/RegisterOutletModal.tsx`
- `apps/asanpay-mobile-app/src/screens/shared/BioKycModal.tsx`

## Still deferred
- Signup wizard Min-KYC fields (Account Register Outlet covers post-login)
- Face-auth path when InstantPay returns `isFaceAuthAvailable`
