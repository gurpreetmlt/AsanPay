# Task — Wallet Hierarchy

## Size: M

## Goal
Enforce Admin → Super Distributor → Distributor → Retailer for money + network control.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/wallet/wallet.service.ts` | Scoped fund / transfer |
| `apps/backend/src/modules/wallet/wallet.routes.ts` | Admin fund-only; SD/D transfer |
| `apps/backend/src/modules/users/users.service.ts` | Network + child active |
| `apps/backend/src/modules/admin/admin.service.ts` | Reassign parent |
| `apps/agent-portal/app/network/page.tsx` | Network visibility + toggle |
| `apps/admin-portal/app/users/[id]/page.tsx` | Admin network-move UI |

## Rules
- Admin: `POST /wallet/fund` (self or direct Super Dist) — **no** `/wallet/transfer`
- Super Dist → Distributor / Distributor → Retailer: `POST /wallet/transfer` (direct child + role pair + active)
- Collect (Wapas): `POST /wallet/pull/request` + `/pull/confirm` (child OTP + parent txn PIN)
- SD/D: `PATCH /users/:id/active` (direct children only)
- Admin tree move: `POST /admin/users/:id/reassign` (`newParentId` or `newParentUid`)
- Network: `GET /users/network` (tree + upline; retailers see upline only)

## Done when
- [x] Admin mints float to Super Dist only; cannot hierarchy-transfer
- [x] Transfer enforces parent + role pair + active target
- [x] Pull/Wapas with child OTP + parent PIN (Agent Web)
- [x] SD/D can activate/deactivate direct children
- [x] Admin can reassign parent (hierarchy rebuild)
- [x] Agent web Network shows tree + toggles; Wallet funds downline with PIN
- [x] Agent flow docs in [`flow/`](../../flow/INDEX.md)
