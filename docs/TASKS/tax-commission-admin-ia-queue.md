# Tax & Commission — Admin IA (Treasury-style)

> Owner: own sidebar group **Tax & Commission** (not under Treasury).
> Pattern: Treasury & Balance — group children + `SectionTabs`.
> **Rule:** 1 chat row **CURRENT**. Agent push after each ship. **Alert user if migration needed.**
> No DB migration expected for TCA01–TCA04 (routes + UI only).

## Pin / ship order

| # | Task | Size | Status | Notes |
|---|------|------|--------|-------|
| **TCA01** | Sidebar group + SectionTabs + route shell | M | done | Group **Tax & Commission**; `/tax-commission/*`; redirect `/commission` |
| **TCA02** | Overview page (cards + quick links) | M | done | Month TDS / fee GST / payout totals — existing APIs |
| **TCA03** | Split workbench by route (Schemes · Tax · Registers · Payouts) | M | done | `CommissionWorkbench` + SectionTabs |
| **TCA04** | Header search + legacy redirects polish | S | done | AdminHeader + `/commissions` → schemes |
| **TCA05** | Overrides list page (optional) | M | done | Search agents → `/users/:id#commission` |
| **TCA06** | Smoke + checklist | S | done | Nav + tabs + redirect; checklist updated — **queue complete** |

## Out of scope here
- Vyapar ingest / Noble / clawback (tax-commission-queue TC15/17/18)
- Moving Service charges into this group (unless owner asks)
- Retailer web earnings (TC21)

## Prompt

```
Queue complete (TCA01–06). Next product work: tax-commission-queue TC15/17/18 (blocked) or other INDEX task.
```
