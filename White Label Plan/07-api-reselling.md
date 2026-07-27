# API Reselling to Tenants (Phase 2, business decision required first)

## Model

- **Instantpay/Paysprint API** ← only our backend (`api.asanpay.in`) talks to these directly; provider credentials/secrets stay only with us.
- **Tenants** ← call `api.asanpay.in` directly using their own API key/secret (bypassing the UI entirely) for their own system integrations — DMT/AEPS/BBPS/Payout initiation, status checks, etc.
- Request flow: tenant's API-key request → our backend applies commission/margin waterfall → calls the actual provider (Instantpay/Paysprint) → processes response → returns to tenant.

This is **value-added API service, not raw provider reselling** — an important distinction:
- *Reselling* = passing through a provider's raw API unchanged, with no work added.
- *Our model* = tenants access **our own product** (wallet, commission engine, hierarchy, compliance layer) which happens to be built on top of a provider API — same structure as the existing Retailer/Distributor hierarchy, just adding an "API-only tenant" access type.

## Required before implementation (business/legal, not code)

1. **Check provider contracts** (Paysprint, Instantpay, etc.) — confirm the agreement allows sublicensing/reselling access to downstream partners. If a contract restricts use to "your own platform only," this needs provider sign-off first.
2. **RBI/BC compliance check** — AEPS/DMT is regulated Business Correspondent activity. Confirm with legal/compliance that letting tenants operate through their own API access under our BC license structure is permitted.
3. **API documentation + developer portal** — if this proceeds, tenants' developers need proper docs (OpenAPI/Swagger).

## Technical fit

Already fits the planned architecture: `api_clients` table (existing) can become tenant-scoped, rate-limited, and usage-billed as a new revenue layer on top of the commission waterfall. See `03-schema-and-tables.md` for the `api_clients` note.

## Status

Flagged as a **future consideration**, not committed to a phase yet — needs the business/legal check above before any implementation planning.
