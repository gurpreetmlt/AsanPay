# AsanPay — Claude Code

Global rules: `~/.claude/CLAUDE.md` (always).

## This project
- Brand: **AsanPay** · `@asanpay/*` · `apps/mobile`
- DB: **PostgreSQL only** · Redis = optional cache · **No Mongo**
- Map: `AGENTS.md` · Plan: `docs/AGENT_PLAN.md` · Tasks: `docs/TASKS/INDEX.md`
- Creds: `LOGIN.md` (never commit secrets)
- **Git:** no `Co-authored-by: Cursor/Claude/Anthropic` · no `Made-with: Cursor` (see `docs/AGENT_PLAN.md`)

## Every session
```
@AGENTS.md @docs/TASKS/XX.md
[goal]. No explore. No MCP. Mac Terminal cmds in reply.
```

1 task file only → read listed paths → implement → CHECKLIST → new session.
