# Additional Ideas Discussed (not yet committed to a phase)

1. **Tenant-level feature flags** — not every partner needs all services (AEPS/DMT/BBPS/Payout). A `tenant_services` table decides which services are enabled per tenant, enabling smaller/cheaper packages.
2. **Tenant onboarding wizard** — guided flow in the Super Admin dashboard: name/domain/logo → margin range → default tenant-admin account created → invite email sent. Avoids manual SQL for onboarding new tenants.
3. **Per-tenant rate limiting / abuse protection** — one tenant's traffic spike or compromised account shouldn't degrade other tenants' API performance.
4. **Billing automation** — cron job checks license due date; if overdue past the grace period, auto-suspends that tenant's access (via RLS) with no manual intervention.
5. **Audit trail for cross-tenant (Super Admin) visibility** — an "impersonate/view-as-tenant" mode for support purposes should itself be audit-logged (who viewed which tenant's data, when) — important for fintech compliance.
6. **Sandbox/demo tenant** — a trial environment (fake money, real UI) for prospective partners before they sign, useful for sales enablement.
7. **Tenant data export/backup on offboarding** — if a partner's contract ends, exporting their data (users, transaction history) may be a legal/compliance requirement. A dedicated export tool avoids last-minute scrambling.
8. **Cross-tenant fraud pattern detection** — detecting the same mobile/PAN/Aadhaar being registered across multiple tenants (fraud actor trying different partners) is only possible at the Super Admin level (RLS-bypassed), as a dedicated fraud-detection service.
9. **Tenant-specific webhook/notification config** — the existing Slack alerting system (single workspace) should become tenant-configurable, so each partner gets their own fraud/limit alerts routed to their own Slack/email.
10. **Rate-card/pricing tiers for tenants** — e.g. "Basic" (lower volume, standard margin range) vs. "Enterprise" (custom margin range, dedicated support). Partially covered by `tenants.margin_range_min/max`, but an explicit `tier` field would help reporting/sales.
11. **Staging/UAT environment per major tenant** — lets large partners integration-test before going live, without production risk.
