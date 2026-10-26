# Planning list

Features we have discussed and decided to build, before they become task files.
One row per feature; details in the section below the table. Newest at the top of the table.

**Status flow:** `idea` → `planned` → `design` (Figma in progress) → `ready` (task file written) → `building` → `done`

| # | Feature | Surfaces | Size | Status | Design | Task file |
|---|---------|----------|------|--------|--------|-----------|
| PL-04 | Terms, Privacy & EULA acceptance checkbox at login (per-version record) | Backend, web, mobile | M | building (built 26 Oct, migrate `0075` + APK + live test pending) | — | — |
| PL-03 | Web location via phone QR (AEPS + onboarding) | Backend, web, mobile | M | building (built 26 Oct, migrate `0074` + APK + live test pending) | — | — |
| PL-02 | Cash Management page (CMS provider cards, in-app CMS, CMS transactions) | Backend, web, mobile | M | building (built 26 Oct, live test pending) | — | — |
| PL-01 | Linked accounts + role switch (same person, Distributor + Retailer) | Backend, web, mobile, admin | M | ready | [Figma prompt](PROMPTS/figma-linked-accounts.md) · Figma URL pending | [linked-accounts.md](TASKS/linked-accounts.md) |

---

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
- [ ] Fill placeholders in the docs (CIN, Grievance Officer, support hours, official URL / app link, effective date) — then regenerate `legalCopy.ts`.
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
- **Same person only:** link allowed only when both accounts have the same KYC PAN / Aadhaar.
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

**Notes:** AEPS (provider agent id + daily 2FA) stays on the Retailer account only. Wallet transfers between the two follow the normal hierarchy rule.
