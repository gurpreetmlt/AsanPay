# Task — Linked accounts + role switch (PL-01)

## Size: M (4 phases — 1 phase per chat: A → B → C → D)
## Depends: none · Design: [Figma prompt](../PROMPTS/figma-linked-accounts.md) · Figma URL: pending (owner to paste)

## Goal (1 line)
Same person (same KYC PAN / Aadhaar) links their Distributor + Retailer accounts once, then switches from the header with MPIN — no logout.

## Decisions (owner, 26 Oct)
- **Max linked:** 2 accounts per person (one Distributor + one Retailer). Third link → `You can link only 2 accounts (one Distributor and one Retailer).`
- **MPIN on every switch:** yes — no grace window.
- **Self-commission:** yes — linking does not change commission. Every account in the chain earns its normal commission, even when the Retailer is linked to its own upline. No change in the commission code.
- Accounts stay separate: own mobile, wallet, ledger, commission, daily 2FA. AEPS stays on the Retailer account only.

## Read ONLY these files
| Path | Why |
|------|-----|
| `apps/backend/src/modules/auth/auth.service.ts` | MPIN verify + token issue (reuse for switch) |
| `apps/backend/src/modules/auth/auth.routes.ts` | Add `/api/linked-accounts/*` routes |
| `apps/backend/src/db/postgres/schema/users.ts` | User + KYC columns (PAN / Aadhaar match) |
| `packages/shared-types/index.ts` | `LinkedAccount` type |

## Phase A — Backend
1. Migration `0076_linked_accounts.sql`: `linked_accounts` (id, group_id, user_id unique, linked_by_user_id, link_method `otp`, created_at, unlinked_at). Audit rows for link / unlink / switch.
2. `GET /api/linked-accounts` · `POST /link/start { mobile }` (OTP to that mobile) · `POST /link/verify { mobile, otp, mpin }` · `POST /switch { targetUserId, mpin }` → fresh tokens for target · `DELETE /:userId`.
3. Link rules: same PAN or Aadhaar (KYC verified), different role, both active, max 2. Errors: `This account belongs to a different PAN / Aadhaar and cannot be linked.` · OTP copy per `clear-error-messages`.
4. Check signup: can the same PAN / Aadhaar already register two accounts? Note the answer in PLANNING.md.

### Security — same person only (owner, 26 Oct)
- Link only when **both** accounts have **verified** KYC and the verified PAN **or** verified Aadhaar on both is the same person. Nobody can link someone else's account.
- Match only on server-side verified KYC records. Never accept PAN / Aadhaar in the request body and never compare user-typed numbers.
- Run the match in `/link/verify` **after** OTP + MPIN pass, so a stranger can't probe whose PAN a mobile has.
- Either account's KYC not verified → `Complete KYC on both accounts before linking.` Mismatch → `This account belongs to a different PAN / Aadhaar and cannot be linked.`
- Re-check on every `/switch`: KYC revoked / changed or account blocked → switch refused, link stays visible as `Needs review`.
- API responses mask PAN / Aadhaar (last 4 only); never return or log full values.

## Phase B — Agent web (`apps/agent-portal`)
- Sidebar: **Linked accounts** item (link icon) right above **Settings**; also reachable from Settings. Header profile menu: linked rows + Switch / Link another account / Manage. **Linked accounts** page (list, Switch, Unlink red, empty state, Link green). Switch modal: 4 MPIN boxes, Cancel red, Switch account blue, toast `You are now using your Retailer account`.
- **Switch flip animation (web + mobile, same timing):** only after `/switch` succeeds → full-screen overlay with the account card (avatar, name, role chip) doing a 3D Y-axis flip: front = current account, back = target account. 700 ms total, ease-in-out, perspective 1000; swap the session at the 50% mark, dashboard + toast after the flip ends. Wrong MPIN / API error → no flip, inline error in the modal. Reduce-motion on → 150 ms fade instead. Web: CSS `rotateY` + `backface-visibility: hidden`; mobile: `Animated` `rotateY` interpolate, `useNativeDriver: true`, `AccessibilityInfo.isReduceMotionEnabled()`. Link flow: mobile → OTP + MPIN → success.
- Link modal step 1 (owner screenshot): eyebrow `LINKED ACCOUNTS`, title `Link another account`, `Step 1 of 2`; blue info box `Link your other AsanPay account (same PAN / Aadhaar) to switch without logging out.`; field `Mobile number of the other account` with `+91` prefix, helper `We will send an OTP to this number.`; green box `Identity check` / `The PAN or Aadhaar on both accounts must match.`; Cancel (red) · Send OTP (blue).

## Phase C — Mobile (`apps/asanpay-mobile-app`)
- Same as Phase B with bottom sheets; switcher from the avatar in the top bar. Same English copy and same flip animation timing. APK rebuild.

## Phase D — Admin (`apps/admin-portal`)
- User detail: "Linked accounts" card (role, UID, masked mobile, linked date, method, View).

## Done when
- [ ] Link works only when both accounts' **verified** KYC PAN / Aadhaar match, max 2; a different person's account is always refused; unlink works; every action audited
- [ ] Switch asks MPIN every time, plays the card flip, and loads the other role's dashboard (web + mobile)
- [ ] Commission unchanged for linked accounts (upline still earns on its own Retailer's txns)
- [ ] Admin sees linked accounts · `docs/CHECKLIST.md` updated · PL-01 → `done`
