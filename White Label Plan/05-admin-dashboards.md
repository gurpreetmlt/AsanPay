# Admin Dashboard Structure

Two logical dashboards, both served from the **existing `apps/admin-web` app**, role-gated — no separate/new frontend app needed.

## Super Admin (us)

- Sees all tenants
- Aggregate provider wallet balance
- Per-tenant business volume / license status / payment-due
- Onboards new tenants, sets global margin rules
- Requires a new `super_admin` role value and an RLS-bypass path — super admin queries are cross-tenant by design, likely via a separate DB role/connection that skips the tenant RLS policy, used only by super-admin-gated routes.

## Tenant Admin (each partner, including AsanPay itself as the default tenant)

- Sees only their own tenant's data (existing dashboard views, now scoped by `tenant_id` via RLS automatically)
- Manages their own SD/Distributor/Retailer hierarchy
- Sets commission within their allowed range
- **No special-cased code path for AsanPay** — it uses the exact same tenant-admin view as any partner.

## Transacting users (SD/Distributor/Retailer)

Continue to use **`apps/web`** (the agent-facing portal) — also becomes tenant-scoped automatically via the same RLS + JWT mechanism, no separate app needed there either.

## Per-tenant hierarchy

Each tenant builds its own independent SD → Distributor → Retailer hierarchy using the existing `users.parentId` / `user_hierarchy` pattern — no new hierarchy logic needed, just tenant scoping added on top of what already exists.
