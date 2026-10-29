# Agent controls queue (PL-31)

Admin → agent page (`apps/admin-portal/app/users/[id]/page.tsx`) gets every per-agent control, grouped by tab.
**One phase per chat.** Mark a phase `done` and move `CURRENT` down when it ships.

## Tab layout (target)

| Tab | What lives there |
|-----|------------------|
| Overview | Profile, network parent, recent txns, quick actions (as today) |
| KYC | As today |
| Wallet & bank | Balances, settlement banks, **wallet hold / settlement-only block / manual adjust**, **fund request limits** |
| Commission | Custom commission, **commission payout hold** |
| Services & limits (renamed Controls) | **Service on/off per service**, Night services, Restrict (Soft/Hard/Freeze), **transaction limits**, Move in tree, Reactivate AePS, **Role change / account close** |
| Security (new) | Login email, **logout all devices**, **password / MPIN / transaction PIN reset**, **unlock**, **trusted + biometric devices**, **location reset / exempt / radius** |
| Activity (new) | **Timeline of every admin change** + **admin notes** + **tags** (tags also show as chips in the hero) |

Rules for every phase: reason ≥ 3 chars on each change, audit log row, clear field-level errors,
button colours per `button-color-semantics`, popups per `popup-design`, backend is the source of truth
(agent apps get the clear API message; no UI-only blocks).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Services & limits tab: per-service on/off (AePS, DMT, BBPS, Recharge, CMS, UPI Cash Point) + per-agent transaction limits (per txn / daily / monthly per service) + role change (Retailer ↔ Distributor ↔ SD) + account close | done — 29 Oct (migration `0093`) |
| 2 | Security tab: logout all devices, password / MPIN / TPIN reset, unlock after wrong attempts, trusted + biometric device list with remove, location reset / exempt / custom radius | **CURRENT** |
| 3 | Wallet & Commission: wallet hold (lien) amount, settlement-only block, manual credit/debit with dual approval, fund request max amount + per-day count, commission payout hold | planned |
| 4 | Activity tab: timeline (KYC, restrict, night access, commission, upline, limits, holds…) from audit log + admin notes + tags (VIP / Watchlist / High risk / Sales manager) | planned |

## Phase 1 — notes

- Service on/off: new table `agent_service_blocks (user_id, service_group, reason, created_by, created_at)`;
  guard next to `serviceWindowGuard` (`modules/serviceWindow`) so blocked groups get
  `"<Service> is turned off for your account. Contact support."` Add UPI Cash Point (`/noble/upi-qr/*` start routes).
- Limits: per-agent overrides on top of `modules/limits/moneyLimits.ts` + `velocity.service.ts`
  (`effectiveDailyLimit`). Show platform default next to each field.
- Role change: reuse `users.role`; check upline rules (`ALLOWED_CHILD_ROLES`), wallets, commission shares.
- Account close: reuse `DELETE /admin/users/:id` / deletion-request flow; balance must be zero.
- Agent web + mobile: no new screens; API errors already show.

### Phase 1 — as built

- Module `apps/backend/src/modules/agentControls/` — `agentControls.service.ts` (blocks + limits),
  `agentAccount.service.ts` (role change, close, reopen). Tables `agent_service_blocks`, `agent_txn_limits` (`0093`).
- Blocks: checked in `serviceWindowGuard` (wins over the night window), `serviceBlockGuard("upi_cash_point")`
  on `/noble/upi-qr/load|kyc|generate`, and again in `executeServiceTxn`. 403 `SERVICE_BLOCKED`.
- Limits: per txn checked before the claim; daily / monthly inside the claim tx under
  `agent_limit:<user>:<group>` advisory lock. Per txn can only tighten (≤ service max / DMT ₹25,000).
  DMT daily override replaces `DMT_AGENT_DAILY_LIMIT_RUPEES` for that agent (can raise). Remitter monthly unchanged.
- Role change: needs no downline, no pending txn, no custom commission, nothing on hold, AePS ₹0 when leaving retailer.
  Renames ledger account `RTL_/DIST_/SD_<uid>` (entries use account id, balance carries over), rebuilds closure rows,
  revokes refresh tokens. UID is not reissued.
- Account close = soft close (`users.is_active = false`, refresh tokens revoked); balance ₹0, no downline, no pending txn,
  type UID to confirm. Records kept. Reopen available. Hard delete (`DELETE /admin/users/:id`) untouched.

## Read first

`AGENTS.md`, `apps/backend/src/modules/serviceWindow/serviceWindow.service.ts`,
`apps/backend/src/modules/limits/*`, `apps/backend/src/modules/admin/admin.routes.ts` (users/:id routes),
`apps/admin-portal/app/users/[id]/page.tsx`, `apps/admin-portal/components/users/NightAccessCard.tsx` (UI pattern).
