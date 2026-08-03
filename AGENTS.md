# AsanPay — Agent Guide (read this first)

AI editor token bachane ke liye **poori repo mat padho**. Sirf is file + relevant task file.

## Quick links

| Need | Read |
|------|------|
| **App flows (AI)** | [`flow/INDEX.md`](flow/INDEX.md) |
| Login / URLs | [`LOGIN.md`](LOGIN.md) |
| **AI efficiency (global + project)** | [`docs/AGENT_PLAN.md`](docs/AGENT_PLAN.md) · Claude: [`CLAUDE.md`](CLAUDE.md) |
| What's next (phases) | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Done / pending | [`docs/CHECKLIST.md`](docs/CHECKLIST.md) |
| Task index | [`docs/TASKS/INDEX.md`](docs/TASKS/INDEX.md) |
| Architecture map | [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) |

## Branding

- **Product name:** AsanPay (use this exact name in UI and agent docs)
- **npm workspaces:** `@asanpay/*` (e.g. `@asanpay/backend`, `@asanpay/mobile`)
- **Folder path:** `apps/mobile`
- **UI language:** English only in all product frontends (web / admin / mobile). Owner may command in Hinglish; never ship Hinglish UI copy. Rule: [`.cursor/rules/ui-english-only.mdc`](.cursor/rules/ui-english-only.mdc)
- **App flows (AI):** [`flow/INDEX.md`](flow/INDEX.md)

## Repo layout (cheat sheet)

```
Frontend/            Public marketing site (:3002) — Log in / Sign up → Agent Web
apps/
  admin-web/         Admin panel (:3000) — admin role only
  web/               Agent portal (:3001) — super dist, dist, retailer
  backend/           Express API (:4000) — Postgres only (Neon in prod)
  mobile/            AsanPay Android app (pkg @asanpay/mobile)
  partner-web/       LEGACY — use apps/web
  retailer-web/      LEGACY — use apps/web
packages/
  shared-types/      Roles, API types (no runtime deps)
  auth/              Portal guards, role helpers
```

## Stack

- **Web:** Next.js 16, React 19, Tailwind 4, Zustand
- **Mobile:** RN CLI 0.76, Android only, TypeScript
- **Backend:** Express 5, Drizzle + Postgres (single DB). Redis optional (cache only).
- **Roles:** `admin` | `master_distributor` (UI: Super Distributor) | `distributor` | `retailer`

## Auth rule

- Login API: `POST /api/auth/login` with `{ mobile, password, portal: "admin"|"agent" }`
- Admin portal → only `admin`
- Agent portal (web + mobile) → `master_distributor`, `distributor`, `retailer`

## Key files (most tasks)

| Area | Path |
|------|------|
| Auth service | `apps/backend/src/modules/auth/auth.service.ts` |
| Auth routes | `apps/backend/src/modules/auth/auth.routes.ts` |
| User schema | `apps/backend/src/db/postgres/schema/users.ts` |
| Agent web login | `apps/web/app/login/page.tsx` |
| Admin login | `apps/admin-web/app/login/page.tsx` |
| Mobile login | `apps/mobile/src/screens/LoginScreen.tsx` |
| Shared types | `packages/shared-types/index.ts` |

## Agent rules (token saving)

1. **Task file pehle** — `docs/TASKS/INDEX.md` → pick ONE file (~30 lines)
2. **AGENT_PLAN.md** — prompt templates, chat split, Terminal + MCP rules
3. **L task = split chats** — ROADMAP dekho, XL mat ek chat mein daalo
4. **Glob mat chalao** — task file ke "Read ONLY" paths direct kholo
5. **Legacy ignore** — `partner-web`, `retailer-web`, unused `packages/db`
6. **LOGIN.md** — credentials ke liye alag search mat karo
7. **Task done** → `docs/CHECKLIST.md` update karo; next task same chat OK — naya chat sirf jab required ho (L/XL split, bloated context)
8. **MCP default off** — browser / Figma / Datadog / etc. sirf jab task ya user explicitly maange; exploratory MCP mat. Details: [`docs/AGENT_PLAN.md`](docs/AGENT_PLAN.md#mcp-rule-same-token-discipline-as-code-tools)
9. **No AI git attribution** — kabhi mat likho `Co-authored-by: Cursor|Claude|Anthropic`, `cursoragent@cursor.com`, `Made-with: Cursor`. Details: [`docs/AGENT_PLAN.md`](docs/AGENT_PLAN.md)
10. **InstantPay parity rule** — koi bhi InstantPay-backed service tab tak complete mat maano jab tak `apps/web` aur `apps/mobile` dono mein entrypoint + usable flow na ho, ya doc mein explicit platform exception likhi ho. Audit note: [`InstantPay/PARITY.md`](InstantPay/PARITY.md)

## Terminal (Mac only — agent shell mat)

Build / install / migrate / dev / seed **Mac Terminal** mein chalao — agent shell mat. Agent **copy-paste commands** de, andar na chalaaye. Details: [`docs/AGENT_PLAN.md`](docs/AGENT_PLAN.md#terminal-rule-mac-only--agent-shell-mat-use-karo).

```bash
# Android install (phone USB on)
cd "/Users/gurpreetchauhan/Desktop/AsanPay"
bash scripts/install-android.sh

# Web + API dev
npm run dev
npm run dev:backend
npm run dev:mobile    # Metro — alag Terminal window
npm run db:migrate
npm run seed:admin -w @asanpay/backend
npm run seed:mpin -w @asanpay/backend
```
