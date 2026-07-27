# Explicitly Not Decided Yet

- **Coolify custom-domain + Let's Encrypt automation mechanics** — whether new tenant domains can be registered dynamically via Coolify's API at onboarding time, or require a manual per-tenant step.
- **Whether `api_clients`/`api_ip_whitelist` are per-tenant or platform-level** — depends on the outcome of API reselling (see `07-api-reselling.md`).
- **Mobile app white-labeling strategy** — separate builds per partner vs. a single build with runtime theming. React Native runtime theming can handle colors/logo, but app name, bundle ID, and store listing cannot change without separate builds per partner.
- **Exact shape of `tenant_commission_overrides`** — a new table vs. extending `commission_rules` with a `tenantId` column and reusing the existing `findActiveRule` logic.
