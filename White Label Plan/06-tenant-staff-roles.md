# Per-Tenant Internal Staff Roles (Phase 2 — follow-on after core multi-tenancy)

Separate from the money-hierarchy roles (SD/Distributor/Retailer), each tenant can also invite **internal staff members** with dashboard-only access and no wallet/commission — e.g. Sales Manager, ASM (Area Sales Manager), Support, Finance.

This is a **follow-on feature after core multi-tenancy ships**, not part of the initial `tenants` + RLS + JWT rollout — flagged here so the `tenant_staff` design accounts for RLS/tenant_id scoping from day one instead of retrofitting later.

## New table: `tenant_staff`

- `tenantId`, `email`/`mobile`, `role` (`sales_manager` | `asm` | `support` | `finance` | ...)
- `invitedBy`, `invitedAt`, `status` (`invited` | `active` | `revoked`)
- `permissions` (if per-role permission sets need per-invite overrides)

## Permission model (per role — exact matrix TBD in a later session)

- **Finance** → read-only wallet/transaction reports, no balance edits
- **Support** → retailer/user details, KYC/ticket resolution, no money access
- **Sales Manager / ASM** → retailer onboarding access, region-scoped data view

## Invite flow

Tenant Admin dashboard → enter email/mobile + role → invite link sent → invited person sets password → account activated, scoped to that tenant with that role's permissions. Standard SaaS invite pattern — no existing code to reuse here, new build.
