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
| **TCR05** | Bulk scheme CSV import/export | L | **CURRENT** | **Alert if migration** for import audit log |
| **TCR06** | Agent override inbox | M | pending | Custom rates list, expiry, revert |
| **TCR07** | CA month pack (26Q / GSTR helpers) | M | pending | Zip/summary around existing TDS + DMT GST CSV |
| **TCR08** | PAN gap list | S | pending | Agents with TDS and no PAN → KYC link |
| **TCR09** | Home expandable Gross/TDS on Today’s Earnings | S | pending | Web + mobile |
| **TCR10** | Passbook commission tax expand | M | pending | Web + mobile |
| **TCR11** | TDS / PAN missing alerts | M | pending | In-app first; WhatsApp later if wired |
| **TCR12** | Rate change audit trail | M | pending | **Alert if migration** |
| **TCR13** | Commission recon board | L | pending | Ledger vs wallet vs gaps |
| **TCR14** | Month freeze / lock window | L | pending | **Alert if migration** |
| **TCR15** | Vyapar parse mapping | L | blocked | Needs sample payload from owner |
| **TCR16** | Noble 33A commercials | XL | blocked | Task 33 paths + CA — new chat + migrate alert |

## Prompt for next chat

```
@docs/TASKS/tax-commission-rich-queue.md @AGENTS.md
CURRENT TCR05. Commit+push yourself. Alert before any migration.
No explore. No MCP. Mac Terminal cmds in reply only if I must run something.
```

## Depends

- Product queue: `tax-commission-queue.md` (TC15 parse / TC17 still blocked)
- Admin IA: `tax-commission-admin-ia-queue.md` (TCA complete)
