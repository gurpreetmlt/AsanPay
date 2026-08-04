# AsanPay Admin Panel — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/admin-web/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

COPY packages/shared-types ./packages/shared-types
COPY apps/admin-web ./apps/admin-web

WORKDIR /app/apps/admin-web

# Resolve local workspace package without full monorepo install
RUN npm pkg set dependencies.@asanpay/shared-types="file:../../packages/shared-types" \
  && npm install --include=dev

# TELEMETRY off; raise heap for "Collecting page data" on small Coolify hosts.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
