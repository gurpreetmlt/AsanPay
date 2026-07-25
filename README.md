# AsanPay

B2B agent fintech platform — AEPS, DMT, BBPS, recharge.

## Architecture

```
Admin (separate URL)     →  apps/admin-web       :3000
Agent portal (single login) → apps/web           :3001
                              Super Distributor, Distributor, Retailer
Mobile (Android, AsanPay) → apps/mobile (@asanpay/mobile)
Backend API                →  apps/backend        :4000
```

### Role hierarchy

```
Admin (platform control)  →  Super Distributor  →  Distributor  →  Retailer
```

- **Admin** is a separate portal with full platform control — not an agent role.
- **Login:** No role dropdown — backend returns role in JWT; UI routes automatically.
- **Admin portal:** `portal: "admin"` — username `admin` + password only (OTP disabled).
- **Agent web + mobile:** `portal: "agent"` — Super Distributor, Distributor, Retailer.

### Money flow

```
Admin loads float
    ↓ fund transfer (double-entry ledger)
Super Distributor wallet
    ↓
Distributor wallet
    ↓
Retailer wallet → customer services
```

## Quick start

See [`LOGIN.md`](LOGIN.md) and [`AGENTS.md`](AGENTS.md).
