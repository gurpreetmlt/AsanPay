# Task 07 — Database & Seed

## Postgres (Drizzle)
| Command | Purpose |
|---------|---------|
| `npm run db:migrate -w @asanpay/backend` | Apply migrations |
| `npm run db:generate -w @asanpay/backend` | New migration |
| `npm run seed:admin -w @asanpay/backend` | Root admin |
| `npm run seed:catalog -w @asanpay/backend` | Service catalog |

## Schema location
`apps/backend/src/db/postgres/schema/`

## Mongo
`apps/backend/src/db/mongo/models/` — AuditLog, OtpRequest, ProviderLog

## Connection
`apps/backend/.env` — `DATABASE_URL`, `MONGODB_URI`

## Onboard users (API)
Login as parent → `POST /api/auth/register` with child role

## Credentials
[`LOGIN.md`](../../LOGIN.md)
