# DMT bank rails — Airtel, Jio, Fino (PL-35)

Size: **L** · 1 phase per chat · Surfaces: backend, agent web, mobile, admin

## Phase 1 — done (30 Oct)

- `providers/dmtRails.service.ts` — `DMT_RAILS` (airtel live; jio, fino `live: false`), order + on/off in
  tenant settings `dmtRails`.
- Admin: API Providers → Service rails → **DMT bank rails** card (`/admin/dmt-rails`, move up/down, toggle, reason).
- Agent: `GET /txn/dmt/rails` → rail chips on web `/dmt` and mobile DmtScreen (Coming soon for non-live).

## Phase 2 — Jio DMT — built (30 Oct), pilot

- `providers/noble/jioDmt.ts` — remitter_login → reg_send_otp → reg_verify_otp → register_ekyc →
  txn_send_otp → txn_verify_submit → txn_status. Flow state (remittanceUserId, authorizationCode, Aadhaar
  for eKYC, OTP txn id + amount) in the encrypted `provider_sessions` store, key `jio:<user>:<mobile>`.
- Every `/txn/dmt/*` body takes `rail` (default `airtel`); controller checks `assertDmtRailUsable`, adapter
  branches on `params.rail`. Channel: `X-App-Version-Code` header → MOB/ANDROID, else WEB/WINDOWS.
- Jio rules: whole rupees ₹100–₹5,000, IMPS only, transfer must reuse the OTP's id + amount (OTP single-use).
- Beneficiaries: shared `/api/v1.0/bene/*` list (Jio has no bene API; details go into txn_verify_submit).
- Txn metadata `dmtRail`; recheck reads it → Jio `txn_status`. Receipt PDF "Sent via" + ESC/POS "Via".
- Pilot: jio `live: false, pilot: true`; retailers in env `DMT_PILOT_MOBILES` see it live.
- **Left:** live ₹100 test (pilot retailer) → set jio `live: true` in `dmtRails.service.ts`. Provider-report
  recon per rail not built (recheck covers pending txns).

## Phase 3 — Fino DMT

- Same pattern: search_customer → customer_limit → customer_ekyc → generate_otp_registration →
  customer_registration → generate_otp_transaction → transfer_transaction → transaction_status.
- Show `customer_limit` on the remitter card.

## Read ONLY

- `apps/backend/src/modules/providers/dmtRails.service.ts`
- `apps/backend/src/modules/providers/adapters/noble.adapter.ts` (DMT section) + `noble/airtelDmt.ts`
- `apps/backend/src/modules/transactions/txn.controller.ts` + `txn.validators.ts` (DMT)
- `apps/agent-portal/app/dmt/page.tsx`, `apps/asanpay-mobile-app/src/screens/retailer/DmtScreen.tsx`
