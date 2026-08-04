# AsanPay Admin Panel — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/admin-portal/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

COPY packages/shared-types ./packages/shared-types
COPY apps/admin-portal ./apps/admin-portal

WORKDIR /app/apps/admin-portal

# Coolify may inject NODE_ENV=production at build time, which skips devDeps.
# Force install of build tools (typescript, etc.) regardless of Coolify env.
RUN npm pkg set dependencies.@asanpay/shared-types="file:../../packages/shared-types" \
  && NODE_ENV=development npm install --include=dev

# TELEMETRY off; raise heap for "Collecting page data" on small Coolify hosts.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
