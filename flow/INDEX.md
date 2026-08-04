# AsanPay — Flow Index (for AI agents)

> **Read this first**, then open **one** flow file. Do not explore the whole repo.

Product: **AsanPay** · Roles: `admin` → `super_distributor` (Super Dist) → `distributor` → `retailer`

## Hierarchy (money)

```
Admin mint float → Super Dist → Distributor → Retailer
Parent can also Collect (Wapas) ← child OTP + parent txn PIN
```

## Flow files

| File | Topic |
|------|--------|
| [01-roles-hierarchy.md](01-roles-hierarchy.md) | Role features matrix |
| [02-auth-login.md](02-auth-login.md) | Login / OTP / MPIN / portals |
| [03-signup-sponsor.md](03-signup-sponsor.md) | Signup role + upline mobile mapping |
| [04-wallet-fund-transfer.md](04-wallet-fund-transfer.md) | Mint + downline fund |
| [05-wallet-pull-otp.md](05-wallet-pull-otp.md) | Wapas / collect with child OTP |
| [06-network-active.md](06-network-active.md) | Network tree, active, reassign |
| [07-admin-portal.md](07-admin-portal.md) | Admin web (:3000) |
| [08-agent-web.md](08-agent-web.md) | Agent web (:3001) |
| [09-mobile.md](09-mobile.md) | Android agent app |
| [10-services-retailer.md](10-services-retailer.md) | AEPS / DMT / BBPS notes |

Also: [`AGENTS.md`](../AGENTS.md) · [`docs/TASKS/INDEX.md`](../docs/TASKS/INDEX.md) · [`LOGIN.md`](../LOGIN.md)
