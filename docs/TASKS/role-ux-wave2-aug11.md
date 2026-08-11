# Role UX wave 2 (Aug 2026) — `feat/role-ux-wave2-aug11`

## Status: DONE

1. Retailer home **Do next** strip (web + mobile)
2. Distributor **onboarding funnel** counts
3. Super Distributor **downline snapshot** + **Top Dist by volume (MTD)**
4. Admin **fund request Aging** chip
5. Admin **KYC Queue Docs preview**
6. Super Distributor **credit/limit (low float) alerts** + **bulk transfer to Dist** + **commissionMtdByDist** table
7. Distributor **today’s collection** (volume / cash-in / payouts) + **Hot retailers today** + **inactive WhatsApp nudge** + **ledger partner/date filters**
8. Retailer **favorites pin max 3** (web + mobile) + **receipt print/share** + **daily earnings chip** + **failed txn Retry/Support**
9. Admin **network tree** View / Freeze / Move
10. Admin **bulk bank verify** (Settlements → banks)
11. Admin agent detail **Health strip** (KYC / bank / balance / last txn)
12. Shared **empty states with 1 CTA** (network / transactions / settlements + EmptyState slot)
13. Shared **search UID + mobile + name** (agent header → network/txns; admin header → `/users?q=`)
14. **Notification center** — admin bell (KYC/funds/banks/tickets); agent header Alerts shortcuts
15. AePS **bank logos** (web + mobile Razorpay CDN + letter fallback)

## Notes / left Coming soon

- Retailer receipt: printable HTML + `window.print` on home share (transactions page already has PDF download)
- Mobile failed-txn Retry CTA — weaker on ledger Recent list vs web retailer dashboard

## Revert

```bash
git checkout main
# after merge:
git revert -m 1 <merge-sha>
```
