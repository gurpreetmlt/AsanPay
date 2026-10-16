# Tax & Commission — product queue

> Owner ask: commission / slab clarity; **TDS on all commission products**; **GST on DMT fee**.
> **Earnings UX (Fullimit-style):** Super Dist · Distributor · **Retailer mobile** — same Home + My Earnings pattern.
> **Retailer web** earnings layout = **parked** (owner will specify later).
> Aligns with: [19-commission-schemes.md](19-commission-schemes.md) · [28-commission-payout-report.md](28-commission-payout-report.md) · [33-noble-commercials.md](33-noble-commercials.md).
>
> **Rule:** 1 chat = 1 row marked **CURRENT**. Do not start later rows in the same chat.
> After each ship: mark `done`, promote next to `CURRENT`, Coolify (+ EC2 migrate if schema) + verify.
> **UI:** English only · AsanPay brand (not Fullimit purple / Hinglish taglines).
> **Parity:** SD/Dist = web + mobile. Retailer earnings screens = **mobile first**; web later (TC21).
> **Money:** ledger rules; rates in DB + `effective_from` — no hardcoded %.
> **CA lock before TC05+:** TDS % / section · DMT GST exclusive vs inclusive · no-PAN rate.

---

## Reference UX — earnings (Fullimit → AsanPay)

### Roles

| Role | Home + My Earnings | Platforms |
|------|--------------------|-----------|
| Super Distributor | Yes (downline = Distributors) | Web + mobile |
| Distributor | Yes (downline = Retailers) | Web + mobile |
| Retailer | Yes (**Product-wise only** — no downline tab) | **Mobile now**; web = TC21 parked |

### 1) Home (all three roles — mobile; SD/Dist also web)

