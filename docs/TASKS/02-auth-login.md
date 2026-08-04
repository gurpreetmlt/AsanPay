# Task 02 — Auth & Login

## Read first
- [`LOGIN.md`](../../LOGIN.md)
- `packages/shared-types/index.ts` — roles, portals
- `packages/auth/src/index.ts` — portal guards

## Backend
| File | What |
|------|------|
| `apps/backend/src/modules/auth/auth.service.ts` | login, OTP, register |
| `apps/backend/src/modules/auth/auth.validators.ts` | schemas (`portal` field) |
| `apps/backend/src/modules/auth/auth.routes.ts` | routes |
| `apps/backend/src/middleware/rbac.middleware.ts` | requireRole |

## Frontends
| App | Login file | Portal value |
|-----|------------|--------------|
| admin-web | `app/login/page.tsx` | `"admin"` |
| web | `app/login/page.tsx` | `"agent"` |
| mobile | `src/screens/LoginScreen.tsx` | `"agent"` |

## API
```
POST /api/auth/login     { mobile, password, portal }
POST /api/auth/otp/request
POST /api/auth/otp/verify
POST /api/auth/register  (auth required, hierarchy)
```

## Roles
`admin` | `super_distributor` (Super Distributor UI) | `distributor` | `retailer`

## Do NOT
- Role dropdown on login UI
- Trust client role — always JWT + backend guard
