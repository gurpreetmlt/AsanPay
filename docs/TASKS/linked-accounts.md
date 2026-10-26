# Task — Linked accounts + role switch (PL-01)

## Size: M (4 phases — 1 phase per chat: A → B → C → D)
## Depends: none · Design: [Figma prompt](../PROMPTS/figma-linked-accounts.md) · Figma URL: pending (owner to paste)

## Goal (1 line)
Same person (same KYC PAN / Aadhaar) links their Distributor + Retailer accounts once, then switches from the header with MPIN — no logout.

## Decisions (owner, 26 Oct)
- **Max linked:** 2 accounts per person (one Distributor + one Retailer). Third link → `You can link only 2 accounts (one Distributor and one Retailer).`
- **MPIN on every switch:** yes — no grace window.
- **24-hour OTP re-verify (owner, 26 Oct):** the link stays permanent (no daily relink). The first switch into an account after its last OTP verify is > 24 h old needs **OTP on that account's mobile + MPIN**; for the next 24 h, MPIN only. Tracked per target account in `linked_accounts.otp_verified_at`. Copy: `For your security, verify with OTP once every 24 hours.`
- **Self-commission:** yes — linking does not change commission. Every account in the chain earns its normal commission, even when the Retailer is linked to its own upline. No change in the commission code.
- Accounts stay separate: own mobile, wallet, ledger, commission, daily 2FA. AEPS stays on the Retailer account only.

## Read ONLY these files
| Path | Why |
|------|-----|
| `apps/backend/src/modules/auth/auth.service.ts` | MPIN verify + token issue (reuse for switch) |
| `apps/backend/src/modules/auth/auth.routes.ts` | Add `/api/linked-accounts/*` routes |
| `apps/backend/src/db/postgres/schema/users.ts` | User + KYC columns (PAN / Aadhaar match) |
| `packages/shared-types/index.ts` | `LinkedAccount` type |

## Phase A — Backend — **built 26 Oct** (migrate `0076` pending)
1. Migration `0076_linked_accounts.sql`: `otp_purpose` + `account_link`; `linked_accounts` (group_id, user_id unique, linked_by_user_id, link_method, otp_verified_at, switch_failed_attempts, switch_locked_until, created_at). Unlink deletes the whole group; history = `audit_logs` (`linked_accounts.*`).
2. Module `apps/backend/src/modules/linkedAccounts/` mounted at `/api/linked-accounts` (agent roles only):
   `GET /` → `LinkedAccountsResponse` · `POST /link/start { mobile }` · `POST /link/verify { mobile, otp, mpin }` · `POST /switch/otp { targetUserId }` · `POST /switch { targetUserId, mpin, otp?, refreshToken?, acceptedPolicyVersion?, policyChannel? }` → `{ user, accessToken, refreshToken, otpVerified }` · `DELETE /:userId`.
3. Link rules: both KYC verified, **verified PAN and Aadhaar both match** (decrypted server-side), different roles, both active, max 2. MPIN asked is the **other** account's MPIN.
4. Switch errors clients must handle: `SWITCH_OTP_REQUIRED` (call `/switch/otp`, then resend with `otp`), `MPIN_INCORRECT` (attempts left in message), `SWITCH_LOCKED` (429), `LINK_NEEDS_REVIEW`, `POLICY_ACCEPTANCE_REQUIRED`.
5. Shared types: `LinkedAccountSummary`, `LinkedAccountsResponse`, `MAX_LINKED_ACCOUNTS`. Email alert to both accounts on link / unlink (verified email only; no SMS provider yet).
6. Open: can the same PAN / Aadhaar already register two accounts? (signup check — note answer in PLANNING.md).