| Element | Behavior |
|---------|----------|
| **Balance** card | Main wallet balance |
| **Earnings** card | CTA **Report** → **My Earnings** |
| **Today's Earnings** row | `Today's Earnings: ₹X` + arrow → **My Earnings** (today pre-filled) |
| Optional later | Show net; tap for Gross / TDS / Net |

### 2) My Earnings — Downline-wise (SD & Dist only)

| Element | SD | Dist |
|---------|----|------|
| Toggle | **Distributor-wise** \| Product-wise | **Retailer-wise** \| Product-wise |
| Total badge | N Active Distributors | N Active Retailers |
| Search | Name, UID, shop | Name, UID, shop |
| Row | Avatar · name · shop · **+₹** · mobile · chevron | Same for retailers |
| Chevron | Expand → product / txn breakdown (TC11) | Same |

**Retailer:** no Downline-wise tab (no network).

### 3) My Earnings — Product-wise (SD · Dist · Retailer mobile)

| Element | Behavior |
|---------|----------|
| Toggle | Product-wise (Retailer: this is the primary / only list mode) |
| Total card | TOTAL EARNINGS ₹ · badge **N Active Services** |
| Row | Service icon · name · **Vol: ₹…** · **+₹ earning** · EARNING |
| Services | AePS CW, DMT, Referral, recharge, etc. (whatever credited) |

### Tax on these screens (after TC03)

- List amounts = **net credited** (wallet).
- Expand / detail: **Gross · TDS · Net**.
- DMT **fee GST** on txn receipt / fee breakdown — not mixed into earning row total.

---

## Ship order

| # | Task | Size | Status | Notes |
|---|------|------|--------|-------|
| **TC01** | Product glossary + money layers (docs only) | S | done | `flow/11-tax-commission.md` |
| **TC02** | Tax config schema (TDS + GST flags per service) | M | done | `tax_service_configs` · migration `0066` · `GET /admin/commission/tax-config` |
| **TC03** | Commission calc: gross · TDS · net on credit | L | done | `commission_ledger` tax cols · TDS in `distributeCommissionForTxn` (wallet = net) |
| **TC04** | DMT fee GST in pricing path | M | done | `transactions.customer_fee_gst` · debit total includes GST · journal fee+GST |
| **TC05** | Admin Tax settings UI | M | done | `/commission` Tax tab · `PATCH /admin/commission/tax-config/:id` |
| **TC06** | Admin preview includes tax | S | done | Preview shows Gross · TDS · Net + tax flags |
| **TC07** | Home: Balance · Earnings Report · Today's Earnings | M | done | Home strips + Report → My Earnings (SD/Dist web+mobile; Retailer mobile). Retailer web parked (TC21) |
| **TC08** | My Earnings screen shell + APIs | M | done | `/api/earnings/*` · mobile `MyEarnings` · web `/earnings` (SD/Dist). Product summary + empty; downline tab = Coming soon until TC09 |
| **TC09** | My Earnings — Downline-wise tab | M | done | `GET /earnings/by-downline` + search; web+mobile |
| **TC10** | My Earnings — Product-wise tab | M | done | Vol + Earning; retailer mobile only-tab; SD/Dist toggle |
| **TC11** | My Earnings — row expand / detail | M | done | Downline→products; product→txns; Gross/TDS/Net |
| **TC12** | Nav wiring | S | done | Home / Report / Account / WalletBar → My Earnings |
| **TC13** | Admin tax registers + CSV | M | done | Admin Commercials → Tax registers · TDS + DMT GST CSV |
| **TC14** | Provider margin vs scheme underwater warn | S | done | Preview `providerPool` → underwater banner when scheme gross > pool |
| **TC15** | Vyapar / provider commission ingest | L | done | Raw store `POST /admin/commission/provider-ingest` + table `provider_commission_ingest` (0067). **Parse rules still need Vyapar sample** — do not invent field map |
| **TC16** | Monthly TDS summary + PAN banner | S | done | Mobile Account Tax card + PAN banner · `GET /earnings/tds-summary` |
| **TC17** | Noble commercials hook (33A) | L | **blocked** | Task 33 paths still TBD + CA open questions — full Noble engine = Task 33A (migration). Success path already uses `distributeCommissionForTxn` + TDS |
| **TC18** | Reversal / refund tax clawback | M | done | `commission_ledger.reversed_at` (0067) · `clawbackCommissionForTxn` · dispute refund + admin `POST /admin/commission/clawback/:transactionId` |
| **TC19** | Admin Commercials IA polish | S | done | Tab IA: Schemes · Tax · Tax registers · Payouts (+ Preview on schemes) |
| **TC20** | Smoke + checklist | S | done | Queue TC01–14 + TC16 done; TC15/17/18 blocked; checklist updated |
| **TC21** | Retailer **web** earnings UX | M | done | Product-wise `/earnings` for retailer · Home Today’s Earnings · Money nav |
| **TC22** | Retailer confirm / receipt earn lines (optional) | M | done | `GET /earnings/estimate` · Est. net + Gross/TDS/Net on recharge/DMT (mobile + web) |

---

## Out of scope (this queue)

- Cloning Fullimit brand / Hinglish taglines
- Full GSTR-1 / 26Q filing (CSV through TC13)
- Settlement cycle changes
- OTP on reverse / transfer
- Retailer **web** My Earnings until TC21 unparked

---

## Depends / already shipped

| Piece | Where |
|-------|--------|
| Scheme CRUD + preview | Task 19 · admin `/commission` |
| Payout report | Task 28 |
| `distributeCommissionForTxn` | commission module |
| Dashboard / home commission snippets | partner + retailer — extend TC07 |
| Noble GST/TDS notes | Task 33 |

---

## Open decisions (owner / CA)

| # | Question | Default until answered |
|---|----------|-------------------------|
| 1 | TDS % / section | 2% on commission excl GST |
| 2 | No-PAN TDS rate | Same 2% + banner |
| 3 | DMT GST exclusive or inclusive | Exclusive |
| 4 | Home Today's Earnings = gross or net? | **Net**; detail Gross/TDS/Net |
| 5 | Retailer My Earnings second tab? | **Product-wise only** (no downline). Txn list via expand (TC11) |
| 6 | Retailer **web** earnings | **Wait** (TC21) |
| 7 | Vyapar per-txn vs EOD | Estimate then confirm |

---

## Verify matrix

| # | Where | Check | Expected |
|---|--------|-------|----------|
| TC01 | `flow/` | Layers + role UX | SD/Dist/Retailer mobile noted |
| TC02–06 | Admin / calc | As before | |
| TC07 | Home SD/Dist web+mobile; Retailer mobile | Today's Earnings + Report | Opens My Earnings |
| TC08 | My Earnings all roles | Shell + API | Retailer total = own commission |
| TC09 | SD/Dist only | Downline tab | Hidden for retailer |
| TC10 | Product-wise | Vol + earning | Retailer mobile works |
| TC11 | Expand | Detail + tax lines | Retailer product→txns |
| TC12 | Entrypoints | Nav | Retailer mobile wired |
| TC13–20 | As row | | |
| TC21 | Agent web retailer | My Earnings product-wise | Works |
| TC22 | Confirm/receipt | Est. net lines | Mobile + web recharge/DMT |

---

## Prompt for next chat

```
@docs/TASKS/tax-commission-queue.md @AGENTS.md
Unblock TC17: fill Task 33 Read ONLY paths + CA answers, then implement 33A.
OR paste Vyapar commission sample JSON to finish TC15 parse mapping.
No explore. No MCP. Mac Terminal cmds in reply.
```
