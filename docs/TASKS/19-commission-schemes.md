# Task 19 — Commission Schemes

## Size: M

## Read ONLY
| Path | Why |
|------|-----|
| `apps/backend/src/modules/commission/commission.service.ts` | Slab engine |
| `apps/backend/src/db/postgres/schema/` | scheme tables |

## Goal
CRUD schemes: role + service + slabs (flat/percent). Preview calculator.

## UI
Admin web — new page `/commission` (don't rebuild whole admin)

## Test
Create scheme → retailer txn → commission entries created

## Done when
- [x] Scheme CRUD API
- [x] Preview: amount in → split out
- [x] Applied on successful txn
