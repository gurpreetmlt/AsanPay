# Tax & Commission — feature-rich queue

> Owner: build these one-by-one; **agent commits + pushes**; **ALERT before any migration**.
> **Rule:** 1 chat = 1 row marked **CURRENT**. Do not start later rows in the same chat.
> After each ship: mark `done`, promote next to `CURRENT`, Coolify (+ EC2 migrate only if schema).
> UI English only. Web ↔ mobile parity for agent-facing changes.
> **Blocked until owner input:** Vyapar sample JSON (TC15 parse) · Noble Task 33 paths + CA (TC17).

## Pin / ship order

| # | Task | Size | Status | Notes |
|---|------|------|--------|-------|
| **TCR01** | Admin sidebar Tax & Commission section (bugfix) | S | done | `87d76e5` — `SidebarNav` lists `TAX_COMMISSION` |
| **TCR02** | Clawback visibility on payouts + registers | M | done | `clawback=active\|clawed\|all` + “Clawed back” badge on payouts + TDS register |
| **TCR03** | Underwater daily ops report | M | done | `/tax-commission/underwater` · `GET /admin/commission/underwater-report` · Open scheme deep-link |
| **TCR04** | What-if calculator (admin) | M | done | `/tax-commission/what-if` · reuses `POST /admin/commission/preview` |
| **TCR05** | Bulk scheme CSV import/export | L | done | Admin UI: `SchemesCsvPanel` on `/tax-commission/schemes` (export + dry-run → apply) |
| **TCR06** | Agent override inbox | M | done | Admin UI: inbox + revert on `/tax-commission/overrides` |
| **TCR07** | CA month pack (26Q / GSTR helpers) | M | done | Admin UI: `/tax-commission/ca-pack` (individual CSVs, no zip dep) |
| **TCR08** | PAN gap list | S | done | Admin UI: `/tax-commission/pan-gaps` |
| **TCR09** | Home expandable Gross/TDS on Today’s Earnings | S | done | Web + mobile home expand Gross/TDS/Net |
| **TCR10** | Passbook commission tax expand | M | done | Web wallet/statements + mobile passbook `tax` expand |
| **TCR11** | TDS / PAN missing alerts | M | done | Admin `pan_gap` alert + agent web/mobile PAN banner (WhatsApp later) |
| **TCR12** | Rate change audit trail | M | done | Admin UI: `/tax-commission/rate-audit` · table `commission_rate_change_events` |
| **TCR13** | Commission recon board | L | done | Admin UI: `/tax-commission/recon` |
| **TCR14** | Month freeze / lock window | L | done | Admin UI: `/tax-commission/month-lock` · table `commission_tax_month_locks` |
| **TCR15** | Vyapar parse mapping | L | blocked | Needs sample payload from owner |
| **TCR16** | Noble 33A commercials | XL | blocked | Task 33 paths + CA — new chat + migrate alert |

## Prompt for next chat (blocked rows only)

```
@docs/TASKS/tax-commission-rich-queue.md @AGENTS.md
TCR15 blocked until Vyapar sample JSON from owner.
No explore. No MCP.
```

## Depends

- Product queue: `tax-commission-queue.md` (TC15 parse / TC17 still blocked)
- Admin IA: `tax-commission-admin-ia-queue.md` (TCA complete)
