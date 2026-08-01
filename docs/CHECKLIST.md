# Project Checklist

> Update jab task complete ho — agent ko poora history padhne ki zaroorat nahi.

## Infrastructure
- [x] Postgres + Mongo local
- [x] Backend :4000
- [x] Admin :3000, Agent web :3001
- [x] Portal login guard
- [x] LOGIN.md + task system
- [ ] VPS live API
- [ ] Production env

## Web
- [x] Admin login + dashboard (basic)
- [x] Agent single login + role dashboard
- [x] Admin full stats dashboard
- [x] KYC queue UI
- [ ] Commission scheme builder (role defaults)
- [x] Per-agent service commission overrides (admin agent detail)
- [x] Wallet page shows Pending balance (Wallet 1 / Wallet 2)

## Mobile
- [x] RN Android shell + login (OTP flow)
- [x] Role-based home screen
- [x] Bottom tab navigation (Retailer 4 tabs, Partner 3 tabs)
- [ ] Service flows (AEPS, DMT, BBPS)
- [ ] Biometric SDK
- [x] Txn PIN modal + wallet transfer PIN
- [x] Wallet screen Pending balance line

## Backend API
- [x] Auth, wallet, catalog, txn stubs
- [x] Txn PIN on wallet transfer
- [x] Wallet `pendingBalance` on `/wallet/me` (from pending/initiated txns)
- [x] AEPS dummy↔live switch (`AEPS_PROVIDER_MODE`) + InstantPay adapter skeleton
- [x] AEPS compliance gates (geofence, bio-mismatch/EDD, dormancy, cash receipt)
- [x] Email verification OTP (`/auth/email/otp/*`) + web Verify UI (KYC, outlet, settings)
- [ ] Fund request approve flow
- [x] SD/D direct-child Active/Inactive (`PATCH /users/:id/active`)
- [x] Admin network tree move (`POST /admin/users/:id/reassign`) + hierarchy rebuild
- [x] Admin removed from `POST /wallet/transfer` (fund mint only)
- [x] Transfer role pair (SD→D, D→R) + inactive target blocked
- [x] Wallet pull/Collect (`/wallet/pull/request` + `/confirm`) child OTP + parent PIN
- [x] Network table: Party + wallets + Top-Up / Receiving / Debit / History icon tooltips (English UI)
- [x] Product UI English-only rule (`.cursor/rules/ui-english-only.mdc`)
- [x] Distributor retailer activity: txn-based Transacted/No Activity + 6-month history; Quick Actions raised; wallet **Reverse** label
- [x] InstantPay Register Outlet = retailer web onboarding (`/onboarding/outlet`); `hasInstantpayOutlet` gate
- [x] Agent flow docs folder [`flow/`](../flow/INDEX.md)
- [ ] KYC CRUD routes
- [ ] Commission payout report
- [ ] InstantPay DMT/BBPS rails + merchant outlet onboarding

## Security (2026-07-17)
- [x] Default MPIN / OTP-in-prod / hardcoded admin seed removed
- [x] JWT `requireAuth` revalidates `isActive` + role from DB
- [x] Txn PIN lockout + AEPS withdraw requires PIN
- [x] Per-user txn idempotency + wallet fund/transfer idempotency
- [x] `apps/login.text` untracked; Dependabot added
- [x] Real logout (revoke all refresh tokens; device trust kept for Welcome-back MPIN); refresh reuse → kill family + devices
- [x] OTP role oracle closed; OTP keyed by mobile; old OTPs invalidated
- [x] txnAuth ticket (PIN not echoed); RD package allowlist; KYC docs + transfer KYC
- [x] Flat commission cap; amount max fail-closed; JWT algorithms pinned
- [x] Double-debit: advisory lock on claim+debit / wallet idempotency; stable client attempt keys (DMT, fund, AEPS wd)
- [x] Recheck-on-initiated race guard (90s grace) — no reverse while submit in-flight
- [x] Pending txn auto-reconcile worker (`TXN_RECONCILE_INTERVAL_MS`)
- [x] Credit settle prefers provider amount; recheck uses stored `txn.walletType`
- [x] Ledger `(reference_type, reference_id)` unique (partial) — migration `0012`
- [ ] Android Keystore for bio refresh token (still AsyncStorage)
- [ ] Cert pinning + httpOnly cookie BFF
- [ ] History purge for any secrets ever pushed to remote

## Last updated
2026-08-01 — Email verify: OTP endpoints + AuthUser email fields + web Verify UI (KYC / outlet / settings)
2026-07-20 — Signup: role select + upline mobile (SD→Admin, Dist→SD, Retailer→Dist)
2026-07-20 — Distributor activity metric (success txns) + monthly history; Quick Actions up; Collect/Debit → Reverse
2026-07-20 — Wallet pull (Wapas): child OTP + parent PIN; `flow/` agent docs; migration `0015_wallet_pull_otp`
2026-07-20 — Signup: `GET /auth/sponsor/:uid` shows Distributor name; retailer maps under that Dist
2026-07-20 — Wallet hierarchy: transfer enforces SD→D / D→R + active target; task doc `wallet-hierarchy.md`
2026-07-20 — Wallet hierarchy gaps: child active toggle (SD/D), admin reassign parent, admin no longer on /wallet/transfer
2026-07-18 — AEPS dummy/sandbox/live provider mode + InstantPay adapter + compliance gates
2026-07-17 — Security hardening: Critical+High remediations (auth, wallet, mobile, web storage, release signing, Dependabot)
2026-07-14 — Wallet pending balance: `GET /api/wallet/me` adds `pendingBalance` per wallet (sum of pending/initiated txns); agent web Wallet + mobile Wallet show Pending
2026-07-14 — Branding: product = AsanPay; npm scopes `@asanpay/*`; folder renamed to `apps/mobile`
2026-07-18 — Pending service icons applied: Cash Deposit, NPS, Education Fees, Municipal Services, Housing Society, Subscription, Landline, Broadband (from Latest-Icons → web public → mobile sync)
2026-07-14 — Empty Retailer txns: migrate 0005 blocked by non-idempotent 0004; seed now funds Wallet 1/2 + logs userId
2026-07-14 — `seed:txns` dummy retailer txns (Wallet 1/2) for agent Transactions page
2026-07-14 — Retailer Wallet 1/2 balances in agent header; txn `wallet_type` column shows which wallet was cut
2026-07-14 — Login MPIN: journaled `0004_login_mpin` so migrate adds `login_mpin_hash` (OTP/MPIN 500s)
2026-07-14 — Per-agent service commission on agent detail + `user_commission_rates`
2026-07-14 — Admin web feature pages (stats, users, KYC, txns, site-control, wallet, passbook)
2026-07-14 — Admin AsanPay-style shell (blue+green); fixed user `admin` / no OTP
