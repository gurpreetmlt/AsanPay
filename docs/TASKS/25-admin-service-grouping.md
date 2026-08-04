# Task 25 — Admin panels: group AEPS sub-services as one row (Commission page)

## Size: M
## Depends: none (Commission page already exists — 19-commission-schemes.md)
## Branch: `api-providers`

## Goal (1 line)
On the admin Commission page (`AgentCommissionPanel.tsx`), collapse the AEPS
sub-services under Banking Services into **one "AEPS" row**, not 4 separate
lines — matching how the Providers panel already groups by rail (Task 23).

## Why (user feedback, 2026-07-21)
Banking Services category currently lists `CASH_WITHDRAW`, `MINI_STATEMENT`,
`CASH_DEPOSIT`, `BALANCE_ENQUIRY` as 4 separate commission rows. These are all
AEPS sub-operations — user wants them shown as **one "AEPS" line**. Keep
`MONEY_TRANSFER` (DMT) and `NEPAL_REMITTANCE` as their own separate rows (they
already are, correctly). `UPI_CASH_POINT` was not flagged — leave separate
unless told otherwise. **Do NOT touch BBPS** — user confirmed the current
per-biller (30 rows) listing there is correct and should stay as-is.

## Real decision to make before implementing (not just UI)
Collapsing 4 services into 1 commission control means **one rate applies to
all 4** (withdraw/balance/mini-statement/deposit can no longer have different
commission %). Confirm with the user this is actually wanted before writing
code — if a retailer's commission differs between AEPS withdraw vs balance
enquiry today, collapsing breaks that. If per-op rates are still needed
internally, the UI could show one control that writes the same rate to all 4
`userCommissionRates` rows (fan-out on save) — decide the exact mechanic with
the user first.

## Where this same "group by rail, not by internal service code" principle
## already applies (for consistency — apply the same idea anywhere else new)
- Task 23 (Providers panel, `apps/admin-portal/app/developer-options/providers/page.tsx`) — category-level rollup with a "view individual services" drill-down, already shipped.
- This task — same principle, applied to Commission page.
- If a future admin page lists services again (reports, analytics, etc.), default to the same **grouped-by-rail-with-drill-down** pattern rather than listing raw internal operation codes.

## Read ONLY these files
| Path | Why |
|------|-----|
| `apps/admin-portal/components/users/AgentCommissionPanel.tsx` | Renders the per-category service commission table |
| `apps/backend/src/modules/admin/admin.service.ts` (`getAdminUserCommissions`, `upsertAdminUserCommissions`) | Data source + save logic — needs a grouping/fan-out concept |
| `apps/admin-portal/app/developer-options/providers/page.tsx` | Reference pattern already built for the same grouping idea (Task 23) |

## Steps
1. Confirm with user: single shared rate for all 4 AEPS sub-services, fanned out on save — or something else.
2. Backend: define an `AEPS_COMMISSION_GROUP` (service codes → one virtual row), fold into `getAdminUserCommissions` response for Banking Services only.
3. `upsertAdminUserCommissions`: when saving the virtual "AEPS" row, write the same rate to all 4 underlying `service_id`s.
4. Frontend: render the virtual row instead of the 4 individual ones for Banking Services.

## Done when
- [x] Banking Services shows: AEPS (1 row) · Money Transfer · Nepal Transfer · UPI Cash Point — not 4+ separate AEPS lines
- [x] BBPS untouched (still per-biller)
- [x] Saving the AEPS row's rate correctly updates all 4 underlying services (verified in DB, not just UI)

## Shipped (2026-08-03)
- Backend: `AEPS_COMMISSION_VIRTUAL_ID` + fold in `getAdminUserCommissions`; fan-out in `upsertAdminUserCommissions`
- Frontend: `AgentCommissionPanel` renders the virtual AEPS row (no per-op expand)
- Mechanic: one shared rate → writes to `CASH_WITHDRAW`, `MINI_STATEMENT`, `CASH_DEPOSIT`, `BALANCE_ENQUIRY`
