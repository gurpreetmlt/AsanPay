# Task — Email verification (6-digit OTP)

Retailer / distributor / super-distributor apna email verify karein. Invoices aur
statements usi verified address par jaate hain. **Login flow bilkul नहीं badalna** —
ye sirf email verification hai.

Existing `otp_requests` table reuse ho raha hai (hash, attempts, expiry, purpose enum
sab pehle se hai). Koi naya table nahi.

---

## Ho chuka (backend)

- `src/db/postgres/schema/enums.ts` — `otpPurposeEnum` mein `"email_verify"` add
- `src/db/postgres/schema/logs.ts` — `OtpMeta` mein `email?: string` add
- `src/db/postgres/schema/users.ts` — `emailVerifiedAt` timestamp column add
- `src/db/postgres/repositories/otpRequest.ts` — `OtpPurpose` union mein `"email_verify"`
- `src/db/postgres/migrations/0020_blushing_the_anarchist.sql` — generate ho chuki, **abhi apply nahi hui**
- `src/config/env.ts` — `SMTP_HOST/PORT/USER/PASS/FROM` add
- `nodemailer@9` + `@types/nodemailer` installed
- `src/utils/mailer.ts` — `sendMail()`, `isMailerConfigured()`, `emailVerificationTemplate()`
- `src/modules/auth/emailVerify.service.ts` — `requestEmailVerifyOtp()`, `verifyEmailOtp()`

---

## Baaki (yahi karna hai)

### ~~1. Backend wiring~~ ✅

### ~~2. `AuthUser` mein email fields~~ ✅

### ~~3. Frontend — `apps/agent-portal`~~ ✅
- Shared `EmailVerifyField` (Verify + OTP modal)
- Wired in `kyc/page.tsx`, `onboarding/outlet/page.tsx`, `settings/page.tsx`

### 4. Faisla lena hai

Email verification **mandatory** (KYC complete na ho bina verify) ya **optional**
(banner dikhe, kaam na ruke)? User ne abhi tay nahi kiya. Abhi **optional** hai — Verify button
available hai, flow block nahi hota.

---

## Deploy karne ka tareeka

Migration **abhi apply nahi hui**. Sahi kram:

1. Code commit + push → Coolify khud backend deploy karega (watch paths set hain)
2. Server par migration:
   ```bash
   API=$(for c in $(sudo docker ps --format '{{.Names}}' | grep -v '^coolify'); do [ "$(sudo docker exec $c printenv PORT 2>/dev/null)" = "4000" ] && echo $c; done | head -1)
   sudo docker exec $API npm run db:migrate
   ```
3. Coolify → `AsanPay_API` → Environment Variables mein SMTP daalo:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=no-reply@asanpay.in
   SMTP_PASS=<Google Workspace App Password>
   SMTP_FROM=AsanPay <no-reply@asanpay.in>
   ```
   → Redeploy

SPF aur DMARC records DNS mein already add ho chuke hain.

---

## Dhyan rakhne wali baatein

- **`users.email` unique hai** — service pehle hi duplicate check karta hai, par frontend
  par bhi साफ error dikhana (`EMAIL_TAKEN`).
- **OTP kabhi log mat karna.** Mailer sirf address log karta hai.
- **SMTP na ho to `EMAIL_NOT_CONFIGURED` (503)** aata hai — mailer jaan-boojh kar
  fail-soft hai, kisi aur flow ko nahi todta.
- Local dev SSH tunnel se **production DB** par juda hai — seed/migrate chalate waqt
  savdhani. (Local Postgres install nahi karna hai, user ne mana kiya hai.)
