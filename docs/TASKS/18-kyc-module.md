# Task 18 — KYC Module

## Size: L — split: (1) backend routes (2) admin queue UI (3) mobile Sales Agent submit

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/db/postgres/schema/users.ts` | kycStatus field |
| `apps/admin-portal/app/dashboard/page.tsx` | Admin UI mount |
| `apps/mobile/src/screens/RoleHomeScreens.tsx` | Field agent |

## Goal
Queue pending KYC → approve/reject → update user kycStatus

## Sales Agent
Admin role + permissions later — for now admin approves

## Test
Submit KYC docs → admin sees queue → approve → retailer can txn

## Done when
- [x] KYC list API
- [x] Approve/reject writes audit
- [x] Retailer blocked until verified

## Note (2026-08-03)
Queue + decide + agent submit already shipped. Checklist “KYC CRUD routes” =
richer get/update/resubmit beyond list+decide — deferred unless product asks.
