# Wallet engine — pinned leftovers queue

> Durable pin of Cursor todos + Wallet Engine spec leftovers.

## Status

| # | Task | Status |
|---|------|--------|
| 1 | [Admin: Fund dual-approve limit (₹) in DB](32-fund-dual-approve-setting.md) | **done** |
| 2 | Settlement bank change OTP (+ 24h cooling) | **done** |
| 3 | Automated penny-drop stub on verify | **done** |
| 4 | Settlement charges + `returned` path | **done** |
| 5 | Bank-specific VAN webhook adapters (`X-Van-Bank`) | **done** |
| 6 | 500 concurrent load smoke script | **done** |
| 7 | `logs` schema stub + non-owner role SQL script | **done** |
| 8 | Multi-tenant: `tenants.settings` (full users/wallets retrofit still XL later) | **done** (scoped) |

## Queue complete

All code leftovers from this pin are shipped. Ops only:

1. Coolify redeploy backend + admin-web
2. EC2 SSH: `sudo docker exec -it <backend> sh -c 'npm run db:migrate'`
3. Optional: `scripts/sql/create-app-readonly-role.sql` as superuser
4. Optional: `CONCURRENCY=500 node scripts/load-test-wallet-me.mjs` against staging

## Full users/wallets tenant_id retrofit

Still a separate XL white-label project — not part of this leftovers pin.
