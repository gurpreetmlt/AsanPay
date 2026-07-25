# Task 08 — VPS Deploy (Backend API)

## Target
Express API on Ubuntu VPS — `api.asanpay.in` (example)

## Requirements on VPS
- Node 20+
- PostgreSQL (or managed) — single database, no Mongo
- Redis (optional — cache/queues only)
- nginx + Let's Encrypt SSL

## Env (production)
Copy from `apps/backend/.env.example`:
- `DATABASE_URL`, `JWT_*`, `AES_ENCRYPTION_KEY`
- Strong secrets — never commit

## Build & run
```bash
npm ci
npm run build -w @asanpay/backend
npm run db:migrate -w @asanpay/backend
npm run seed:admin -w @asanpay/backend
node apps/backend/dist/server.js  # or pm2
```

## nginx
Proxy `443` → `localhost:4000`

## Client updates
- Web: `NEXT_PUBLIC_API_URL=https://api.asanpay.in/api`
- Mobile: `src/lib/api.ts` production URL

## Health check
`GET /health`
