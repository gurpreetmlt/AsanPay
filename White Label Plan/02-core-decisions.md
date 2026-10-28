# Core Architecture Decisions (confirmed)

## 1. Tenant resolution: full custom domain — frontend only, API stays shared

Partners bring their own domain (e.g. `partner.com`) and point it at our **frontend** (`apps/agent-portal`) via CNAME/A record; we verify the record and issue a certificate (Let's Encrypt) for that domain.

The **backend API stays at the single shared `api.asanpay.in`** — no per-tenant API domain or per-tenant backend cert needed. This significantly shrinks the SSL-automation problem to just the frontend app in Coolify.

- Pre-login requests (e.g. "resolve tenant branding by domain") are matched via the request's `Origin`/`Referer` header against the `tenants.domain` column.
- Post-login requests are scoped via the `tenantId` claim already embedded in the JWT — not dependent on Origin/domain matching, so it's robust even if headers are stripped/proxied.
- Backend CORS config must allow exactly the set of registered tenant domains (`tenants.domain` values) rather than a wildcard, to prevent arbitrary origins from calling the API.
- Coolify's automatic Let's Encrypt per custom domain should suffice for the frontend once a tenant's domain is added to that app's domain list — still needs confirming whether that can be done via Coolify's API at tenant-onboarding time (dynamic) vs. requiring a manual step per new tenant. **This is the remaining open sub-task** (see `09-open-items.md`).

## 2. Isolation enforcement: Postgres native RLS + session variable

Every DB connection/transaction sets `SET LOCAL app.tenant_id = '<uuid>'` at the start of each request (via a Drizzle/pg middleware wrapping every request), and RLS policies on every tenant-scoped table enforce `tenant_id = current_setting('app.tenant_id')::uuid`.

This gives a DB-level safety net — even a missed `.where()` in application code cannot leak cross-tenant data, which matters a lot for a fintech app. This is why Postgres (RDBMS) is the right choice here — RLS, ACID transactions, row locking, and foreign-key integrity are all native to it and not available in NoSQL stores. Matches the existing project rule: "PostgreSQL only, No Mongo."

## 3. Existing-data migration: confirmed approach

Create one default tenant row for "AsanPay" itself, backfill `tenant_id` on all existing rows to point at it via a single `UPDATE ... SET tenant_id = '<asanpay-tenant-uuid>'` per table, so AsanPay becomes a normal tenant with zero special-cased code and zero data loss.

AsanPay's own tenant row is created first (before adding NOT NULL constraints), then every existing table gets backfilled in the same migration that adds the `tenant_id` column, before the column is made NOT NULL + RLS is enabled — this avoids any window where rows are orphaned/invisible.

## Provider API model (clarified)

- Provider APIs (Noble, VyaparAPI) ← only our backend (`api.asanpay.in`) talks to these directly; provider credentials/secrets stay only with us.
- Tenants ← only call `api.asanpay.in` with their own API key; they never see which underlying provider is used.
- This is **value-added API service, not raw reselling** — important distinction for provider contract terms and RBI/BC compliance. See `07-api-reselling.md`.
