# 01 — Roles & hierarchy features

```mermaid
flowchart TD
  Admin -->|"POST /wallet/fund mint"| SD[SuperDist]
  SD -->|"POST /wallet/transfer"| Dist[Distributor]
  Dist -->|"POST /wallet/transfer"| Ret[Retailer]
  SD -->|"POST /wallet/pull"| Dist
  Dist -->|"POST /wallet/pull"| Ret
```

| Role | Money | Network / control | Surfaces |
|------|--------|-------------------|----------|
| **Admin** | Mint float only (`/wallet/fund`). No hierarchy transfer | Users, KYC, reassign parent, activate anyone | Admin web :3000 |
| **Super Dist** | Fund direct Distributors; Reverse from Dist (txn PIN, same as Transfer) | Tree, activate direct Dist, onboard Dist | Agent web + mobile |
| **Distributor** | Fund direct Retailers; Reverse from Retailer (txn PIN, same as Transfer) | Tree, activate retailers, onboard / sponsor signup | Agent web + mobile |
| **Retailer** | Spend on services; cannot fund downline | Sees upline only | Agent web + mobile |

## Key APIs
- Fund down: `POST /api/wallet/transfer` (SD, Dist) + txn PIN
- Reverse / collect: `POST /api/wallet/pull/confirm` + parent txn PIN only (no child OTP)
- Admin mint: `POST /api/wallet/fund`
- Network: `GET /api/users/network` · Active: `PATCH /api/users/:id/active`
- Admin move: `POST /api/admin/users/:id/reassign`

## Key code
- [`apps/backend/src/modules/wallet/wallet.service.ts`](../apps/backend/src/modules/wallet/wallet.service.ts)
- [`apps/backend/src/modules/users/users.service.ts`](../apps/backend/src/modules/users/users.service.ts)
- [`apps/backend/src/modules/admin/admin.service.ts`](../apps/backend/src/modules/admin/admin.service.ts)
