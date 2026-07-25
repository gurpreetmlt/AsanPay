# 03 — Agent signup (role + upline mobile)

Public Register on agent portal / mobile.

## Roles

| Signup as | Upline mobile | Parent | Child created | After OTP |
|-----------|---------------|--------|---------------|-----------|
| Retailer | Distributor | `distributor` | `retailer` | Active session |
| Distributor | Super Dist | `master_distributor` | `distributor` | Active session |
| Super Distributor | *(none — direct)* | root `admin` (auto) | `master_distributor` | **Inactive** until admin Activates |

Role chip order in UI: **Retailer → Distributor → Super Distributor**.

## Flow

1. Select role (top of form)
2. Name + own mobile
3. **Retailer / Distributor only:** enter upline **10-digit mobile** → auto-resolve via search
4. `POST /api/auth/signup/request` `{ name, mobile, role, portal: "agent", sponsorUid? }`
5. `POST /api/auth/signup/verify` (same + otp)
   - Dist / Retailer → `registerUser(sponsor)` + session
   - Super Dist → `registerUser(admin, { isActive: false })` → `{ pendingApproval: true }` (no tokens)

Lookup: `GET /api/auth/sponsor/search?mobile=XXXXXXXXXX&role=master_distributor|distributor`
(Admin role search still exists for other flows; Super Dist signup does not use it.)

## UI

- Web: [`apps/web/app/signup/page.tsx`](../apps/web/app/signup/page.tsx)
- Mobile: `apps/asanpay-mobile-app/src/screens/signup/SignupScreen.tsx`

## Backend

- [`auth.service.ts`](../apps/backend/src/modules/auth/auth.service.ts) — `requestSignupOtp` / `verifySignupOtp`
- Validators: `sponsorUid` optional when `role === master_distributor`

## After signup

- Retailer → InstantPay Register Outlet (`/onboarding/outlet`) then PIN
- Distributor → PIN only
- Super Dist → wait for admin **Activate** on user detail, then login
