# Task 20 — Production Env

## Size: S

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/.env.example` | All vars |
| `apps/mobile/src/lib/api.ts` | Mobile API URL |
| `apps/agent-portal/.env.local` | Web API URL |
| `docs/TASKS/08-vps-deploy.md` | Deploy steps |

## Checklist
- [ ] Strong JWT secrets (32+ chars)
- [ ] `CORS_ORIGIN` = production domains
- [ ] `NEXT_PUBLIC_API_URL` on web apps
- [ ] Mobile `API_BASE` = VPS URL
- [ ] OTP dev echo OFF (`NODE_ENV=production`)
- [ ] `.env` never committed

## Do NOT put production secrets in LOGIN.md — use `LOGIN.production.md` (gitignored)