### Security — same person only (owner, 26 Oct)
- Link only when **both** accounts have **verified** KYC and the verified PAN **and** verified Aadhaar on both match (any conflict = different person). Nobody can link someone else's account.
- Match only on server-side verified KYC records. Never accept PAN / Aadhaar in the request body and never compare user-typed numbers.
- **Verify popup first (owner, 26 Oct):** `POST /link/check { mobile }` → `LinkCheckResult` (PAN / Aadhaar / Name match + other account's name, UID, role, masked mobile). Details are returned **only** when PAN + Aadhaar match the caller's own KYC; on mismatch only "Not matched" rows (no stranger data). Name is compared (case / punctuation / word-order insensitive) only after PAN + Aadhaar match, and must match too. `/link/start` sends the OTP only after the full match; `/link/verify` re-runs every rule after OTP + MPIN.
- Either account's KYC not verified → `Complete KYC on both accounts before linking.` Mismatch → `This account belongs to a different PAN / Aadhaar and cannot be linked.`
- Re-check on every `/switch`: KYC revoked / changed or account blocked → switch refused, link stays visible as `Needs review`.
- API responses mask PAN / Aadhaar (last 4 only); never return or log full values.

### Security — hardening (owner, 26 Oct)
- **MPIN lockout:** 5 wrong MPINs on switch → switch locked 30 min for that target (`Too many wrong MPIN attempts. Try again in 30 minutes.`).
- **Server-side target:** `/switch` loads the link group from the DB; `targetUserId` must be an active, non-unlinked member of the caller's group.
- **Switch = login:** target must pass the same gates as login (active, not blocked, policy acceptance PL-04). No bypass of daily 2FA / AEPS rules.
- **Session:** switch issues new tokens for the target and revokes the caller's refresh token. Clients clear all cached data before loading the target dashboard.
- **OTP limits:** link / re-verify OTP reuses the login OTP limits + expiry.
- **Notify:** link and unlink send an SMS / notification to both mobiles.

## Phase B — Agent web — **built 26 Oct**
- Built: `components/linkedAccounts/*` (ProfileMenu, SwitchFlow, AccountFlipOverlay, LinkAccountModal, LaDialog, parts), page `app/linked-accounts/page.tsx`, `lib/linkedAccounts.ts`, flip CSS in `globals.css`. Proxy sets session cookies for `POST /linked-accounts/switch` and injects the refresh cookie for revoke. After switch: full reload to `/dashboard` + toast.
- Owner (26 Oct): entry = **header profile dropdown only** (no sidebar item). Dashboards for Distributor / Retailer unchanged.
- Original spec: Header profile menu: linked rows + Switch / Link another account / Manage. **Linked accounts** page (list, Switch, Unlink red, empty state, Link green). Switch modal: 4 MPIN boxes, Cancel red, Switch account blue, toast `You are now using your Retailer account`.
- **Switch flip animation (web + mobile, same timing):** only after `/switch` succeeds → full-screen overlay with the account card (avatar, name, role chip) doing a 3D Y-axis flip: front = current account, back = target account. 700 ms total, ease-in-out, perspective 1000; swap the session at the 50% mark, dashboard + toast after the flip ends. Wrong MPIN / API error → no flip, inline error in the modal. Reduce-motion on → 150 ms fade instead. Web: CSS `rotateY` + `backface-visibility: hidden`; mobile: `Animated` `rotateY` interpolate, `useNativeDriver: true`, `AccessibilityInfo.isReduceMotionEnabled()`. Link flow: mobile → OTP + MPIN → success.
- Link modal step 1 (owner screenshot): eyebrow `LINKED ACCOUNTS`, title `Link another account`, `Step 1 of 2`; blue info box `Link your other AsanPay account (same PAN / Aadhaar) to switch without logging out.`; field `Mobile number of the other account` with `+91` prefix, helper `We will send an OTP to this number.`; green box `Identity check` / `The PAN and Aadhaar on both accounts must match.`; Cancel (red) · Send OTP (blue).

## Phase C — Mobile — **built 26 Oct** (APK pending)
- Built: `src/components/linkedAccounts/*` (LinkedAccountsHost = avatar sheet + manage screen, SwitchFlow, AccountFlipOverlay, LinkAccountSheet, parts), `src/lib/linkedAccounts.ts`. Entry: home avatar tap (retailer `ScreenHeader.onAvatarPress`, partner home avatar) + Account → Manage → **Linked accounts**. Tabs keyed by `user.id` so a switch remounts every screen. Switch sends `deviceId` → backend trusts the device for the target (Welcome-back MPIN works after restart).
- Same English copy and same flip timing as web. Home screens unchanged except the avatar tap.

## Phase D — Admin (`apps/admin-portal`)
- User detail: "Linked accounts" card (role, UID, masked mobile, linked date, method, View).

## Done when
- [ ] Link works only when both accounts' **verified** KYC PAN / Aadhaar match, max 2; a different person's account is always refused; unlink works; every action audited
- [ ] Switch asks MPIN every time, plays the card flip, and loads the other role's dashboard (web + mobile)
- [ ] Commission unchanged for linked accounts (upline still earns on its own Retailer's txns)
- [ ] Admin sees linked accounts · `docs/CHECKLIST.md` updated · PL-01 → `done`
