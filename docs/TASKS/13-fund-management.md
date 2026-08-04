# Task 13 — Fund Management

## Size: M

## Goal
Admin load float; distributor fund request; admin approve.

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/wallet/wallet.routes.ts` | POST /fund |
| `apps/admin-portal/app/dashboard/page.tsx` | Admin fund UI |
| `apps/agent-portal/app/dashboard/page.tsx` | Partner fund UI |

## Roles
- Admin: `POST /wallet/fund` (self or `targetUserId` = direct Super Dist) — no `/wallet/transfer`
- Super Dist → Distributor / Distributor → Retailer: `POST /wallet/transfer`
- SD/D: `PATCH /users/:id/active` (direct children only)
- Admin tree move: `POST /admin/users/:id/reassign` (`newParentId` or `newParentUid`)

## May need NEW
- `fund_requests` table + routes (if not exists — check schema first)

## Test
Admin funds MD → MD funds distributor → dist funds retailer

## Done when
- [x] Admin can load master float
- [x] Downline fund from web works with PIN
- [x] Retailer fund-request UI → `POST /api/fund-requests` (+ list)
- [x] Admin fund-request queue → approve / reject `/api/fund-requests`
