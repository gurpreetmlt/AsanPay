# Task 26 — White-label branding (config-driven)

## What this is

Backend/database/core logic stay **shared across all brands**. Each white-label
client gets its own frontend deployment (own domain, own name/tagline via env
vars), pointing at the same API.

## What's config-driven now

- `apps/web/lib/brand.ts` — `brand.name`, `brand.tagline` read from
  `NEXT_PUBLIC_BRAND_NAME` / `NEXT_PUBLIC_BRAND_TAGLINE`, default to AsanPay.
- `apps/admin-web/lib/brand.ts` — same pattern.
- Both apps' `app/layout.tsx` (browser tab title) — same env vars.
- Admin login screen heading (`{brand.name} Admin`) — reads from config.

## What's still hardcoded (by design, for now)

- The **logo SVG** (`components/brand/Logo.tsx` in both apps) — hand-drawn
  wordmark "Asan" + "Pay" spans, brand colors baked into the gradient defs.
  A new client needs either: (a) a new logo component swapped in per
  deployment, or (b) a proper logo-upload system (out of scope until a real
  white-label client is being onboarded — no point building it speculatively).
- Color tokens (`B` object in both `brand.ts` files) — still hardcoded blue/
  green AsanPay palette. Same reasoning as the logo: wire this to env/config
  once a second brand actually needs different colors.

## Launching a new brand (once a real client exists)

1. New Coolify application, same GitHub repo, same `apps/web` or
   `apps/admin-web` Dockerfile — just a new domain.
2. Set env vars on that new app:
   ```
   NEXT_PUBLIC_BRAND_NAME=ClientBrand
   NEXT_PUBLIC_BRAND_TAGLINE=Their tagline here
   API_URL=https://api.asanpay.in/api   # same shared backend
   ```
3. Swap `Logo.tsx` for that deployment (until logo-upload exists).
4. Deploy. No backend change, no database change — same tenant-less shared
   backend unless/until the business actually needs per-client data isolation
   (that's a separate, bigger decision — flag it before building it).
