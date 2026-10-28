# AsanPay — Agent Guide (read this first)

AI editor token bachane ke liye **poori repo mat padho**. Sirf is file + relevant task file.

## Quick links

| Need | Read |
|------|------|
| **App flows (AI)** | [`flow/INDEX.md`](flow/INDEX.md) |
| Login / URLs | [`LOGIN.md`](LOGIN.md) |
| **AI efficiency (global + project)** | [`docs/AGENT_PLAN.md`](docs/AGENT_PLAN.md) · Claude: [`CLAUDE.md`](CLAUDE.md) |
| What's next (phases) | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| **Planned features (owner)** | [`docs/PLANNING.md`](docs/PLANNING.md) |
| Done / pending | [`docs/CHECKLIST.md`](docs/CHECKLIST.md) |
| Task index | [`docs/TASKS/INDEX.md`](docs/TASKS/INDEX.md) |
| Architecture map | [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) |

## Branding

- **Product name:** AsanPay (use this exact name in UI and agent docs)
- **npm workspaces:** `@asanpay/*` (e.g. `@asanpay/backend`, `@asanpay/mobile`)
- **Folder path:** `apps/asanpay-mobile-app` (npm name is `@asanpay/mobile` — the folder and the
  package name deliberately differ; every script points at the folder)
- **UI language:** English only in all product frontends (web / admin / mobile). Owner may command in Hinglish; never ship Hinglish UI copy. Rule: [`.cursor/rules/ui-english-only.mdc`](.cursor/rules/ui-english-only.mdc)
- **App flows (AI):** [`flow/INDEX.md`](flow/INDEX.md)

## Repo layout (cheat sheet)

```
Frontend/            Public marketing site (:3002) — Log in / Sign up → Agent Web
apps/
  admin-portal/         Admin panel (:3000) — admin role only
  agent-portal/               Agent portal (:3001) — super dist, dist, retailer
  backend/           Express API (:4000) — Postgres only (Neon in prod)
  asanpay-mobile-app/ AsanPay Android app (pkg @asanpay/mobile)
packages/
  shared-types/      Roles, API types (no runtime deps)
  auth/              Portal guards, role helpers
```

### Portal decision (4 Aug 2026)

**Two portals, permanently.** Admin stays its own app (`apps/admin-portal`) — it holds fund
approval, allocation, recon adjustment and agent-block controls, and those must never be
reachable from an agent's browser. All three agent roles (SD / Distributor / Retailer) share
**one** `apps/agent-portal`, rendered by role. They overlap ~80% (wallet, network, transactions,
settlements, passbook, support); splitting them is what left `partner-web` and `retailer-web`
as 54 MB of abandoned duplicates. Role separation is enforced server-side (`requireAuth`
re-reads role + `isActive` from the DB on every request), not by shipping separate bundles.

`apps/partner-web` and `apps/retailer-web` were deleted on 4 Aug 2026. To bring either back:

```bash
git checkout legacy-webapps-before-delete -- apps/partner-web apps/retailer-web
```

The tag is pushed to origin, so it survives regardless of branch state.

## Stack

- **Web:** Next.js 16, React 19, Tailwind 4, Zustand
- **Mobile:** RN CLI 0.76, Android only, TypeScript
- **Backend:** Express 5, Drizzle + Postgres (single DB). Redis optional (cache only).
- **Roles:** `admin` | `super_distributor` (UI: Super Distributor) | `distributor` | `retailer`

## Auth rule

- Login API: `POST /api/auth/login` with `{ mobile, password, portal: "admin"|"agent" }`
- Admin portal → only `admin`
- Agent portal (web + mobile) → `super_distributor`, `distributor`, `retailer`

## Key files (most tasks)

| Area | Path |
|------|------|
| Auth service | `apps/backend/src/modules/auth/auth.service.ts` |
| Auth routes | `apps/backend/src/modules/auth/auth.routes.ts` |
| User schema | `apps/backend/src/db/postgres/schema/users.ts` |
| Agent web login | `apps/agent-portal/app/login/page.tsx` |
| Admin login | `apps/admin-portal/app/login/page.tsx` |
| Mobile login | `apps/asanpay-mobile-app/src/screens/LoginScreen.tsx` |
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
10. **Provider service parity rule** — koi bhi provider-backed service (AePS, DMT, Recharge, BBPS…) tab tak complete mat maano jab tak `apps/agent-portal` aur `apps/asanpay-mobile-app` dono mein entrypoint + usable flow na ho, ya doc mein explicit platform exception likhi ho.
11. **Web ↔ Mobile same change** — agent UI (icons, animations, CTAs, tiles, copy) web pe change kiya to usi chat/PR mein mobile pe bhi; mobile pe kiya to web pe bhi. Alag wave mat chhodo. Rule: [`.cursor/rules/web-mobile-parity.mdc`](.cursor/rules/web-mobile-parity.mdc)
12. **UI wire first (Coming soon → working)** — naya feature pehle nav/tile mein dikhao (`Coming soon` jab tak flow ready na ho); complete hone pe unlock. Orphan API mat chhodo. Rule: [`.cursor/rules/wire-features-into-ui.mdc`](.cursor/rules/wire-features-into-ui.mdc)

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
