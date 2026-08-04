# 06 — Network, active, reassign

## Agent network
- `GET /api/users/network` — tree + direct downline + upline (Dist/Retailer)
- `PATCH /api/users/:id/active` — SD/Dist only, **direct children**
- UI: [`apps/agent-portal/app/network/page.tsx`](../apps/agent-portal/app/network/page.tsx)

## Admin reassign
- `POST /api/admin/users/:id/reassign` `{ newParentId | newParentUid }`
- Rebuilds `user_hierarchy` closure; wallets unchanged
- UI: agent detail [`apps/admin-portal/app/users/[id]/page.tsx`](../apps/admin-portal/app/users/[id]/page.tsx)
