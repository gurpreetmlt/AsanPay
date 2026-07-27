# Core Rollout: Implementation Steps (Phase 1)

High-level ordered changes for future implementation sessions. Each numbered item below is a reasonable single-session chunk.

1. **`tenants` table + tenant resolution middleware** — resolve incoming request's domain → tenant row → set `app.tenant_id` for the DB session, attach `tenantId` to request context.
2. **`tenant_id` column + RLS policy on every table** listed in `03-schema-and-tables.md` — via Drizzle migrations, one policy pattern reused per table (`USING (tenant_id = current_setting('app.tenant_id')::uuid)`).
3. **JWT payload gains `tenantId` claim** — `signAccessToken`/`signRefreshToken` in `apps/backend/src/utils/jwt.ts`, so every authenticated request's tenant is cryptographically bound to the session, not just inferred from domain (defense in depth — prevents a stolen token from one tenant being replayed against another tenant's domain).
4. **`getSystemWallet()` becomes per-tenant** — add `tenantId` filter, one `aggregator` wallet per tenant instead of one globally. Same fix needed in the duplicated query in `commission.service.ts` (worth extracting to one shared helper while touching this).
5. **Commission slab tenant-margin layer** — extend `commission_rules` (or add `tenant_commission_overrides`) so the payout waterfall becomes: our fixed margin first → tenant's own margin (bounded by `tenants.margin_range_min/max`) → remainder split across that tenant's SD/Distributor/Retailer hierarchy via existing `findActiveRule` logic.
6. **Branding**: backend serves tenant branding (name, logo, theme color) via a public "resolve tenant by domain" endpoint; `apps/web` fetches it at runtime instead of build-time env vars; mobile app branding remains a known limitation (compiled-in) unless a separate white-label mobile build pipeline is built later.
7. **Custom domain + SSL automation** — needs its own design pass with Coolify's domain API (see `09-open-items.md`).
8. **Admin panels** — see `05-admin-dashboards.md`.

## Migration sequencing (important)

Per `02-core-decisions.md`, decision 3: the AsanPay default-tenant row must be created and all existing rows backfilled with its `tenant_id` **within the same migration** that adds the column, before making it NOT NULL and before enabling RLS. This avoids any window where existing production rows become invisible/orphaned.
