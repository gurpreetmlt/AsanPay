# Planning list

Features we have discussed and decided to build, before they become task files.
One row per feature; details in the section below the table. Newest at the top of the table.

**Status flow:** `idea` → `planned` → `design` (Figma in progress) → `ready` (task file written) → `building` → `done`

| # | Feature | Surfaces | Size | Status | Design | Task file |
|---|---------|----------|------|--------|--------|-----------|
| PL-31 | Agent controls — every per-agent control on the admin agent page, by tab: service on/off, limits, role change, account close, security (logout all, PIN reset, unlock, devices, location), wallet hold, fund limits, commission hold, activity timeline, notes, tags | Backend, admin | XL | building — phase 1 of 4 shipped 29 Oct | — | [agent-controls-queue.md](TASKS/agent-controls-queue.md) |
| PL-30 | Agent profile photo — agent sets / changes / removes it in Settings (web) and Account (app); shown in header menu and on the admin agent page (falls back to KYC selfie, then initials) | Backend, agent web, mobile, admin | M | built — 28 Oct (migration 0091 `user_photos`, `/api/account/photo`, `/admin/users/:id/photo`) | — | — |
| PL-29 | Agent custom commission like the rate card — per-slab Flat ₹ / Share % (of provider pays) for one agent, live calc vs default; modern admin agent page with tabs | Backend, admin | L | built — 28 Oct (migration 0090, `/admin/users/:id/commission-slabs`, `AgentRateCard` in agent Commission tab) | — | — |
| PL-28 | Night service window — all services off 12:00 AM–6:00 AM IST by default; admin changes the time / turns it off, and can keep services open for chosen retailers | Backend, admin, web, mobile | M | built — 29 Oct (migration 0092, guard on AePS/DMT/BBPS/recharge/CMS routes, Platform settings card, agent Controls → Night services per service, dashboard banner web + app; tile badges = follow-up) | — | — |
| PL-27 | Simple commission setup — one table: "Company gets" auto-filled per service from the provider sheet (rate + example ₹), then split per role (Retailer / Distributor / SD) as flat ₹ or % of company income, company keeps the rest | Backend, admin | M | building — 28 Oct: slab editing moved to Rate card (per-slab % / ₹ split, migrate `0087`); `/tax-commission/setup` is now a read-only Commission overview (net after TDS per role); "Fill from sheet" lives on Rate card | — | — |
| PL-26 | Invite-only signup — public Sign up removed (web, app, marketing site); Distributor invites Retailer, SD invites Distributor, admin invites SD + Direct Retailer (new admin Invites page); signup OTP needs a valid invite | Backend, web, mobile, admin, marketing | M | building — built 28 Oct (Coolify backend/web/admin/marketing deploy + APK + live test pending) | — | — |
| PL-25 | No password at signup — temporary password emailed when admin approves KYC, forced "Set new password" on first login, mobile OTP to resume KYC | Backend, web, mobile, admin | M | building — built 28 Oct (migrate `0084` + Coolify backend/web/admin deploy + APK + live test pending; needs SMTP env) | — | — |
| PL-24 | Bank account check — BestAPI (free) → pennyless → ₹1 penny drop; DMT payee "Verify name with bank" (agent ₹1.50 / ₹2.50 with penny drop, admin-editable), name match pill, 90-day free re-check; same check for settlement + company banks | Backend, web, mobile, admin | M | building — DMT + admin prices built 27 Oct (migrate `0081` + `0082`); settlement bank + company bank wired 27 Oct (migrate `0083`); deploy, APK, live test pending | — | — |
| PL-23 | Agent settlement bank ₹1 penny drop — bank holder name + PAN name match, real verification ref (replaces stub), cost debited from agent wallet | Backend, web, mobile, admin | M | building — built 27 Oct (migrate `0083` + deploy + APK + live test pending) | — | [settlement-bank-penny-drop.md](TASKS/settlement-bank-penny-drop.md) |
| PL-22 | KYC photo check speed-ups (client resize, smaller OCR image, background check, parallel Aadhaar QR+OCR) | Backend, web, mobile | M | building — built 27 Oct; npm install (mobile resizer) + Coolify backend/web deploy + APK + real `durationMs` review pending | — | — |
| PL-21 | Admin ops speed — agent 360 page (tabs), bulk approve / reject, saved filters, stuck-txn auto status check, owner alerts (WhatsApp / email) | Backend, admin | L | planned (27 Oct) | — | — |
| PL-20 | Reports hub (daily summary, service P&L, agent earnings, provider volume; PDF / Excel / CSV) + guided month-end close | Backend, admin | L | planned (27 Oct) | — | — |
| PL-19 | Admin staff roles (Owner · Finance · Ops · Support) + maker–checker on money actions + admin 2FA / sessions | Backend, admin | L | planned (27 Oct) — next (PL-17 step 2 done) | — | — |
| PL-18 | Signup flow v2 — 8 steps, password on step 1, name from PAN, photo uploads locked until details filled, shop (15 km) + home (5 km) location | Backend, web, mobile | L | building — Part 1 built 27 Oct; Part 2 (shop + home location, phone-camera QR, 15 km / 5 km geofence, risk flags) built 27 Oct — migrate `0080` + npm install + APK + live test pending; admin Location limits (radius + on/off) built 27 Oct; Part 3 (merge last steps) next | — | [signup-flow-v2.md](TASKS/signup-flow-v2.md) |
| PL-17 | Admin cleanup — separate Commission / Tax / Support & Risk / Platform settings sidebar, one home per setting, action-first dashboard | Admin | L | building — step 1 (sidebar split) + regroup A + step 3 (dashboard) + step 2 (one home per setting) built 27 Oct; tab hubs (B), step 4 next | — | — |
| PL-16 | Production Postgres on AWS RDS (Mumbai) + separate production EC2 | Infra | L | building — 27 Oct: prod EC2 `asanpay-production` launched (t4g.large, Ubuntu 26.04 arm64, 50 GB gp3 encrypted, IMDSv2, termination protection, SG `asanpay-prod-ec2-sg`: SSH + 8000 from owner IP, 80/443 open, AZ ap-south-1b). Next: Elastic IP → RDS PostgreSQL 18 (db.t4g.micro, private, encrypted, same AZ, SG from EC2 SG only) → Coolify on prod EC2 → pg_dump/restore (93 MB) → deploy apps → DNS. Later: CloudTrail, GuardDuty, budget alert | — | — |
| PL-15 | Admin "Services" setup page — one page per service (status · provider · limits · customer fee · commission · preview) | Backend, admin | L | idea (27 Oct) — after PL-14 | — | — |
| PL-14 | Commission rate card + share % (one screen, live preview, safety, Advanced tab) + agent-page Commission card | Backend, admin | L | building — RC1 live 27 Oct (migrated, 65 services × 60/10/5); RC2 built 27 Oct (Rate card screen + editable GST/TDS + Suggested chips, migration 0079 — deploy pending); RC3 / RC6 next | — | [commission-rate-card.md](TASKS/commission-rate-card.md) |
| PL-13 | Daily 2FA redesign — Aadhaar-style card view (masked number, photo, status) + fingerprint / face verify | Web, mobile | L | building — D1 web done 27 Oct, D2 mobile next | [Figma prompt](PROMPTS/figma-daily-2fa.md) · owner screens in task file | [daily-2fa-redesign.md](TASKS/daily-2fa-redesign.md) |
| PL-12 | OCR model upgrade — PP-OCRv5 detection + PP-OCRv5 English recognition (test against today's v4) | Backend | S | building (built 27 Oct: v5 mobile det + v5 English rec default, `KYC_OCR_PADDLE_MODEL=v4` rollback; deploy + real-photo test pending) | — | — |
| PL-11 | Card auto-crop + straighten (fix tilt / sideways / upside down), shown in the preview with "Adjust crop" (manual) | Backend, web, mobile | M | building (built 27 Oct; npm install + deploy + APK + real-photo test pending) | — | — |
| PL-10 | DigiLocker KYC — fetch signed Aadhaar + PAN with agent consent (replaces photo OCR as primary proof) | Backend, web, mobile, admin | L | planned — long term, after PL-06 | — | — |
| PL-09 | Father's name match — PAN card vs Aadhaar back "S/O" vs form | Backend, web, mobile, admin | S | planned — next (with PL-11, PL-12) | — | — |
| PL-08 | PAN–Aadhaar link status check (provider API) as a cross-check status | Backend, web, mobile, admin | S | planned — do first (with PL-09) | — | — |
| PL-07 | KYC verification statuses (PAN no · PAN photo · Aadhaar OTP · Aadhaar photo · PAN↔Aadhaar · overall) + admin review screen | Backend, web, mobile, admin | L | building (backend done 27 Oct; UI = Chat 2) | — | [kyc-verification-statuses.md](TASKS/kyc-verification-statuses.md) |
| PL-06 | KYC face match (selfie vs card photo) + original vs xerox / screen photo / edited image | Backend, web, mobile, admin | L | planned — next after PL-08 + PL-09 (needs Indian KYC vendor) | — | — |
| PL-05 | KYC document photo checks, in-house (Aadhaar QR verify, quality, doc type, PAN / Aadhaar data match) | Backend, web, mobile, admin | L | done (26 Oct) — engine, web/mobile UX, admin labels + Flagged photos filter; device smoke pending | — | [kyc-doc-checks.md](TASKS/kyc-doc-checks.md) |
| PL-04 | Terms, Privacy & EULA acceptance checkbox at login (per-version record) | Backend, web, mobile | M | building (built 26 Oct, migrate `0075` + APK + live test pending) | — | — |
| PL-03 | Web location via phone QR (AEPS + onboarding) | Backend, web, mobile | M | building (built 26 Oct, migrate `0074` + APK + live test pending) | — | — |
| PL-02 | Cash Management page (CMS provider cards, in-app CMS, CMS transactions) | Backend, web, mobile | M | building (built 26 Oct, live test pending) | — | — |
| PL-01 | Linked accounts + role switch (same person, Distributor + Retailer) | Backend, web, mobile, admin | M | building (backend + web + mobile built 26 Oct; migrate `0076` + APK + live test pending; admin card next) | [Figma prompt](PROMPTS/figma-linked-accounts.md) · Figma URL pending | [linked-accounts.md](TASKS/linked-accounts.md) |

---

## PL-31 — Agent controls (all per-agent levers on the agent page)

**Problem:** Admin can only restrict (Soft/Hard/Freeze), move upline, reactivate AePS and open night services. Support and risk need finer levers per agent.

**Plan** (tab → controls; build order in the task file)
- Services & limits (renamed Controls): per-service on/off, per-agent transaction limits, role change, account close (+ existing restrict, night services, move, AePS reactivate).
- Security (new tab): logout all devices, password / MPIN / TPIN reset, unlock, trusted + biometric devices, location reset / exempt / radius.
- Wallet & bank: wallet hold (lien), settlement-only block, manual credit/debit (dual approval), fund request limits.
- Commission: payout hold.
- Activity (new tab): admin-change timeline, notes, tags (tags also in the hero).

**Open decisions**
- [ ] Manual credit/debit threshold for dual approval (reuse fund-request dual limit?)
- [ ] Who sees tags — admin only (recommended)

**Notes:** Owner asked for all 10 on 29 Oct. One phase per chat.

## PL-30 — Agent profile photo

**Problem:** Admin agent page and agent menus only showed initials; the KYC selfie is the only photo and agents cannot change it.

**Plan**
- `user_photos` table (one row per user, base64 ≤ 600 KB, JPG/PNG/WebP) — kept out of `users` so lists stay light.
- `GET/PUT/DELETE /api/account/photo` for the signed-in agent; `GET /api/admin/users/:id/photo` (bytes) for admin.
- Agent web: Settings → Profile photo editor (Add / Change / Remove, square 512 px crop in the browser); header account menu avatar.
- Mobile: Account banner avatar → popup (gallery, front-camera selfie, remove).
- Admin agent page hero + network tree: profile photo → KYC personal photo → initials.

**Open decisions**
- [ ] Show the photo in the agent list / downline lists too?

**Notes:** Photo is not part of KYC; KYC approval still uses the KYC selfie.

## PL-29 — Agent custom commission (per slab, like the rate card)

**Problem:** Admin → agent page → "Service Commission" sets one rate per service, and its % means % of the
txn amount (₹2,000 × 1% = ₹20 while the provider pays ₹9.30) — easy to lose money. No slabs, no live calc,
no view of the default it replaces. The agent page is a long single scroll.

**Plan:**
- Backend: `user_commission_rates` gains slab bounds (`min_amount`, `max_amount`) and a share mode
  (`share_percent` of provider income, or flat ₹) — unique key becomes user + service + slab (migration).
  `findActiveOverride` becomes amount-aware (narrowest slab wins, like `pickShare`); `resolveRoleGross`
  pays a share override as % of provider income. Old % -of-amount overrides keep working until edited.
- Admin agent page: header card (avatar, status chips, 4 stats) + tabs Overview · KYC · Commission · Wallet · Activity.
- Commission tab: rate-card style table (category bands, Default / Custom badge per service); open a service →
  slab rows with Default vs This agent; ✎ popup with Flat ₹ / Share %, live Gross / TDS / Net / Company keeps,
  "+₹x to agent, company keeps ₹y less", red warning on loss, optional Valid until, Copy default / Reset.
- Tests for the override resolution (slab pick, share vs flat, expiry).

**Decisions (28 Oct):**
- [x] % = share of what the provider pays (plus Flat ₹), same as the rate card
- [x] Slab-wise, like the rate card
- [x] Build in a new chat (L, money logic)

---

## PL-28 — Night service window

**Problem:** Owner wants every service closed at night (default 12:00 AM – 6:00 AM IST), with the
time editable from Admin and a way to keep services open for specific retailers.

**Plan:**
- Admin → Platform settings: **Night service window** — on/off, start time, end time (IST; window
  may cross midnight). Saved in the DB, applied without a redeploy.
- Backend guard on every service txn start (AePS, DMT, recharge, BBPS, CMS, etc.): inside the window →
  clear error `Services are closed from 12:00 AM to 6:00 AM. Try again after 6:00 AM.` (times from config).
  Server time only — never trust the device clock.
- Admin → agent page: **Allow services at night** toggle per retailer (exception list), audited.
- Agent web + mobile: service tiles stay visible with a "Opens at 6:00 AM" badge during the window;
  tap → same message. Dashboard banner while closed.

**Open decisions:**
- [x] Only service txns close (AePS, DMT, recharge, BBPS, CMS); wallet transfer / fund request / settlement stay open (28 Oct)
- [x] Applies to all agents — Retailer, Distributor, SD (28 Oct)
- [x] Exception per agent: both — "Always open" toggle, or "Open until" a date/time that ends by itself (28 Oct)
- [x] Txns already in progress at the start time: let them finish — guard only runs when a txn starts (29 Oct)
- [x] Emergency access per service group (AePS, DMT, BBPS, recharge, CMS), not one switch for all (29 Oct)

**Notes:** Touches money rails — backend check is the source of truth; UI badge is only a hint.

---

## PL-27 — Simple commission setup (auto-filled income, then split)

**Problem:** Admin commission is hard to follow. The rate card mixes four boxes per service
(Provider pays · Customer fee · Share of provider income · Tax), and two payout systems run side by
side: % shares of provider income, and old fixed ₹ / % rules (Schemes) that pay whenever provider
income is not saved. Provider income is not filled automatically — the admin must open each service
and tap "Suggested". The Commission menu has seven entries.

**What already exists (reuse, no new tables):**
- `provider_payout_rules` — what the provider pays us per service / slab.
- `commission_shares` — % of that income per role; company keeps the rest.
- `rateCard.reference.ts` — provider sheet numbers per service (today only a "Suggested" button).
- `commission_rules` (fixed) + `user_commission_rates` (per-agent override).

**Plan:**
- New first screen **Commission setup**: one row per service (and per provider slab) — **Company gets**
  shown as rate + example ₹ (e.g. `0.3% → ₹6 on ₹2,000`) · Retailer · Distributor · Super Distributor ·
  Company keeps (auto).
- Each role's split is **Flat ₹ per txn** or **% of what the company gets** (not % of txn amount).
  Live check: Company keeps = Company gets − all role amounts; red warning when it goes below ₹0.
- No backend change / migration: % = `commission_shares` row, flat ₹ = flat `commission_rules` row
  (no slab). Payout already resolves per role: agent override → share → fixed rule. Switching a role
  ends the other kind (share deleted / old rules get `effective_to`), so nothing pays silently.
- Built 28 Oct: admin `/tax-commission/setup` (`components/commission/setup/CommissionSetupScreen.tsx`),
  first item in the Commission menu; `/tax-commission`, `/commission`, `/commissions` redirect there.
- **Fill from provider sheet** — one button fills "We get" for every service that has sheet numbers
  (review screen, then Save). Services with unknown rates show `Ask provider`.
- **Default split** — one set of % (e.g. Retailer 60 · Distributor 10 · SD 5) applied to all services in
  one click; a service can override it.
- Shares become the only normal mode; fixed rules move under Advanced.
- Customer fee and Tax leave this editor (they keep their own pages).
- Commission menu: Commission setup · Agent custom rates · Payouts · More (Commission check, Rate
  history, Schemes).

**Open decisions:**
- [ ] Default split per role (flat ₹ or %) — owner will give custom numbers
- [x] % split = % of what the company gets; role can be flat ₹ instead (28 Oct)
- [x] Company gets shown as rate + example ₹ (28 Oct)
- [x] Retailer with no Distributor / SD above → missing role's share stays with the company (28 Oct)
- [x] Every service switches to shares; fixed rules only under Advanced, not a silent fallback (28 Oct)
- [ ] Provider API commission (Vyapar payloads in `provider_commission_ingest`) — later auto-update of "We get"

**Notes:** Admin-only — no agent web / mobile UI change.

---

## PL-25 — No password at signup (emailed after KYC approval)

**Problem:** Step 1 asks for a password before the agent is verified. The owner wants login credentials
issued only after documents are checked and KYC is approved.

**Plan (owner choices, 28 Oct):**
- Step 1 = mobile + terms + OTP only; remove the password field (web + mobile).
- Account is created with no usable password; resume KYC mid-way with **mobile OTP** login (pending-KYC users only).
- Email is verified on the Contact step, so it exists by approval time.
- Admin approves KYC → backend generates a temporary password and **emails it** (email only, no SMS).
- Temporary password expires (e.g. 48 h); stored hashed; flag `mustChangePassword`.
- First login with it → forced **Set new password** screen (web + mobile) before the dashboard; MPIN setup after, if the app needs it.
- Admin: **Resend login email** button (new temp password, old one invalidated).
- Existing agents: no change.

**Decisions (28 Oct):**
- [x] Temp password valid 48 h
- [x] Email fails → admin agent page shows "Email failed" + reason + Resend login email
- [x] Rejected KYC → no email; agent re-submits after mobile OTP login

**Built (28 Oct):** `users.must_change_password` / `temp_password_expires_at` / `login_email_*` (migration `0084`);
temp password emailed in `decideKyc` (`loginCredentials.service.ts`); `POST /auth/password/initial`;
`requireAuth` allows only `/api/auth/me`, `/password/initial`, `/logout` until the password is set
(`PASSWORD_CHANGE_REQUIRED`); `POST /admin/users/:id/login-email/resend`; web `/set-password`, mobile
`SetPasswordGate`; signup password field removed on web + mobile.

**Notes:** Temp password in email is weaker than a one-time set-password link; forced change on first
login + short expiry limit the risk. Never log the temp password.

---

## PL-24 — DMT payee bank name check

**Problem:** A DMT payee is saved with whatever name the agent types; IMPS pays by account + IFSC only,
so a wrong account number sends money to the wrong person.

**Plan / built (27 Oct)**
- Shared `verifyBankAccount` chain: BestAPI account verify (free; its mode is "PD") → provider pennyless (₹0.80)
  → provider ₹1 penny drop (₹1.80). Stops at the first name; stops at once when BestAPI says the account is
  invalid / closed. Every hit logged with its cost in `bank_name_checks` (status, cost, purpose).
- DMT payee: optional "Verify name with bank" (web + mobile). Agent pays once, only on a confirmed name:
  ₹1.50 (BestAPI or pennyless) / ₹2.50 (penny drop) — admin Platform settings → Bank check prices (min = provider
  cost). Charge = one debit txn (`BANK_NAME_CHECK` / `BANK_PENNY_DROP`, ledger `VERIFICATION`): provider cost →
  float, rest → income (GST carved out).
- "Name as per bank" + match pill (green ≥ 80 %, amber 50–79 %, red below) + "Use bank name"; 90-day free re-check.
- Next (task file `TASKS/settlement-bank-penny-drop.md`): agent bank (signup step + settlement bank) runs
  BestAPI only (free, warn only); admin can run pennyless / ₹1 penny drop from KYC review / Agent bank accounts,
  charged to the agent's wallet at Bank check prices, company pays when the wallet is too low (owner, 27 Oct).
  Company bank accounts: full chain, company pays.

**Open decisions**
- [ ] Make the DMT check mandatory later (owner chose optional, 27 Oct)?
- [ ] Final penny-drop price (₹2.50 for now).

## PL-23 — Agent settlement bank ₹1 penny drop

**Problem:** The bank account an agent's settlement payouts go to is never confirmed with the bank — admin
approves it with a stub reference (`PENNYDROP-STUB-…`), so a wrong or someone else's account can get paid.

**Plan** (details in `docs/TASKS/settlement-bank-penny-drop.md`)
- On "Add bank" (web + mobile): provider ₹1 penny drop → bank holder name, match with PAN name, real ref saved.
- Admin "Agent bank accounts": bank name + match pill + penny status; stub removed; "Re-check with bank".
- Cost (₹1.80 penny drop / ₹0.80 pennyless) debited from the agent's wallet (owner, 27 Oct).

**Open decisions**
- [x] Strong match → auto-verify, or admin approves every bank? Admin approves every bank (27 Oct).
- [x] Match threshold (same as DMT); no charge on "Failed"; shared chain BestAPI → pennyless → penny drop at the
  DMT check price (27 Oct).

**Notes:** Automatic payout (send settlement to the agent's bank by API) is not in the provider API list we
have — ask the provider; payouts stay manual with UTR until then.

## PL-22 — KYC photo check speed-ups

**Problem:** PAN / Aadhaar photo upload + check on signup steps 3–4 feels slow (large uploads, OCR on
1600 px images, Aadhaar QR scan before OCR, card box blocked while the check runs).

**Plan**
- Client: photos shrunk to ≤ 1600 px long side, JPEG 0.8 (~200–350 KB) — web canvas, mobile gallery
  crop-picker + camera via `@bam.tech/react-native-image-resizer` (EXIF applied).
- Server: OCR, card alignment and auto-crop detection read a ≤ 1280 px copy; quality check (600 px rule)
  and Aadhaar QR keep the received image; auto-crop still cuts from the received photo. OpenCV warmed
  at boot (PaddleOCR + Tesseract already were).
- Aadhaar: QR scan and OCR start together; a signed QR is used as before and the OCR stops early.
- UX: photo shows at once with a "Checking…" pill; Continue during a check waits ("Checking photo…")
  then continues or shows the result.
- Log `KYC doc check` now carries `cropMs` / `qualityMs` / `qrMs` / `ocrMs` next to `durationMs`.

**Open decisions**
- [ ] Review real `durationMs` + phase timings after deploy before anything heavier.
- [ ] Deferred: on-device OCR (ML Kit) on mobile; separate OCR server.

**Notes:** ML Kit on-device OCR and a separate OCR server stay deferred until real `durationMs` numbers
are reviewed. Planned as PL-19 in chat — PL-19 was already taken (admin staff roles), so this is PL-22.

## PL-18 — Signup flow v2

**Problem:** Name was typed before the PAN fetched the real one; password sat on the role step; photo
uploads ran before the details they are checked against; 9 steps; services blocked when the agent works
from home.

**Plan** (details in `docs/TASKS/signup-flow-v2.md`)
1. ✅ Part 1: password on step 1, role step alone, PAN step order PAN → Name (auto) → DOB → Gender →
   Father name → photo, anniversary out, uploads locked until fields are filled.
2. ✅ Part 2 (built 27 Oct): shop location (step 6) + home location (step 5) — mobile Fetch button, web
   phone-camera QR to a public page (no app / login); geofence 15 km from shop or 5 km from home where the
   gate already runs (AePS, Aadhaar Pay, DMT); risk flags (shop far from pincode, possible VPN, rooted phone).
   Pending: migrate `0080`, npm install, APK, live test; admin KYC map of both pins.
   ✅ Admin → Platform settings → Location limits (27 Oct): shop radius 1–50 km, home radius 1–20 km, location
   check on/off (off = emergency, red confirm). Stored in `tenants.settings.geofence`; admin value → env → 15 / 5.
   Applies within ~30 s, audit `admin.geofence_settings_update`. Admin only — no agent web / mobile change.
3. Part 3: merge Photos + Agreement → 8 steps.

**Open decisions**
- [ ] Aadhaar OTP address / DOB vs typed values: compare silently and flag for admin review, or skip?
- [ ] Web live photos (step 8): phone QR or webcam?

## PL-21 — Admin ops speed

**Problem:** Support jumps between 5–6 pages for one agent; queues are approved one by one; stuck txns need
manual provider checks; owner learns about outages late.

**Plan**
- Agent 360 page: wallet · txns · KYC · commission · linked accounts · tickets · disputes as tabs.
- Bulk approve / reject on KYC and fund requests (reason once, per-row result list); export selection.
- Saved filters on Transactions and queues ("Failed AePS today", "Pending > 2h").
- Stuck txns: auto status check with the provider every few minutes; one-click refund / resolve with reason.
- Owner alerts (WhatsApp / email): provider down, low float, failure spike, service losing money.

## PL-20 — Reports hub + month-end close

**Plan**
- `/reports`: daily summary, service-wise P&L, agent earnings, provider volume — each with Export (PDF → Excel → CSV).
- Month-end close checklist: recon → commission check → tax registers → CA pack → month lock, with status per step.

## PL-19 — Admin staff roles + maker–checker

**Problem:** Every admin can do everything (rates, treasury, agent blocks). One login mistake or leak = full access.

**Plan**
- Staff roles: Owner · Finance · Ops · Support; nav + API gated per role (server-side, like agent roles).
- Maker–checker: fund approvals above a limit, wallet / recon adjustments, rate-card saves, agent blocks need a
  second admin's approval (pending queue on the dashboard).
- Admin login 2FA, session list with "Log out other devices", optional IP allow-list.

**Open decisions**
- [ ] Approval limit for fund requests (₹) that needs a second admin.
- [ ] Is the owner allowed to self-approve when no second admin is online?

## PL-17 — Admin cleanup (Commission / Tax split, one home per setting, dashboard)

**Problem:** The same thing is set or shown in 2–3 places: customer fee (Platform Control → Service charges
and Rate card), tax (old Tax settings page edits in place, no audit; Rate card versioned), commission preview
(What-if uses old fixed-rule math; Rate card uses live payout math), losses (Underwater with a hand-typed
provider pool; Rate card "Company loses"). Three pages are called "Recon". Platform Control mixes settings with
ops queues. Dashboard repeats sidebar links and shows no "needs action" or margin numbers.

**Plan**
1. ✅ Sidebar split: **Commission** (Rate card · Customer fees · Agent custom rates · Payouts · Underwater ·
   Commission check · Rate history · Schemes · What-if), **Tax** (Tax settings · Tax registers · PAN gaps ·
   CA pack · Month lock), **Support & Risk** (queues), **Platform settings**. URLs unchanged; Overview →
   Rate card; clearer names (Agent bank accounts, Commission check, Rate history). Replaces RC4 navigation.
   ✅ Regroup A (owner, 27 Oct — same pattern as Treasury & Balance): three headings **Daily work** (Dashboard ·
   Agents · Transactions [All · Stuck & recovery · Disputes] · Support [Tickets · WhatsApp · Device repairs ·
   Risk alerts · Support contacts]), **Money** (Treasury & Balance · Commission · Tax), **Setup** (Services
   [Services & badges · Providers & routing] · Agent messages [Promotions · Announcements] · System [Audit log ·
   Safety]). Platform Control / Developer Options groups removed; URLs unchanged.
   Next (B): tabbed hubs — Agents role tabs, Commission "Checks & history" + "Advanced", Tax "Registers & CA pack".
2. ✅ (built 27 Oct) One home per setting: tax editing only under Tax → Tax settings (default card + per-service
   table with edit popup, `POST/DELETE /admin/rate-card/tax`, reason + Rate audit); Rate card shows default and
   per-service tax read-only with "Edit in Tax" (deep link `?service=<id>`). Customer fees page saves through
   `/admin/rate-card/customer-fee` (Add / Edit / End, reason + Rate audit; Live / Scheduled / Ended filter).
   Old unversioned writes (`POST/PATCH/DELETE /admin/service-charges`, `PATCH /admin/commission/tax-config/:id`)
   now return 410. What-if → redirects to Rate card (preview); Underwater → Rate card "Loss & missing" view
   (`?view=loss`, also the dashboard loss / ₹0 tiles). KYC queue alert badge fixed (body rendered inside the shell).
3. ✅ (built 27 Oct — `GET /admin/dashboard`, real DB / Redis health; KYC page has the same alerts-outside-shell bug,
   fix in step 2) Dashboard: "Needs action" strip (fund requests, KYC, disputes, tickets, stuck txns, low provider balance,
   missing commission, loss-making services), Money today (volume, fee income, commission paid, GST, company
   keeps vs yesterday), Provider health; drop quick links that repeat the sidebar.
4. Fixed ₹ / % rule editing inside the Rate card; Schemes stays as Advanced.

**Decisions**
- [x] Tax editing moves out of the Rate card into Tax → Tax settings (owner, 27 Oct) — done in step 2.
- [ ] Step 3 metrics: confirm the "company keeps" definition for the dashboard (same as Rate card).

## PL-16 — Production RDS + EC2

**Problem:** Prod Postgres is on Neon with an undocumented region (compliance gap G14 wants DB,
backups and logs in India). Owner asked about a production RDS DB and EC2.

**Plan**
- RDS Postgres in `ap-south-1`, private subnet, automated backups; only the EC2 security group can connect.
- Maintenance window: `pg_dump` from Neon → restore to RDS → compare row counts + ledger totals.
- Switch `DATABASE_URL` in Coolify, redeploy backend; keep Neon read-only a few days for rollback.
- New EC2 only if the current one is too small or prod must be split from test.

**Open decisions**
- [ ] Main reason: India data residency, separate prod from test, or performance?
- [ ] Keep the current EC2 (point it at RDS) or add a new production EC2?

## PL-15 — Admin "Services" setup page

**Problem:** Launching or changing one service touches 4–5 places: Service Badges (on / off),
Developer Options → Providers (route), Service charges (customer fee), Tax & Commission (commission),
and limits. A wrong provider in one place silently breaks another (e.g. ₹0 commission).

**Plan**
- `/services` list → one page per service with tabs: Status & badge · Provider route · Limits ·
  Customer fee · Commission (PL-14 rate-card row) · Preview (₹ example end to end).
- Existing pages stay as shortcuts; this page edits the same data.

**Open decisions**
- [ ] Build after PL-14, or merge into PL-14 RC4?

## PL-14 — Commission rate card + share %

**Problem:** One rule per service × provider × role × slab, wrong provider = silent ₹0, margin only on
a separate page, customer fee on another page.

**Plan** — see [commission-rate-card.md](TASKS/commission-rate-card.md) (RC1 backend → RC2 screen →
RC3 safety → RC4 navigation → RC5 agent Commission card → RC6 per-agent service on / off).

**Owner note (27 Oct):** admin must always be able to (a) fix one agent's commission and (b) turn off
one service for one agent without blocking the others. (a) exists (`user_commission_rates`, redesigned
in RC5); (b) is new — RC6.

**Open decisions**
- [x] Provider income source → new `provider_payout_rules` (no 33A table existed).
- [x] Default role shares → Retailer 60 % · Distributor 10 % · SD 5 %.
- [x] Customer fee inside the rate-card row → yes (read from `service_charges`).

## PL-13 — Daily 2FA redesign (Aadhaar card view)

**Problem:** The daily AePS verification screen is a plain form. The agent should feel they are
verifying their own Aadhaar: show an Aadhaar-style card (photo, name, role, masked number
XXXX XXXX 1234, today's status) and verify from it.

**Plan**
- Figma: [figma-daily-2fa.md](PROMPTS/figma-daily-2fa.md). 8 states (idle, no device, scanning,
  verifying, success, failed, already verified, no Aadhaar in KYC), web + mobile.
- One shared component for AePS, Aadhaar Pay and DMT daily verification. Only the title, consent and
  CTA copy change.
- Data already exists: Aadhaar last 4 from KYC, agent photo from the KYC submission, 2FA status from
  the daily auth check.

**Open decisions**
- [x] Show the KYC selfie on the card, or initials only? — KYC personal photo when on file, initials fallback.
- [x] Face tile on web: hide it, or show as "Android app only"? — shown as "Android app only".

**Notes:** No official UIDAI logo or national emblem. Use a neutral placeholder emblem.
D1 (web) shipped as `apps/agent-portal/components/aeps/DailyVerifyCard.tsx`, used by `/aeps` (AePS + Aadhaar Pay
tab) and `/dmt`. D2 = mobile `components/DailyVerifyCard.tsx`.

## PL-12 — OCR model upgrade (PP-OCRv5)

**Problem:** Today's PaddleOCR is PP-OCRv4 mobile (Chinese + English dictionary). Newer v5 models
find text boxes better on busy card backgrounds.

**Plan**
- Detection: PP-OCRv5 (mobile 4.8 MB, or server 88 MB if it clearly reads more on our photos).
- Recognition: PP-OCRv5 **English** model (7.5 MB, ~85 % English accuracy). Not the v5 "server"
  recognizer — it is ~65 % on English, ~2.5× slower on CPU, ~4 GB peak RAM.
- ONNX files (Apache-2.0) downloaded at Docker build with a pinned checksum, not committed to git.
- Test set: 20–30 real PAN / Aadhaar photos (good, tilted, glare, someone else's). Compare v4 vs
  v5 on fields read + time; ship only if v5 is better and stays inside the 12 s check budget.
- Keep v4 as a switch (`KYC_OCR_PADDLE_MODEL=v4|v5`) for quick rollback. Tesseract stays as backup.

**Built (27 Oct):** v5 mobile detection + v5 English recognition, vendored in `apps/backend/assets/ocr/pp-ocrv5`.
On the owner's PAN screenshot v5 server detection read slightly more but took 3–13 s (over the 12 s
budget) — not used. Upside-down / sideways / tilted / small-on-table variants all read PAN no + DOB +
name once PL-11 alignment runs.

**Open decisions**
- [ ] Confirm on 20–30 real photos after deploy.
- [ ] Owner provides the test photos (masked / consented).

## PL-11 — Card auto-crop + straighten

**Problem:** Hand-held photos are tilted, rotated or show a table / hand around the card. OCR and the
Aadhaar QR scanner both read worse with background and perspective.

**Built (27 Oct):** `docCheck/cardAlign.ts` — uses PaddleOCR text boxes (no extra library): sideways →
try 90° / 270°, weak read → try 180°, crop to text area + 6 % margin when it is < 70 % of the photo,
de-tilt ≥ 1.5°. Max 4 Paddle passes.
**Shown to the agent (27 Oct, owner choice):** pick photo → `POST /api/kyc/documents/auto-crop`
(`docCheck/cardCrop.ts`: upright → card outline via OpenCV edges + perspective flatten → else
card-shaped box around the text). **One call (27 Oct):** `POST /kyc/documents/check` with
`autoCrop: true` crops, checks the crop and returns `croppedDataUrl` + `cardDetected`; no review popup.
No card found and not a pass → manual crop opens. Paddle passes run one at a time (2 vCPU server),
check cap 20 s. Web + mobile.
**Upload box (27 Oct):** `KycCardUpload` (web `components/signup`, mobile `components`) — one big
card-shaped box per photo: empty (Choose photo / drag & drop · mobile Camera + Gallery) → scan-line
loading inside the box (Cropping → Reading → Checking) → photo + crop icon + status badge + Change /
Remove → red retake on fail; checks collapse to "All N checks passed" + Details. Mobile camera =
`CardCameraModal` (vision-camera, ID-card frame, ~2 MP). File-name row removed.

**Plan**
- Find the card's 4 corners (edge / contour detection), warp to a flat card (ID card ratio 1.586:1),
  drop the background.
- No clear edges → crop to the area around detected text; still nothing → use the original photo
  (never worse than today).
- Fix sideways / upside-down cards (orientation model, ~7 MB, or try 0 / 90 / 180 / 270° and keep the
  best text score).
- Crop is used for checks only; the original photo is what we store and admin sees.

**Open decisions**
- [ ] Also show the cropped card to admin in PL-07 review?
- [ ] Later: same edge detection live in the app camera (auto-capture when the card is sharp).

## PL-10 — DigiLocker KYC

**Problem:** Photo OCR can misread, and a clear photo of someone else's card still needs rules to
catch. DigiLocker gives issuer-signed Aadhaar (masked) and PAN with the agent's consent.

**Plan**
- Agent taps "Verify with DigiLocker" → DigiLocker login + consent → we fetch signed Aadhaar / PAN,
  verify the issuer signature, fill name / DOB / gender / address.
- Photo upload stays as fallback when the agent has no DigiLocker account.
- Statuses feed PL-07 (`aadhaar_otp` / `pan_number` verified from DigiLocker).

**Open decisions**
- [ ] Direct requester onboarding with NeGD (no per-fetch fee published; 4–8 weeks approval, CERT-In
      audit, own integration) vs a KYC vendor that already offers it (~₹2–5 per fetch, live in days).
      Ask BestAPI first.
- [ ] Keep Aadhaar OTP as well, or DigiLocker replaces it.

## PL-09 — Father's name match

**Problem:** Name + DOB are the only person checks. Father's name is printed on the PAN card, on the
Aadhaar back ("S/O …", older cards) and typed in the form — a cheap third independent check.

**Plan**
- Read father's name from the PAN photo (line after "Father's Name") and the Aadhaar back address ("S/O", "D/O", "W/O", "C/O").
- Prefer the "care of" from the Aadhaar Secure QR / Aadhaar OTP eKYC when present (UIDAI data, no OCR error).
- Fuzzy match against the form value (same name rules as today). Mismatch = amber, never red on its own.
- Show in PL-07 admin review next to name / DOB.

**Open decisions**
- [ ] New PAN cards print "Father's Name" / "Mother's Name" by choice — skip when the card shows mother's name.

## PL-08 — PAN–Aadhaar link status check

**Problem:** Name / DOB fuzzy matching is the only proof that the PAN and Aadhaar belong to the same
person. The Income Tax "PAN–Aadhaar link status" answers that directly.

**Plan**
- After PAN verify + Aadhaar OTP: call the provider's PAN–Aadhaar link status API (check BestAPI first).
- Linked → PL-07 `cross_check` verified · not linked → manual_review (many valid agents never linked) · linked to another Aadhaar → failed.
- Store the provider reference id; never store the full Aadhaar number.

**Open decisions**
- [ ] Does BestAPI offer it, and at what per-call cost?
- [ ] Should "not linked" block signup or only go to admin review? (default: admin review)

## PL-07 — KYC verification statuses + admin review

**Problem:** Photo checks give one pass / flag / fail per photo. Owner's spec (27 Oct) asks for a
separate status per check category plus an overall status, and an admin screen to review amber cases.

**Plan** — see [kyc-verification-statuses.md](TASKS/kyc-verification-statuses.md).
- Statuses PENDING · VERIFIED · FAILED · RETRY_REQUIRED · MANUAL_REVIEW for PAN number, PAN photo,
  Aadhaar OTP, Aadhaar photo, PAN↔Aadhaar cross-check, overall — stored on the server (new table).
- Admin side-by-side review (photo · entered · verified · mismatched fields) → approve / reject with reason.
- Audit: provider reference ids, status history.

**Not in scope (owner, 27 Oct):** tamper detection and duplicate detection — one person can hold
Super Distributor, Distributor and Retailer accounts.

**Open decisions**
- [ ] Retention period for Aadhaar / PAN photos after approval.

## PL-06 — KYC face match + original-vs-copy detection

**Problem:** PL-05 proves the photo is the right document with the right data, but not that the person uploading is the card holder, or that the photo is of the original card (not a xerox, a phone-screen photo or an edited image).

**Plan**
- Face match: live selfie (`personalPhoto`) vs card photo (Aadhaar QR photo from PL-05, or PAN photo) → match score.
- Tamper / liveness: detect photocopy, screen recapture, edited image.
- Via an Indian KYC vendor (data stays in India — UIDAI / DPDPA). First ask BestAPI if they offer face match / tamper APIs; else pick a vendor.
- Show scores in the admin KYC queue next to PL-05 labels; auto-flag below threshold.

**Open decisions**
- [ ] Vendor + per-check cost (~₹0.5–3).
- [ ] Auto-reject threshold vs admin review only.

**Notes:** Owner asked to be reminded after PL-05 ships (26 Oct).

## PL-05 — KYC document photo checks (in-house)

**Problem:** PAN number (BestAPI) and Aadhaar (OTP) are verified, but the uploaded photos are not — an agent can put any image in the PAN / Aadhaar front / Aadhaar back fields.

**Plan** — all on our own server, no vendor, no per-check cost: see [kyc-doc-checks.md](TASKS/kyc-doc-checks.md).
- Aadhaar Secure QR verify (UIDAI signature) → name, DOB, gender, last 4, photo.
- Quality check (blur / size / dark) → ask to retake.
- Document type via OCR (Tesseract) + keyword rules: PAN / Aadhaar front / Aadhaar back / other.
- Data match: PAN number + name vs verified PAN; Aadhaar name / DOB / last 4 vs OTP eKYC.
- Clear fail → red message under the field, upload not accepted. Doubtful → accepted but flagged. Admin KYC queue + user page show match labels.

**Open decisions**
- [ ] Mismatch on name only (spelling) → flag, not block (recommended).

## PL-04 — Terms & Privacy acceptance at login

**Problem:** Agents use the platform without ever accepting the Retailer Terms or the Privacy Policy, so there is no proof of consent (needed under DPDPA and by banking partners).

**Docs (26 Oct)**
- `Policies/Login-Policy/AsanPay_Retailer_Terms_and_Conditions_v1.1.docx`
- `Policies/Login-Policy/AsanPay_Privacy_Policy_v1.0.docx`

**Plan**
- Checkbox above the Login button (agent web + mobile): "I have read and agree to the Terms & Conditions and Privacy Policy" — both links open the full text (web page `/terms`, `/privacy`; mobile screen).
- Login button disabled until ticked; inline helper text if the user taps Login without ticking.
- Backend stores acceptance per user + document version (timestamp, method web/app). Once accepted, the checkbox is pre-cleared on future logins until the T&C or Privacy version changes, then shown again.
- Never store OTP or password in the acceptance record.

**Built (26 Oct)**
- Docs: T&C v1.1, Privacy v1.0, `AsanPay_EULA_v1.0.docx`. Text shared via `packages/shared-types/legalCopy.ts` (`TERMS_BODY`, `PRIVACY_BODY`, `EULA_BODY`, `POLICY_VERSION`).
- Checkbox above every login button — web: OTP, Password, Welcome-back MPIN; mobile: OTP, Password. Links open the full text in a modal. Button disabled until ticked; pre-ticked when this device already accepted the current version.
- Backend `ensurePolicyAccepted` on password / OTP / MPIN login (before OTP is consumed): records `policy_acceptances` (user, version, channel, method, IP, UA) or returns 409 `POLICY_ACCEPTANCE_REQUIRED`. Skips with a warning if migration `0075` hasn't run yet.
- Mobile MPIN unlock screens send the stored acceptance; on 409 → fall back to OTP / log out.
- Bump `LEGAL_VERSIONS` in `legalCopy.ts` → every agent must accept again.

**Open decisions**
- [x] Placeholders filled (26 Oct): Grievance Officer Ajay Kumar (Director), help@asanpay.in, effective date 26 Oct 2026, https://asanpay.in, business-day hours. Marketing site privacy page + footer phone fixed too.
- [ ] Add CIN to T&C / Privacy / EULA + marketing privacy page when available (then bump `LEGAL_VERSIONS` if already live).
- [ ] Legal review before go-live.
- [x] Sign-up: popup has Terms + Privacy only (EULA is login-only); `/auth/signup/complete` requires `SIGNUP_POLICY_VERSION` (`T1.1-P1.0`) and records `login_method = signup`. First login still asks for the full `POLICY_VERSION` (adds EULA). No eSign — checkbox acceptance only (T&C 26.1).

## PL-03 — Web location via phone QR

**Problem:** Desktop browsers guess location from IP (often km off, easy to fake). AEPS and provider onboarding need the exact shop GPS.

**Built (26 Oct)**
- Web shows a QR (`asanpay:geo:<token>`, 2 min). Agent taps **Scan QR** on the mobile home header (same account) → phone GPS (high accuracy, mock check) → `POST /api/geo-link/confirm`. Web polls `GET /api/geo-link/:token`.
- Server rules: same user only, single use, reject mock location, reject accuracy worse than ±150 m. Table `geo_link_requests` (migration `0074`).
- **Web onboarding:** "Fetch Location" opens the QR; Submit disabled until captured; backend uses the server-stored coordinates (`geoLinkToken`), never the browser's. Verified fix usable for 30 min.
- **Web AePS:** "Verify location" bar on `/aeps`; phone location saved for the day and used by Aadhaar Pay.
- **Mobile onboarding:** keeps using phone GPS; Submit disabled until location captured.

**Open / next**
- [ ] Live test (web onboarding + web AePS) after migrate + APK.
- [ ] Optional: block web AEPS money txns until today's phone location is verified (today it's preferred, not required).
- [ ] Optional: max distance from registered shop location.

## PL-02 — Cash Management page

**Problem:** Cash collection today is a modal that asks the retailer for a merchant id, then opens the Airtel CMS page in the phone browser — the user leaves the app and nothing is recorded on our side.

**Plan**
- **Page:** Services → Cash Collection → "Cash Management" page (web + mobile).
  - One card per CMS provider: icon, name, one-line description, **Initiate** button. Airtel CMS now; list is config-driven so new providers are one entry each.
  - Below: **CMS Transactions** — From date / To date / Fetch → list (txn id, provider, amount, status, UTR, time) + Export (PDF · Excel · CSV).
- **No merchant id input:** backend fills `merchantId` from the logged-in retailer (value to confirm with provider) and generates `transactionId`.
- **In-app CMS:**
  - Mobile: new WebView screen (our header + back, status bar / nav bar in brand color). Needs `react-native-webview` → APK rebuild.
  - Web: open inside the portal (iframe) if the bank page allows framing; otherwise a centered popup window and the portal polls status.
- **Record every CMS txn:** new `cms_transactions` table (retailer, provider, txn id, status, amount, UTR, raw). Status via status-check on return from the CMS page; provider callback later.
- Mobile + web parity; "hover cursor" is web only.

**Built (26 Oct):** migration `0073_cms_transactions`; `GET /noble/cms/providers`, `POST /noble/cms/start { provider }`, `POST /noble/cms/status`, `GET /noble/cms/transactions?from&to`; web `app/cms/page.tsx` (iframe overlay + "Open in new window"); mobile `CashManagementModal` (WebView, `react-native-webview`). Merchant id = retailer's registered mobile for now.

**Open decisions (owner)**
- [ ] Merchant id = retailer's registered mobile, or a provider-issued merchant id? (ask provider)
- [ ] Does Airtel's CMS page allow iframe on web? (test once built)
- [ ] Commission / charges on CMS collections?
- [ ] Does a CMS collection credit any AsanPay wallet, or is it record-only?

**Notes:** Only one CMS provider live today; don't hard-code provider names in UI layout.

---

## PL-01 — Linked accounts + role switch

**Problem:** One person runs both a Distributor and a Retailer account, each on a different mobile. Today they log out and log in again to move between them.

**Plan**
- **Link:** Dashboard → Linked accounts → Link another account → other account's mobile → OTP on that mobile + that account's MPIN / password.
- **Same person only:** link allowed only when both accounts have **verified** KYC and the same verified PAN / Aadhaar (server-side records only, never user-typed). Nobody can link another person's account.
- **Switch:** header profile menu → "Switch to Retailer" / "Switch to Distributor" → MPIN → card flip animation (current → target account, 700 ms, web + mobile) → fresh session for the other account (no logout).
- **Unlink:** Settings, any time. Every link / unlink / switch goes to the audit log.
- Accounts stay separate: own mobile, wallet, ledger account, commission, daily 2FA.
- Backend sketch: `linked_accounts` table; switch endpoint checks the link and issues tokens for the target account (role is re-read from the DB on every request already).
- Admin: user detail shows "Linked accounts".

**Open decisions (owner)**
- [x] Self-commission: **yes** — linking does not change commission; the upline earns normally even on its own linked Retailer's transactions (26 Oct, changed from "no").
- [ ] Can the same PAN / Aadhaar register two accounts today? (check signup in Phase A) — linking rules follow that answer.
- [x] Max linked accounts per person: **2** (one Distributor + one Retailer) (26 Oct).
- [x] MPIN on **every** switch — no grace window (26 Oct).
- [x] 24-hour re-verify: link stays permanent; first switch after 24 h needs OTP on the target mobile + MPIN, then MPIN only for 24 h (26 Oct).

**Notes:** AEPS (provider agent id + daily 2FA) stays on the Retailer account only. Wallet transfers between the two follow the normal hierarchy rule.
