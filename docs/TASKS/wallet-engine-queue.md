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

Wallet-engine MVP queue (27A–27D) is finished. New work → pick from `docs/TASKS/INDEX.md` or ROADMAP.

## Leftovers (out of MVP scope)

### Done in wallet-engine finish pass
- [x] Float management (`/api/float` + admin `/float`) — bank→transit→float maker-checker
- [x] VAN assign API + Banking UI tab (`POST /banking/van/assign`)
- [x] Settlement bank 24h cooling after bank change
- [x] Fund-request dual admin above `FUND_APPROVE_DUAL_RUPEES` (default ₹2L)
- [x] Ledger reports UI (`/ledger-reports` + `GET /admin/ledger/health`)
- [x] Receipt PDF (existing) + ESC/POS (`GET /txn/:txnRef/receipt.escpos`)
- [x] Light concurrent smoke script `scripts/load-test-wallet-me.mjs`

### Still deferred (separate / ops)
- OTP on settlement bank change (cooling is in place; SMS OTP not wired)
- Automated penny-drop (admin verify remains manual)
- Settlement charges / fee schedule + full `returned` bank-return path
- Bank-specific VAN webhook payload adapters
- Full 500 concurrent money load test on EC2
- Partitioned `logs` schema + non-owner DB role
- Full multi-tenant retrofit on legacy tables

## After each task
1. Set that row to `done`, next row to `CURRENT`.
2. Next task file @-mentioned; same chat OK unless XL / heavy context (then new chat).
3. Deploy steps only if backend changed (Coolify redeploy; APK not needed for API-only).
