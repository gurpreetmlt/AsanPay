# Commission rate card + share % (PL-14)

**Size:** L — 5 chats (RC1 → RC5). **Surfaces:** backend, admin web. Agent apps unchanged (they keep
reading earnings from the API).
**Replaces for daily use:** Tax & Commission → Schemes / What-if / Underwater. Those pages move to an
"Advanced" tab; nothing is deleted.

## Problem
Commission is set as one rule per service × provider × role × amount slab (₹ or %). Admin must fill
every slab for every role, the provider must be "Noble" or "All" or the txn silently pays ₹0, and the
margin is only visible on a separate What-if page. Customer fee lives elsewhere (Platform Control →
Service charges), so the real company margin is never on one screen.

## Target
One **Rate card** screen: one row per service (slab rows inside AEPS cash withdrawal etc.), columns
**Provider pays · Retailer · Distributor · SD · Company keeps**, plus a live preview.

Two ways to set a role's earning, per service:
- **Share %** of what the provider pays (default): e.g. Retailer 60 % · Distributor 10 % · SD 5 % →
  Company keeps the rest. A provider rate change flows through automatically.
- **Fixed** ₹ / % of amount (today's model) for services where the provider pays nothing (e.g. DMT
  where income is the customer fee).

## Read ONLY
- `apps/backend/src/db/postgres/schema/commission.ts` — `commission_rules`, `user_commission_rates`, `service_charges`, month locks, rate-change events
- `apps/backend/src/modules/commission/commission.service.ts` — rule resolution + distribution
- `apps/backend/src/modules/commission/commission.rich.service.ts`, `commission.guards.ts` (month lock, rate-change audit)
- `apps/admin-portal/components/commission/CommissionWorkbench.tsx`, `apps/admin-portal/app/tax-commission/what-if/page.tsx`
- `apps/admin-portal/components/layout/AdminShell.tsx`, `SectionTabs.tsx` (nav)
- `docs/TASKS/33-noble-commercials.md` (provider income rules — 33A)

## RC1 — backend: provider income + share config ✅ built 27 Oct
**Built:** migration `0078_rate_card` (`provider_payout_rules`, `commission_shares`, seeds 60/10/5
null-provider shares for every active service). Pure math `commission/rateCard.math.ts` (tests
`test/rateCard.test.ts`), config loader `rateCard.config.ts` (used by live payout, agent estimate and
preview — one path), endpoints in `rateCard.service.ts`:
- `GET /admin/rate-card?providerId=` → `services[]` with `shares`, `shareTotalPercent`,
  `providerIncomeRules`, `customerFeeRules`, `tax`, `slabs[]` (sampleAmount, providerIncome,
  customerFee, customerFeeGst, `roles[]` {source share|rule|none, gross, tds, net}, companyKeeps,
  underwater, missingRoles).
- `POST /admin/rate-card/preview` `{serviceId, amount, providerId?}` → same split shape.
- `POST /admin/rate-card/shares` `{serviceId, providerId?, role, sharePercent, effectiveFrom?, reason}`
  (closes the open row; returns `warning` when total > 100 %) · `DELETE /admin/rate-card/shares/:id` `{reason}`.
- `POST /admin/rate-card/provider-income` `{serviceId, providerId?, ruleType, value, capAmount?, minAmount?,
  maxAmount?, effectiveFrom?, reason}` · `DELETE /admin/rate-card/provider-income/:id` `{reason}`.
- Writes: reason ≥ 3 chars, month lock, rate audit (`entityType` `share` / `provider_income`).
- Shares only pay once provider income exists for that service → zero payout change until admin
  enters provider income. Old What-if (`/commission/preview`) still shows fixed rules only.

- Provider income per txn (what the provider pays us) from versioned config (33A table if it exists,
  else new `provider_payout_rules`: service, provider, slab, flat / % / cap, `effective_from`).
- New `commission_shares` (service, provider nullable = all, role, share % of provider income,
  `effective_from`). Resolution order: agent override → share → fixed rule → none.
- `GET /admin/rate-card` (rows + resolved numbers per slab), `POST /admin/rate-card/preview`
  `{serviceId, amount}` → per-role ₹, company ₹, customer fee, GST / TDS lines, `underwater: boolean`.
- Paise integers, half-up per component. Month-lock + rate-change audit reused.
- Unit tests: share math, slab edges, cap, override wins, missing provider income → falls back to fixed rule.

## RC2 — admin: Rate card screen
- Route `/tax-commission/rate-card`, first item in the Tax & Commission menu.
- Table per service; inline edit; Save opens a confirm popup (popup-design rule) with a required reason.
- Live preview panel: amount input (default per service, e.g. ₹2,000 CW) → who earns what; red
  "Company loses ₹x" when underwater.
- Provider selector defaults to **All providers**.

## RC3 — safety
- Red "No commission set" chip on any active service with no share / rule for a role.
- Warn when a share total > 100 % or a fixed payout > provider income.
- Locked month: inputs read-only with "March 2026 is locked for filing".
- Effective-from defaults to now; scheduling a future date shows "Starts 1 Nov".

## RC4 — navigation
- Tax & Commission sidebar: **Rate card · Payouts · Tax · Advanced** (Advanced = Schemes (raw rules),
  Overrides, What-if, Underwater, Registers, CA pack, PAN gaps, Rate audit, Recon, Month lock as tabs).
- Header search keeps every old keyword working; old URLs keep working.

## RC5 — agent detail page: "Commission" card (replaces `AgentCommissionPanel` table)
Today (`components/users/AgentCommissionPanel.tsx`): every catalog service (~40 rows incl. not-live
Loans / Insurance / Nepal) with %‑dropdown + empty value + green ON toggle + Clear. Problems: the role
default is never shown (admin types blind), ON is green even with no value, AEPS = one rate for
withdraw / mini / deposit / balance (no slabs), no preview, no upline impact, no reason, no expiry
(schema has `expires_at`), internal codes shown, vague toasts ("Save failed").

New card (same data as the Rate card — one source):
- Header: "Uses role rates" or "3 custom rates" chip · "Reset all to role rates".
- Live services only, grouped; "Not live yet (6)" collapsed.
- Row: Service · **Role rate** (read-only, from rate card, e.g. "60 % of provider ≈ ₹6.40 on ₹2,000") ·
  **This agent** ("Role rate" chip or custom value with a blue "Custom" badge) · Earns on sample amount
  · Expires (optional date) · Edit / Reset.
- AEPS: slab rows like the Rate card (CW slabs, mini statement flat).
- Bulk: "Set for all Bill payments" with one value.
- Upline line: "Distributor ASPD… earns ₹x less" / red "Company loses ₹x" when over provider income.
- Sticky save bar: "3 changes · Reason (required) · Save" → confirm popup (popup-design).
- Field-specific errors (clear-error-messages), last 5 rate changes for this agent with a link to Rate audit.

## Open decisions
- [x] Provider income source → new `provider_payout_rules` table (no 33A table existed).
- [x] Default shares per role → Retailer 60 % · Distributor 10 % · SD 5 % (seeded).
- [x] Customer fee in the Rate card row → yes, read from `service_charges` (same data as Platform Control).

## Done check
- [ ] Admin sets AEPS CW for all roles from one row; preview matches the paid commission on a test txn
- [ ] Missing rule shows red on the Rate card; no silent ₹0 payouts
- [ ] Old pages reachable under Advanced; `docs/CHECKLIST.md` + PLANNING PL-14 updated
