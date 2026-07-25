# AsanPay — Agent Efficiency Plan

> **Global:** Cursor `~/.cursor/rules/token-efficiency.mdc` · Claude `~/.claude/CLAUDE.md`
> **Kit:** `~/Documents/AI-Agent-Plan/` (copy to any new project)

## Project extras
| Rule | Detail |
|------|--------|
| Brand | AsanPay · `@asanpay/*` |
| DB | Postgres only · Redis cache optional |
| Ignore | `partner-web`, `retailer-web` |
| Creds | `LOGIN.md` |
| Tasks | `docs/TASKS/INDEX.md` → one file |
| Done | `docs/CHECKLIST.md` → new chat |
| **Git attribution** | **Never** `Co-authored-by: Cursor/Claude/Anthropic` · no `Made-with: Cursor` · see below |

## Git — no AI co-authors (hard rule)

Commit / PR messages must stay **human-only**. Do **not** add:

- `Co-authored-by: Cursor <cursoragent@cursor.com>`
- `Co-authored-by: Claude … <noreply@anthropic.com>`
- `Made-with: Cursor` / any Cursor or Anthropic trailer

**Enforced by:**

1. Cursor CLI: `~/.cursor/cli-config.json` + project `.cursor/cli.json` → `attributeCommitsToAgent: false`
2. Hook: `scripts/git-hooks/prepare-commit-msg` via pre-commit (`prepare-commit-msg` stage) — run once:
   `bash scripts/install-git-hooks.sh`
3. IDE: **Cursor Settings → Agents (or Git & PRs) → Attribution → OFF**
4. Claude Code: `~/.claude/settings.json` (+ project `.claude/settings.json`):
   `includeCoAuthoredBy: false` and `attribution: { commit: "", pr: "" }`

Agents: never put those strings in `-m` / HEREDOC commit messages either.

## Terminal (Mac)
```bash
cd "/Users/gurpreetchauhan/Desktop/AsanPay"
npm run dev:backend
npm run db:migrate
bash scripts/install-android.sh
```

## Prompt
```
@docs/TASKS/XX.md @AGENTS.md
[goal]. No explore. No MCP. Mac Terminal cmds in reply.
```

## Size
S/M = 1 chat · L/XL = split · never one-shot full features

## Docs
`AGENTS.md` · `CLAUDE.md` · `TASKS/INDEX.md` · `ROADMAP.md` · `CHECKLIST.md`

<!-- webhook test -->
