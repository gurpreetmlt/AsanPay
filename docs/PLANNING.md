# Planning list

Features we have discussed and decided to build, before they become task files.
One row per feature; details in the section below the table. Newest at the top of the table.

**Status flow:** `idea` → `planned` → `design` (Figma in progress) → `ready` (task file written) → `building` → `done`

| # | Feature | Surfaces | Size | Status | Design | Task file |
|---|---------|----------|------|--------|--------|-----------|
| PL-15 | Admin "Services" setup page — one page per service (status · provider · limits · customer fee · commission · preview) | Backend, admin | L | idea (27 Oct) — after PL-14 | — | — |
| PL-14 | Commission rate card + share % (one screen, live preview, safety, Advanced tab) + agent-page Commission card | Backend, admin | L | building — RC1 backend built 27 Oct (migrate + deploy pending); RC2 next | — | [commission-rate-card.md](TASKS/commission-rate-card.md) |
| PL-13 | Daily 2FA redesign — Aadhaar-style card view (masked number, photo, status) + fingerprint / face verify | Web, mobile | L | ready (owner design screens 27 Oct) | [Figma prompt](PROMPTS/figma-daily-2fa.md) · owner screens in task file | [daily-2fa-redesign.md](TASKS/daily-2fa-redesign.md) |
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
RC3 safety → RC4 navigation).

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
- [ ] Show the KYC selfie on the card, or initials only?
- [ ] Face tile on web: hide it, or show as "Android app only"?

**Notes:** No official UIDAI logo or national emblem. Use a neutral placeholder emblem.

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
