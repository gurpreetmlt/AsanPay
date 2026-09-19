# AsanPay WhatsApp Support (internal only)

**Not** AsanConnect SaaS. Scope: AsanPay Retailer / Distributor / Super Dist support on the **same** Cloud API number used for OTP.

## Product goal

Admin Dashboard mein **WhatsApp jaisa kaam**:

- Retailer apne WhatsApp se business number pe likhe → **Inbox mein dikhe**
- Hum dashboard se **reply** karein (chat UI)
- **Delivered / read (seen)** status dikhe
- Baad mein **broadcast** (templates)
- Kabhi bhi band: `WHATSAPP_SUPPORT_ENABLED=false` (OTP alag chale)

Meta limits (same as WhatsApp Business API): free text ~24h after customer message; otherwise approved templates. No groups / calls / Status.

## Goals

- Admin (later support role) can see threads and reply to agents.
- Feature removable anytime via env flag without breaking OTP.
- Multi-tenant client WhatsApp → **AsanConnect.in** (out of scope).

## Feature flags (Coolify)

| Key | Purpose |
|-----|---------|
| `OTP_DELIVERY=whatsapp` | Login/signup OTP (existing) |
| `WHATSAPP_SUPPORT_ENABLED=false` | Default off. `true` unlocks support module UI + APIs |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta webhook verify (same string as Meta dashboard) |

OTP must keep working when support flag is `false`.

## Removable architecture (required)

Build so support can be **turned off** or **deleted later** without breaking OTP / auth.

1. **Separate module folders** (do not mix into auth/wallet):
   - Backend: `apps/backend/src/modules/whatsapp/support/` (inbox, webhook ingest beyond OTP, broadcast)
   - Keep OTP in existing `whatsapp.service.ts` (or thin `otp.ts`) — **never** delete OTP path when removing support
   - Admin: `apps/admin-portal/app/whatsapp/**` + one nav entry
2. **Single mount point**: register support routes only if `WHATSAPP_SUPPORT_ENABLED`; admin nav hidden if false
3. **No deep coupling**: no imports of support into txn/wallet/auth except optional “log OTP send” hook behind flag
4. **DB**: support tables prefixed `whatsapp_` / clear names; droppable via one migration later; OTP does not depend on inbox tables
5. **Remove later checklist**:
   - Set `WHATSAPP_SUPPORT_ENABLED=false` (instant hide)
   - Or delete `whatsapp/support` + admin `whatsapp` pages + drop tables migration
   - Leave `sendWhatsAppOtp` + Coolify OTP env intact

## Location in product

**Admin portal** sidebar → **WhatsApp**

- Inbox (chat list + thread — WhatsApp-like)
- Logs (optional technical view)
- Broadcast (Phase 3)

Agent portal / mobile: not required for v1 (company support desk only).

## Phase 1 — Foundation (webhook + store)

1. Env flags above. ✅
2. DB (Postgres / Drizzle): `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_webhook_events` (idempotent). ✅ `0044_whatsapp_support`
3. Webhook `GET/POST /api/whatsapp/webhook` — verify + inbound + status; 200 fast. ✅
4. Link outbound OTP sends into message log where possible. ✅ (when `WHATSAPP_SUPPORT_ENABLED`)
5. Admin nav **WhatsApp** + basic **Inbox list** (reply = Phase 2). ✅ `/whatsapp`

**Done when:** Customer WhatsApp → business number → appears in Admin Inbox; statuses update; OTP still works.

## Phase 2 — Reply (WhatsApp-like chat)

1. Thread UI: bubbles, timestamps, status ticks.
2. Send text inside 24h window; template send outside / cold outreach.
3. Clear English errors (window closed, template required, Meta access denied).

**Done when:** Support can chat back and forth from Admin like WhatsApp (API rules apply).

## Phase 3 — Broadcast

1. Audience by role / filters.
2. Approved templates only; queue + per-recipient status.

## Explicitly out of scope (AsanPay)

- Embedded Signup / client WABA connect
- Multi-tenant external businesses (AsanConnect)
- Groups, voice/video calls, Status

## Suggested order of work

1. Env + schema + migrate (EC2)
2. Webhook
3. Admin Inbox shell
4. Reply
5. Broadcast later

## Deploy notes

- Coolify: backend + **admin-portal**.
- Migrate on **EC2 SSH**.
- APK: not needed for admin-only v1.
