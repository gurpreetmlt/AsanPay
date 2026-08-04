# 32 — Admin: Fund dual-approve limit (₹)

> Size: S · Status: **done**

## Goal

Admin can raise/lower the fund-request dual-approve threshold from **Platform Control** (saved in DB). No Coolify redeploy to change the limit.

## Why

Today `FUND_APPROVE_DUAL_RUPEES` is env-only. Single-admin shops need a high limit without SSH/env; later two admins can set ₹2L again from UI.

## Read ONLY

- `apps/backend/src/modules/fund-requests/fundRequest.service.ts` (dual threshold check)
- `apps/backend/src/config/env.ts` (`FUND_APPROVE_DUAL_RUPEES` fallback)
- Existing tenant/settings pattern if any (search `tenant_settings` / site-control) — reuse, don’t invent a second settings system
- `apps/admin-portal` Platform Control / site-control page for UI placement

## Do

1. Persist per-tenant setting `fund_approve_dual_rupees` (integer rupees) in DB (migration if needed).
2. API: admin GET/PATCH for this setting.
3. Approve path: read DB setting first; fall back to `env.FUND_APPROVE_DUAL_RUPEES`.
4. Admin UI under Platform Control: labeled **Fund dual-approve limit (₹)** + short helper (“Credits at/above this amount need two different admins”).
5. English UI only. Clear validation messages.

## Out of scope

- Second admin user creation UX
- Changing who may approve (roles stay admin)

## Done when

- Admin changes limit in UI → next large FR uses new threshold without redeploy.
- CHECKLIST + leftovers queue row 1 → `done`, row 2 → CURRENT.
