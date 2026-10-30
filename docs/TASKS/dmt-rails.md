# DMT bank rails — Airtel, Jio, Fino (PL-35)

Size: **L** · 1 phase per chat · Surfaces: backend, agent web, mobile, admin

## Phase 1 — done (30 Oct)

- `providers/dmtRails.service.ts` — `DMT_RAILS` (airtel live; jio, fino `live: false`), order + on/off in
  tenant settings `dmtRails`.
- Admin: API Providers → Service rails → **DMT bank rails** card (`/admin/dmt-rails`, move up/down, toggle, reason).
- Agent: `GET /txn/dmt/rails` → rail chips on web `/dmt` and mobile DmtScreen (Coming soon for non-live).

## Phase 2 — Jio DMT (next chat)

- Provider docs: `/tmp/noble/noble.txt` "DMT / JIO DMT" (remitter_login → reg_send_otp → reg_verify_otp →
  register_ekyc → txn_send_otp → txn_verify_submit → txn_status).
- Every DMT request (`/txn/dmt/*` validators) takes `rail` (default `airtel`); controller routes to the rail's
  flow; tokens per rail (`airtelDmt.ts` session store pattern, key includes rail).
- Clients send the selected chip's `rail` with every DMT call; switching rail = fresh remitter search.
- Status check / recon per rail; txn metadata `dmtRail`; receipt shows the bank.
- Flip `live: true` for jio after a live ₹100 test.

## Phase 3 — Fino DMT

- Same pattern: search_customer → customer_limit → customer_ekyc → generate_otp_registration →
  customer_registration → generate_otp_transaction → transfer_transaction → transaction_status.
- Show `customer_limit` on the remitter card.

## Read ONLY

- `apps/backend/src/modules/providers/dmtRails.service.ts`
- `apps/backend/src/modules/providers/adapters/noble.adapter.ts` (DMT section) + `noble/airtelDmt.ts`
- `apps/backend/src/modules/transactions/txn.controller.ts` + `txn.validators.ts` (DMT)
- `apps/agent-portal/app/dmt/page.tsx`, `apps/asanpay-mobile-app/src/screens/retailer/DmtScreen.tsx`
