# Verification Plan (once implementation begins)

- **RLS isolation**: write a test that opens two DB sessions with different `app.tenant_id` values and confirms cross-tenant SELECT/UPDATE returns zero rows / fails, even bypassing application code (direct SQL).
- **Idempotency across tenants**: existing `apps/backend/test/walletConcurrencyLoad.test.ts` pattern extended with two tenants running concurrent transactions with the same `idempotencyKey` value (different tenants) to confirm no false-positive collision.
- **Commission waterfall**: unit test computing full payout split (our margin → tenant margin → hierarchy) against known fixture amounts.
