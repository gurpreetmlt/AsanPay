# Web login approval from the mobile app (PL-42)

**Size:** L ⚠️ 1 phase/chat · **Surfaces:** backend, agent web, mobile

## Decisions (owner, 1 Nov 2026)
- Trusted browser after Approve: **1 day**
- Roles: **all agent roles** (Retailer, Distributor, Super Distributor). Admin: no (PL-41).
- No trusted phone with a push token / push off → **OTP login as today**, flagged `isNewDevice`.
- Approval expires in **2 minutes**; 2-digit number match (web shows the number, phone shows 3 choices).

## Phases
| Phase | Scope | Status |
|---|---|---|
| 1 | FCM in the mobile app (`src/lib/push.ts`, channel `asanpay_alerts`, `firebase.json`) | done (tested 1 Nov) |
| 2 | Push tokens + backend sender (`modules/push`, migration `0102`, `npm run push:test`) | done (tested 1 Nov: `push:test` sent=1 to a retailer) |
| 3a | Backend approval API (`login_approvals`, migration `0103`, `loginApproval.service.ts`) | done (built 1 Nov) |
| 3b | Agent web wait screen | **CURRENT** |
| 3c | Mobile approval popup | todo |

### Phase 2 — push tokens + sender
- Table `push_tokens`: `user_id`, `device_id` (from mobile `deviceId.ts`), `token`, `platform`, `updated_at`; unique (`user_id`, `device_id`).
- `POST /api/push/token` (auth) upsert · `DELETE /api/push/token` on logout.
- Mobile: send token after login + `onTokenRefresh`; delete on logout (`src/lib/logout.ts`).
- Backend `firebase-admin` sender module; service account from Coolify env `FIREBASE_SERVICE_ACCOUNT_B64` (base64 JSON). Never commit the key.
- Admin-only test endpoint or script: send a push to one user (verify end to end).

### Phase 3a — backend
- Table `login_approvals`: `id`, `user_id`, `status` (`pending` | `approved` | `denied` | `expired`), `match_number`, `browser`, `ip`, `city`, `expires_at`, `decided_at`, `device_id`.
- Agent web login (portal `agent`, after password / OTP) → if the user has a trusted device with a push token and the browser is not trusted → return `approval_required` + `approvalId` + `matchNumber` instead of tokens; send data push `{ type: "login_approval", approvalId }`.
- `GET /api/auth/login-approval/:id` (web polls, returns tokens once approved) · `POST /api/auth/login-approval/:id/decide` (mobile, auth, `approve` | `deny` + chosen number).
- Deny → audit `auth.web_login_denied` + risk signal; trusted-browser cookie 1 day on approve.

#### 3a as built (API contract for 3b / 3c)
- Opt-in: `POST /api/auth/login` and `/api/auth/otp/verify` accept `supportsLoginApproval: true` + `trustedBrowserToken`. Without the flag (mobile app, old web) login works as before.
- Approval required → `data: { approvalRequired: true, approvalId, matchNumber, pollToken, expiresAt, expiresInSeconds: 120 }`, no tokens. No trusted phone / push not delivered → normal session + `isNewDevice` (when `deviceId` sent).
- Poll is **POST** (portal proxy forwards bodies, not custom headers): `POST /api/auth/login-approval/:id/poll` `{ pollToken }` → `status`: `pending` (+`expiresInSeconds`) | `denied` | `expired` | `approved` (+ `user`, `accessToken`, `refreshToken`, `trustedBrowserToken`, `trustedBrowserExpiresAt`). Session is handed out once (409 `LOGIN_APPROVAL_USED` after). Limiter 60/min per approval + IP.
- Decide (mobile, Bearer): `POST /api/auth/login-approval/:id/decide` `{ decision: "approve" | "deny", matchNumber, deviceId }`. Wrong number → denied + 422 `LOGIN_APPROVAL_WRONG_NUMBER`. Expired → 410 `LOGIN_APPROVAL_EXPIRED`.
- Pending (mobile app open): `GET /api/auth/login-approvals/pending` → `approvals[]` with `id, browser, ip, city, loginMethod, choices, createdAt, expiresAt`.
- Push: notification "Approve web login?" + data `{ type: "login_approval", approvalId }`.
- Trusted browser = signed `trustedBrowserToken` (1 day, bound to user + browser `deviceId` + current password). **3b:** proxy must keep it in an httpOnly cookie and add it to the login body, and pass `isNewDevice` / `trustedBrowserToken` through (proxy currently strips everything except `user` when tokens are present). Proxy should also forward `User-Agent`; until then the browser label comes from `deviceLabel`.
- `city` stays null — no IP→city provider wired yet.

### Phase 3b — agent web
- Wait screen: "Approve this login on your AsanPay app", big match number, 2:00 countdown, Resend / Use OTP instead; Denied / Expired states with clear English copy.

### Phase 3c — mobile
- Push tap / foreground message `login_approval` → `ModalSheet` popup (blue ShieldCheck icon): browser, city, time, 3 number choices, Approve (blue) / Deny (red).
- Pending approvals also fetched on app open (push missed).

## Read ONLY
- `apps/backend/src/modules/auth/auth.service.ts`, `auth.routes.ts`
- `apps/backend/src/db/postgres/schema/users.ts`
- `apps/agent-portal/app/login/page.tsx`
- `apps/asanpay-mobile-app/src/lib/push.ts`, `src/lib/deviceId.ts`, `src/lib/logout.ts`, `App.tsx`

## Deploy
Schema change → git push → Coolify backend redeploy → `npm run db:migrate` on **EC2 SSH**. Mobile change → APK rebuild.
