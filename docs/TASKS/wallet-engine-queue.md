# Wallet Engine — pending queue

> One chat = one task. Mark status when done. Agents: open **only** the current task file.

## Status

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Fund request + banking HTTP | [27A-fund-request-http.md](27A-fund-request-http.md) | done |
| 2 | Ledger recon cron | [27B-ledger-recon-cron.md](27B-ledger-recon-cron.md) | done |
| 3 | Settlements module | [27C-settlements.md](27C-settlements.md) | done |
| 4 | VAN + webhook auto-credit | [27D-van-webhook.md](27D-van-webhook.md) | done |

## Queue complete

Wallet-engine MVP queue (27A–27D) is finished. New work → pick from `docs/TASKS/INDEX.md` or ROADMAP in a **new chat**.

## Leftovers (out of MVP scope)

### 27C
- OTP + 24h cooling period when changing settlement bank
- Automated penny-drop (admin verify endpoint is manual)
- Settlement charges / fee schedule
- `returned` bank return path beyond fail+reversal

### 27D
- VAN provisioning / assign API for agents (table exists; webhook credits existing rows)
- Bank-specific payload adapters (generic HMAC body only)
- Admin UI for suspense resolution of unidentified VAN credits

## After each task
1. Set that row to `done`, next row to `CURRENT`.
2. New chat with the next task file @-mentioned (do not continue XL work in the same chat).
3. Deploy steps only if backend changed (Coolify redeploy; APK not needed for API-only).
