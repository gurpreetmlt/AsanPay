# Tax & Commission — product queue

> Owner ask: commission / slab clarity for Admin · SD · Dist · Retailer; **TDS on all commission products**; **GST on DMT fee**.
> Aligns with existing: [19-commission-schemes.md](19-commission-schemes.md) · [28-commission-payout-report.md](28-commission-payout-report.md) · [33-noble-commercials.md](33-noble-commercials.md).
>
> **Rule:** 1 chat = 1 row marked **CURRENT**. Do not start later rows in the same chat.
> After each ship: mark `done`, promote next to `CURRENT`, Coolify (+ EC2 migrate if schema) + verify.
> **UI:** English only · web + mobile parity for agent-facing · no Hinglish product copy.
> **Money:** paise/decimal rules as ledger; rates in DB + `effective_from` — no hardcoded %.
> **CA lock before TC05+:** TDS % / section · DMT GST exclusive vs inclusive · no-PAN rate.

## Ship order (foundation → agent UX → reports)

| # | Task | Size | Status | Notes |
|---|------|------|--------|-------|
| **TC01** | Product glossary + money layers (docs only) | S | **CURRENT** | Provider pool vs chain split vs customer fee vs TDS vs GST — one page in `flow/` so UI copy stays consistent |
| **TC02** | Tax config schema (TDS + GST flags per service) | M | pending | DB: `tds_percent`, `gst_on_fee_percent`, `tds_applies`, `gst_on_fee_applies`, `effective_from`, version id. Seed defaults (TDS ~2% draft; GST 18% on DMT only). Admin read API |
| **TC03** | Commission calc: attach tax components on credit | L | pending | On `distributeCommissionForTxn` (and peers): store gross · TDS · net; ledger/commission_ledger columns or child rows. Skip float transfer/reverse. Reversal path stubs |
| **TC04** | DMT fee GST in pricing path | M | pending | Customer/agent fee breakdown: fee excl + GST (or inclusive — per CA). Persist on txn. Does **not** replace CCF rules — only tax on fee |
| **TC05** | Admin Tax settings UI | M | pending | `/commission` or Commercials: Tax tab — per-service toggles, %, effective date, preview box |
| **TC06** | Admin commission preview includes tax | S | pending | Existing preview: show Retailer/Dist/SD gross → TDS → net + company keep; DMT sample shows fee+GST |
| **TC07** | Retailer: estimate earn on confirm (recharge first) | M | pending | Vyapar/prepaid confirm: “Est. commission ₹X (TDS ₹Y → net ₹Z)”. Web + mobile. Provisional if provider amount late |
| **TC08** | Retailer: DMT confirm breakdown | M | pending | Amount · Fee · GST · Total · Est. commission / TDS / net. Web + mobile |
| **TC09** | Success receipt + ledger lines (tax visible) | M | pending | Receipt + passbook/ledger: Commission · TDS · (DMT) GST on fee. Same labels web/mobile |
| **TC10** | My rates (read-only) for Retailer / Dist / SD | M | pending | Cards + optional slab table from role scheme (+ override badge). No edit. Nav under Money / Settings |
| **TC11** | Earnings strip + commission-only list | M | pending | Home/Balance: Today · Month · TDS this month. Tap → filtered ledger. Web + mobile |
| **TC12** | SD / Dist team earnings (read-only) | M | pending | Downline commission totals (month) — amounts only, not others’ slab secrets |
| **TC13** | Admin tax registers + CSV export | M | pending | TDS payable by agent/month; GST on DMT taxable+GST. Export for CA |
| **TC14** | Provider margin vs scheme “underwater” warn | S | pending | Admin: if chain split + tax &gt; expected provider pool → warn (Vyapar/Noble margin when available) |
| **TC15** | Vyapar / provider commission ingest | L | pending | Map provider commission/cashback fields → pool; confirm vs estimate. Needs provider sample payload from owner |
| **TC16** | Monthly agent TDS summary + PAN banner | S | pending | Agent Settings: month TDS total; incomplete PAN → English banner (rate TBD with CA) |
| **TC17** | Noble commercials hook (33A overlap) | L | pending | Only if Noble live: reuse TC02–TC03 config; do not fork second tax engine — extend [33-noble-commercials.md](33-noble-commercials.md) |
| **TC18** | Reversal / refund tax clawback | M | pending | Failed or refunded txn reverses TDS/GST/commission consistently |
| **TC19** | Admin Commercials IA polish | S | pending | Single nav: Schemes · Overrides · Tax · Payouts · Preview (wire existing 19/28 + new) |
| **TC20** | Smoke + checklist pack | S | pending | End-to-end: recharge + DMT + admin export; update `docs/CHECKLIST.md` |

## Out of scope (this queue)

- Full GSTR-1 / 26Q filing product (CSV for CA is enough through TC13)
- Changing settlement bank cycles
- Hinglish UI
- OTP on reverse / transfer

## Depends / already shipped (do not rebuild)

| Piece | Where |
|-------|--------|
| Scheme CRUD + preview API | Task 19 · admin `/commission` |
| Payout report | Task 28 |
| `distributeCommissionForTxn` | commission module |
| Dashboard today commission | agent dashboards |
| Noble GST/TDS design notes | Task 33 (33A paths; 33B wait) |

## Open decisions (owner / CA — fill before TC05)

| # | Question | Default assumption until answered |
|---|----------|-----------------------------------|
| 1 | TDS % and section (194H?) | 2% on commission excl GST |
| 2 | No / invalid PAN TDS rate | Same 2% until banner; higher rate later |
| 3 | DMT GST exclusive or inclusive | Exclusive (fee + 18% shown separately) |
| 4 | Which wallets get commission net? | Same as today commission credit |
| 5 | Show Dist/SD split on retailer receipt? | No — only own net |
| 6 | Vyapar: per-txn commission field or EOD only? | Estimate at txn; confirm when API allows |

## Verify matrix (fill as each TC## ships)

| # | Where | Check | Expected |
|---|--------|-------|----------|
| TC01 | `flow/` doc | Layers named | Pool / split / fee / TDS / GST defined |
| TC02 | Migrate + admin GET | Flags | DMT gst_on_fee on; recharge tds on; transfer tds off |
| TC03 | Test txn commission | Ledger | Gross, TDS, net rows reconcile |
| TC04 | DMT quote/confirm | Fee | GST line present |
| TC05 | Admin Tax tab | Save | Versioned effective_from |
| TC06 | Admin preview | Numbers | Tax columns visible |
| TC07 | Retailer recharge confirm | Copy | Est. net after TDS |
| TC08 | Retailer DMT confirm | Copy | Fee + GST + tax on commission |
| TC09 | Receipt + ledger | Labels | English Gross / TDS / Net |
| TC10 | Agent My rates | Read-only | Matches scheme |
| TC11 | Earnings strip | Totals | Match commission_ledger |
| TC12 | SD/Dist team | List | Own downline only |
| TC13 | Admin export | CSV | Opens in Excel; sums match |
| TC14 | Admin preview | Warn | Underwater when over-allocated |
| TC15 | Provider txn | Pool | Matches sample payload |
| TC16 | Settings | Banner | PAN incomplete → message |
| TC17 | Noble path | No fork | Same tax config tables |
| TC18 | Refund | Balances | Tax + commission reversed |
| TC19 | Admin nav | IA | One Commercials cluster |
| TC20 | Checklist | Docs | CHECKLIST updated |

## Prompt for next chat

```
@docs/TASKS/tax-commission-queue.md @AGENTS.md
Implement CURRENT only (TC01). No explore. No MCP. Mac Terminal cmds in reply.
```
