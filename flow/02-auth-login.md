# 02 — Auth / login

## Portals
- `portal: "admin"` → only `admin` role (Admin web)
- `portal: "agent"` → `super_distributor` | `distributor` | `retailer` (Agent web + mobile)

## Paths
| Action | API |
|--------|-----|
| Password login | `POST /api/auth/login` |
| OTP request / verify | `POST /api/auth/otp/request` · `/otp/verify` |
| MPIN login | `POST /api/auth/mpin/login` |
| Me | `GET /api/auth/me` (JWT; rechecks `isActive`) |
| Txn PIN set/verify | `POST /api/auth/txn-pin` · `/txn-pin/verify` |

## Key files
- [`apps/backend/src/modules/auth/auth.service.ts`](../apps/backend/src/modules/auth/auth.service.ts)
- [`apps/agent-portal/app/login/page.tsx`](../apps/agent-portal/app/login/page.tsx)
- [`apps/admin-portal/app/login/page.tsx`](../apps/admin-portal/app/login/page.tsx)
- Creds: [`LOGIN.md`](../LOGIN.md) only
