# Task 04 — Agent Web UI

## App
`apps/agent-portal` — port 3001 — `@asanpay/web`

## Role-based UI
| Role | Dashboard |
|------|-----------|
| retailer | Services grid (`CategorySection`) |
| super_distributor / distributor | Downline + fund (`DownlineTable`) |

## Key files
| Path | Purpose |
|------|---------|
| `app/login/page.tsx` | Single login |
| `app/dashboard/page.tsx` | Role switch |
| `lib/roles.ts` | isPartnerRole, isRetailerRole |
| `lib/store.ts` | Zustand auth |
| `lib/api.ts` | Axios + refresh |
| `components/layout/Sidebar.tsx` | Nav |

## Env
`NEXT_PUBLIC_API_URL=http://localhost:4000/api`

## Do NOT edit
- `apps/partner-web`, `apps/retailer-web` unless deprecating
