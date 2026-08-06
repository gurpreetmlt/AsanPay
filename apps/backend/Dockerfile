# AsanPay API — only backend + shared-types (no web/admin/mobile)
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/backend/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

# Only the packages the API needs
COPY packages/shared-types ./packages/shared-types
COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend

# Coolify may inject NODE_ENV=production at build time, which skips devDeps (tsx, etc.).
RUN npm pkg set dependencies.@asanpay/shared-types="file:../../packages/shared-types" \
  && NODE_ENV=development npm install --include=dev --omit=optional

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migrations run before the server, every start. The server's ledger bootstrap verifies the
# system accounts and refuses to listen if they are wrong, so the schema must already be in
# place — running these as two separate steps leaves a window where the container crash-loops
# waiting for a migration nobody can exec into. If the migration fails the API stays down,
# which is the correct outcome for a money system.
# Assumes a single backend replica; two replicas starting at once would race the migrator.
#
# One image, two roles. Scheduled work (src/jobs) runs as a SECOND Coolify service off this same
# image with PROCESS_ROLE=jobs in its environment. Coolify's Dockerfile build pack has no start
# command override, so the role is selected here rather than in the service config.
#
# The jobs role deliberately skips the migrator: only the API container owns schema changes, and
# two processes migrating at once would race. Unset PROCESS_ROLE means API, so the existing
# backend service keeps working with no config change.
CMD ["sh", "-c", "if [ \"$PROCESS_ROLE\" = \"jobs\" ]; then exec npx tsx src/jobs/index.ts; else npx tsx src/db/postgres/migrate.ts && exec npx tsx src/server.ts; fi"]
