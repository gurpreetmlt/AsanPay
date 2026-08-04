# Retailer activity metric + Distributor dashboard polish

## Goal
1. Split Activity Status on Distributor Dashboard (transacted vs no-activity this month — same logic as existing).
2. Rename downline **Collect/Debit** button label to **Reverse**.
3. Month-wise history: Total / Transacted / No Activity per past month.
4. Move Quick Actions higher (below Main Balance / Retailer Overview).

## Read ONLY
- `apps/agent-portal/components/dashboard/DistributorDashboard.tsx`
- `apps/agent-portal/app/wallet/page.tsx`
- `apps/agent-portal/components/dashboard/PullForm.tsx` (toast/modal labels if Collect/Debit)
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `AGENTS.md`

## Done when
- [x] Dashboard shows Transacted vs No Activity (successful txns this calendar month)
- [x] Wallet downline button says **Reverse** (English)
- [x] Monthly activity history table (last 6 months) on Distributor Dashboard
- [x] Quick Actions above the fold (right under overview cards)
- [x] API returns `activityHistory` for distributor role
