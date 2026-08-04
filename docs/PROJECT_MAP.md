# Project Map (1-page)

> Product: **AsanPay**. Packages: `@asanpay/*`.

## Apps & ports

| App | Package | Port | Users |
|-----|---------|------|-------|
| admin-portal | `@asanpay/admin-web` | 3000 | admin |
| agent-portal | `@asanpay/web` | 3001 | super dist, distributor, retailer |
| backend | `@asanpay/backend` | 4000 | API |
| mobile (`apps/asanpay-mobile-app`) | `@asanpay/mobile` | Metro 8081 | same as agent-portal (agent) |

## Data stores

| Store | Used for | Config |
|-------|----------|--------|
| **PostgreSQL** | users, wallets, ledger, txns, commission | `DATABASE_URL` |
| **MongoDB** | audit logs, OTP, provider logs | `MONGODB_URI` |
| **Redis** | env set, queues (future) | `REDIS_URL` |

## Backend modules

```
apps/backend/src/modules/
  auth/          login, register, OTP, txn PIN
  wallet/        balance, fund, transfer
  users/         downline
  catalog/       service tiles (Mongo/Postgres)
  transactions/  AEPS, DMT, BBPS, recharge
  commission/    slab engine
  providers/     Eko, PaySprint adapters
```

## Money flow

```
Admin fund load → Super Dist wallet → Distributor wallet → Retailer wallet
Retailer txn → aggregator → commission up the chain
```

## Role hierarchy

```
admin → super_distributor → distributor → retailer
```

Onboard: `POST /api/auth/register` (authenticated parent only)

## Packages

| Package | Purpose |
|---------|---------|
| `@asanpay/shared-types` | Types, roles, portal enums |
| `@asanpay/auth` | Portal access checks, role labels |
