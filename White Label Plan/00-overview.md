# AsanPay White-Label Multi-Tenant Plan — Overview

## Context

AsanPay currently runs as a single-tenant fintech platform (AEPS/DMT/BBPS/Payout agent banking). The business wants to sell the same platform to partner companies under their own branding/domain, while we keep the backend, wallet, and provider connections. This requires retrofitting multi-tenancy onto a live production system with real user/wallet/transaction data — so isolation correctness (no cross-tenant data leaks) and safe migration of existing data are the two hard constraints.

This is a large (XL) feature — implementation should be split across multiple dedicated sessions, not done in one pass.

## Files in this folder

- `01-current-state-audit.md` — what the codebase already has/lacks (as of this audit)
- `02-core-decisions.md` — the 3 confirmed architecture decisions (domain, isolation, migration)
- `03-schema-and-tables.md` — which tables need `tenant_id`, which stay global, new tables needed
- `04-implementation-steps.md` — the ordered list of backend/frontend changes for core rollout
- `05-admin-dashboards.md` — Super Admin vs Tenant Admin structure
- `06-tenant-staff-roles.md` — internal staff invite system (Sales Manager/ASM/Support/Finance)
- `07-api-reselling.md` — reselling `api.asanpay.in` access directly to tenants (Phase 2)
- `08-future-suggestions.md` — additional ideas discussed, not yet committed to a phase
- `09-open-items.md` — things explicitly not decided yet
- `10-verification.md` — how to test isolation/idempotency/commission correctness once built

## Status

Discussion/architecture phase only — **no code has been written yet**. This folder is the source of truth for what was decided across planning sessions; implementation happens in separate follow-up sessions, one scoped piece at a time (per project convention: 1 session = 1 task).
