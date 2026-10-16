# Treasury & Balance — ease & match queue

> Owner ask: make bank / agent / API money easy to understand and match.
> **Rule:** 1 chat = 1 row marked **CURRENT**. Do not start later rows in the same chat.
> After each ship: mark `done`, promote next to `CURRENT`, give Coolify cmds + verify steps.

## Ship order (easy → high impact)

| # | Task | Size | Status | Notes |
|---|------|------|--------|-------|
| **TB01** | Cash picture strip (bank / books / diff / pending) without running Reconcile | M | done | Admin Bank & deposits top |
| **TB02** | Simple match labels + tip for old codes (`suspense` → Needs review, etc.) | S | done | Reconcile UI copy |
| **TB03** | Explain this line (why unmatched + next step CTA) | M | **CURRENT** | Per recon row |
| TB04 | Unified activity feed (Bank / Agent / API filters) | L | pending | New tab or panel |
| TB05 | Agent ↔ bank link + “Open in Reconcile” jump | M | pending | Fund request / bank entry rows |
| TB06 | Provider ledger strip (In / Out / Fees / wallet impact) | M | pending | Separate from bank CR/DR |
| TB07 | Daily close checklist wizard | L | pending | Upload → recon → resolve → close |
| TB08 | Export + daily email / WhatsApp summary | M | pending | Build on PDF/CSV/XLS |
| TB09 | Duplicate / double-credit guard (UTR / amount+date) | M | pending | Warn before credit / import |
| TB10 | Wrong-bank detector stronger (block Import) | S | partial | Verify strip exists — harden |
| TB11 | Partial / Likely match + 1-click Confirm | M | pending | Amount match, UTR miss |
| TB12 | Bulk resolve unmatched (ignore / entry / link) | M | partial | Bulk bank entry exists — extend |
| TB13 | Role views (admin full; agent own deposits only) | M | pending | Agent portal + API gate |
| TB14 | Audit trail (who match/unmatch/delete, when, why) | M | pending | Timeline UI |
| TB15 | Opening / closing balance lock + mid-day drift | L | pending | Per bank per day |
| TB16 | Rules engine (UTR prefix → category) | L | pending | Admin-configurable |
| TB17 | Search everywhere (UTR / amount / agent / mobile) | M | pending | Treasury global search |
| TB18 | Mobile-friendly recon (admin light or owner) | L | pending | Platform exception OK if admin-web only first |
| TB19 | Sandbox vs live / Test entries hardened | S | partial | Test flag exists — visual harden |
| TB20 | Treasury health score (%) | M | pending | Matched % + gaps + stale statements |

## Already shipped (related, not in this queue)

- Reconcile upload 50/50, Clear+Preview → Clear+Import, preview/verify animation
- Export PDF / CSV / XLS after Run reconciliation
- Test entry Delete (void) passbook UUID fix
- Bank verify strip on upload (basic)

## Verify matrix (fill as each TB## ships)

| # | Where to click | What to check | Expected |
|---|----------------|---------------|----------|
| TB01 | Admin → Bank & deposits (page top, any tab) | Cash picture strip loads on open | Bank = latest statement balance, Books = ledger for those banks, Difference = statement minus books, Pending = unmatched credit amount. No Reconcile click. Missing statement shows — and “Upload a statement…”. |
| TB02 | Bank & deposits → Reconciliation → Run reconciliation | Status tiles + row pills + tip strip | Labels: Matched, Needs review, Likely match, Amount differs, In bank only, In books only. Tip maps old codes (suspense → Needs review, etc.). Hover tile/pill shows meaning. Upload history: “needs review” not “in suspense”. |
| … | | | |

## Prompt for next chat

```
@docs/TASKS/treasury-balance-ease-queue.md @AGENTS.md
Implement CURRENT only. No explore. No MCP. Mac Terminal cmds in reply.
```
