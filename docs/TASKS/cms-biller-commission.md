# CMS biller commission (PL-37)

Size: **M** · Surfaces: backend, admin (no agent UI, no mobile)

## Why

The provider's Cash Collection sheet (`Airtel CMS Commercial_V0.95`) has 310 billers, each with its own
company margin and Retailer / Distributor / Super margins. The rate card only stores amount slabs, so admin
cannot hold or see these rows. Reference copy: `docs/rate-cards/cms-rate-card-import.xlsx` → tab "CMS billers".

## Sheet columns (upload as-is)

`Biller Id`, `Biller Name`, `Asanpay Company Margin`, `Retailer Margin`, `Distributor Margin`, `Super Margin`.
All 310 rows today: Retailer = 50 %, Distributor = 10 %, Super = 0 of the company margin.

## Build

1. Migration `cms_biller_rates`: `biller_id` (unique), `biller_name`, `company_margin`, `retailer_margin`,
   `distributor_margin`, `super_margin` (numeric 10,6), `is_active`, `updated_by`, timestamps.
   Import history table (file name, reason, counts, admin, created_at, undo payload) — or reuse rate-card imports.
2. Admin API: `GET /admin/cms/billers` (search, type filter), `POST /admin/cms/billers/import` (preview + save,
   reason required, audit log), `POST /admin/cms/billers/imports/:id/undo`.
   Validation errors name the row + column (`clear-error-messages`): biller id digits, margins ≥ 0,
   retailer + distributor + super ≤ company margin.
3. Admin UI: Rate card → Cash Collection expanded → "Billers (N)" panel: search, Agent / Customer filter, sort,
   **Export PDF · Excel · CSV**, "Upload biller sheet" (popup per `popup-design`: preview new / changed / removed,
   reason, Save). Rate audit shows each import.
4. P18 hook (later, in `noble-only-queue` P18): CMS commission by `billerId` from this table; unknown biller →
   rate-card share of the callback `commission`.

## Read ONLY

- `apps/backend/src/modules/commission/rateCardImport.service.ts` + `rateCardImport.ops.ts` (import + undo pattern)
- `apps/backend/src/db/postgres/schema/commission.ts`, latest migration number
- `apps/admin-portal/components/commission/rateCard/RateCardScreen.tsx` (Cash Collection row) + `RateCardImportModal.tsx`
- `apps/admin-portal/lib/xlsxWorkbook.ts` (read / write xlsx), `apps/admin-portal/components/ui/ExportMenu.tsx`

## Done when

- [x] Upload of the provider sheet shows 310 billers in preview and saves them (reference tab parses 310 rows, 0 errors)
- [x] Cash Collection shows the biller list with search + PDF / Excel / CSV export
- [x] Re-upload shows only changed rows; Undo restores the previous rates
- [ ] Migration run on EC2 after deploy (`0101_cms_biller_rates`)
