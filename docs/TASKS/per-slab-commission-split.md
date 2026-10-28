# Per-slab commission split (PL-29)

**Goal:** When a "Provider pays" slab is edited from the rate card table, the admin also sets Retailer /
Distributor / SD for **that slab only**, each as **% of what the company gets** or **flat ₹ per txn**.
Provider pays per slab → roles paid per slab.

**Size:** M–L · backend (migration + payout resolution) + admin. No agent web / mobile UI.

## Read ONLY
- `apps/backend/src/db/postgres/schema/commission.ts` (`commissionShares`)
- `apps/backend/src/modules/commission/rateCard.config.ts` (`loadRateConfig`, `roleDefaultFor`, `ShareRow`)
- `apps/backend/src/modules/commission/rateCard.math.ts` (`resolveRoleGross`, `pickRow`)
- `apps/backend/src/modules/commission/rateCard.service.ts` (`setCommissionShare`, `computeSplit`, `getRateCard`, `applyPreviewDraft`)
- `apps/backend/src/modules/admin/admin.routes.ts` (`/rate-card/shares`, `/rate-card/preview`)
- `apps/admin-portal/components/commission/rateCard/RateCardScreen.tsx` (`inlineRow`)
- `apps/admin-portal/components/commission/rateCard/roleSplit.ts`

## Why today's model cannot do it
- `commission_shares` has no slab bounds → a % share is service-wide.
- A flat ₹ per slab is possible as a slab `commission_rules` row, but `resolveRoleGross` lets **any share
  beat any fixed rule**, so a service-wide % silently overrides the slab ₹.

## Design
1. **Migration `0087_commission_share_slabs.sql`** on `commission_shares`:
   - `min_amount numeric(14,2) null`, `max_amount numeric(14,2) null` (inclusive, same as other slab tables)
   - `share_type varchar(10) not null default 'percent'` (`percent` | `flat`)
   - `flat_amount numeric(14,2) null` (set when `share_type = 'flat'`; `share_percent` stays `0` then)
   - Existing rows = service-wide % (no data change).
2. **Resolution (`roleDefaultFor` → shares):** own picker, not `pickRow`:
   provider-specific > **slab-bounded beats unbounded** > newest `effective_from` > higher `min_amount`.
   Pass the txn amount (today shares ignore it).
3. **`resolveRoleGross`:** share `flat` → `toPaise(flat_amount)` even when provider income is null;
   share `percent` → unchanged (needs provider income). Still: override → share → fixed rule → none.
4. **Writes:** `setCommissionShare` accepts `minAmount`, `maxAmount`, `shareType`, `flatAmount`;
   same-scope close includes bounds. Validation: flat ≤ `MAX_FLAT_COMMISSION_RUPEES`, % 0–100.
5. **Rate card read:** each slab's `roles[]` already carries `shareId`; add `shareMin`, `shareMax`,
   `shareType`, `flatAmount` so the UI knows if the role is slab-specific or service-wide.
6. **Preview draft:** add `slabShares?: Array<{ role, minAmount, maxAmount, shareType, value }>`
   (applied like `shares`, bounded) so the live calculation updates before Save.
7. **Admin inline slab editor:** "Commission split" gets a scope switch —
   **This slab** (default) | All slabs. This slab → POST `/rate-card/shares` with the slab bounds and
   `shareType`; editing again closes the same-bounds row. Show "Service default" placeholder when the
   role has no slab row. "Remove slab split" → DELETE that share (falls back to the service default).
8. **Tests:** `test/rateCard.test.ts` — slab share beats service share; flat share pays without provider
   income; old unbounded shares unchanged; preview draft slab share.

## Deploy
Mac push → Coolify backend + admin-portal redeploy → **EC2 SSH** `npm run db:migrate` (auto on boot,
manual re-run is safe). No APK.

## Done check
- [ ] Cash Withdraw ₹100–199.99: Retailer ₹0 flat, ₹2,000–2,099.99: Retailer 80 % → payout matches preview
- [ ] Service-wide share still applies to slabs without their own split
- [ ] Live calculation + table row show the slab split before and after Save
