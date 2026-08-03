# AsanPay API — only backend + shared-types (no web/admin/mobile)
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/backend/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

# Only the packages the API needs
COPY packages/shared-types ./packages/shared-types
COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

# Resolve local workspace package without full monorepo install
RUN npm pkg set dependencies.@asanpay/shared-types="file:../../packages/shared-types" \
  && npm install --include=dev --omit=optional

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migrations run before the server, every start. The server's ledger bootstrap verifies the
# system accounts and refuses to listen if they are wrong, so the schema must already be in
# place — running these as two separate steps leaves a window where the container crash-loops
# waiting for a migration nobody can exec into. If the migration fails the API stays down,
# which is the correct outcome for a money system.
# Assumes a single backend replica; two replicas starting at once would race the migrator.
CMD ["sh", "-c", "npx tsx src/db/postgres/migrate.ts && npx tsx src/server.ts"]
