# Wallet Engine — pending queue

> One chat = one task. Mark status when done. Agents: open **only** the current task file.

## Status

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Fund request + banking HTTP | [27A-fund-request-http.md](27A-fund-request-http.md) | done |
| 2 | Ledger recon cron | [27B-ledger-recon-cron.md](27B-ledger-recon-cron.md) | done |
| 3 | Settlements module | [27C-settlements.md](27C-settlements.md) | done |
| 4 | VAN + webhook auto-credit | [27D-van-webhook.md](27D-van-webhook.md) | **CURRENT** |

## Start prompt (paste in new Agent chat, Auto mode)

```
@docs/TASKS/27D-van-webhook.md @AGENTS.md
Implement this task only. No explore. No MCP. Mac Terminal cmds in reply.
When done: mark 27D done in docs/TASKS/wallet-engine-queue.md, update docs/CHECKLIST.md if needed.
```

## After each task
1. Set that row to `done`, next row to `CURRENT`.
2. New chat with the next task file @-mentioned (do not continue XL work in the same chat).
3. Deploy steps only if backend changed (Coolify redeploy; APK not needed for API-only).

## 27C leftovers (out of MVP scope)
- OTP + 24h cooling period when changing settlement bank
- Automated penny-drop (admin verify endpoint is manual)
- Settlement charges / fee schedule
- `returned` bank return path beyond fail+reversal
