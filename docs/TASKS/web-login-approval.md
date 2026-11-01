# Web login approval from the mobile app (PL-42)

**Size:** L ⚠️ 1 phase/chat · **Surfaces:** backend, agent web, mobile

## Decisions (owner, 1 Nov 2026)
- Trusted browser after Approve: **1 day**
- Roles: **all agent roles** (Retailer, Distributor, Super Distributor). Admin: no (PL-41).
- No trusted phone with a push token / push off → **OTP login as today**, flagged `isNewDevice`.
- Approval expires in **2 minutes**; 2-digit number match (web shows the number, phone shows 3 choices).
- (1 Nov, later) Approval gates **password login only**. OTP login (WhatsApp / Telegram) is the fallback and is never gated — "Use OTP instead" on the wait screen.
- (1 Nov, PL-43 — supersedes the line above for the agent web) OTP login on the **agent web** also needs the phone tap on a browser that is not trusted; every approve sends phone GPS. Mobile app OTP is still never gated.
- PL-43 API: decide body adds `location { latitude, longitude, accuracyMeters, isMockLocation }` (required to approve password / OTP) + `confirmFar`; 409 `LOGIN_APPROVAL_CONFIRM_FAR` (> 50 km), 422 `LOGIN_APPROVAL_MOCK_LOCATION`, 422 `LOGIN_APPROVAL_LOCATION_REQUIRED`. QR: `POST /api/auth/qr-login/start` (public) → `{ approvalId, pollToken, qrValue "asanpay:login:<id>.<secret>", expiresAt }`; web polls the same poll endpoint (`scanned` flag while pending); phone `POST /api/auth/qr-login/scan` `{ qr, deviceId, latitude, longitude, accuracyMeters, isMockLocation }` (trusted device only) → confirm card → decide `{ decision }`.
- (1 Nov, later) **Enforced for every client**, not opt-in: password login from any device that is not an approval phone (and not a browser approved in the last day) needs a tap. Clients without the wait screen (mobile app, old builds) get 403 `LOGIN_APPROVAL_REQUIRED` "… Use OTP login instead."

## Phases
| Phase | Scope | Status |
|---|---|---|
| 1 | FCM in the mobile app (`src/lib/push.ts`, channel `asanpay_alerts`, `firebase.json`) | done (tested 1 Nov) |
| 2 | Push tokens + backend sender (`modules/push`, migration `0102`, `npm run push:test`) | done (tested 1 Nov: `push:test` sent=1 to a retailer) |
| 3a | Backend approval API (`login_approvals`, migration `0103`, `loginApproval.service.ts`) | done (built 1 Nov) |
| 3b | Agent web wait screen (`components/auth/LoginApprovalWait.tsx`, proxy trust cookie `ap_w_tb`) | built 1 Nov — test pending |
| 3c | Mobile approval popup (`components/LoginApprovalHost.tsx`, `lib/loginApproval.ts`) | built 1 Nov — test pending |
| 3d | Enforce for every client + password-only gate | built 1 Nov — test pending |
| 4 (PL-43) | Phone GPS check on approve, OTP web login gated on new browsers, Login with QR code (migration `0104`) | built 1 Nov — migrate + test pending |

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
- `POST /api/auth/login` accepts `supportsLoginApproval: true` + `trustedBrowserToken` (the agent-portal proxy adds both). OTP verify is not gated (see Decisions).
- Approval required → `data: { approvalRequired: true, approvalId, matchNumber, pollToken, expiresAt, expiresInSeconds: 120 }`, no tokens; without `supportsLoginApproval` → 403 `LOGIN_APPROVAL_REQUIRED`. No approval phone / push off / push not delivered / login from the approval phone itself → normal session + `isNewDevice` (when `deviceId` sent).
- Poll is **POST** (portal proxy forwards bodies, not custom headers): `POST /api/auth/login-approval/:id/poll` `{ pollToken }` → `status`: `pending` (+`expiresInSeconds`) | `denied` | `expired` | `approved` (+ `user`, `accessToken`, `refreshToken`, `trustedBrowserToken`, `trustedBrowserExpiresAt`). Session is handed out once (409 `LOGIN_APPROVAL_USED` after). Limiter 60/min per approval + IP.
- Decide (mobile, Bearer): `POST /api/auth/login-approval/:id/decide` `{ decision: "approve" | "deny", matchNumber, deviceId }`. Wrong number → denied + 422 `LOGIN_APPROVAL_WRONG_NUMBER`. Expired → 410 `LOGIN_APPROVAL_EXPIRED`.
- Pending (mobile app open): `GET /api/auth/login-approvals/pending` → `approvals[]` with `id, browser, ip, city, loginMethod, choices, createdAt, expiresAt`.
- Push: notification "Approve web login?" + data `{ type: "login_approval", approvalId }`.
- Trusted browser = signed `trustedBrowserToken` (1 day, bound to user + browser `deviceId` + current password). The proxy stores it in httpOnly cookie `ap_w_tb` (never sent to browser JS), adds it to the login body, and forwards `User-Agent` so the phone shows e.g. "Chrome on macOS".
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
