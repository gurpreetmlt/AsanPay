# AsanPay Agent Portal (web) — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/agent-portal/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

COPY packages/shared-types ./packages/shared-types
COPY packages/auth ./packages/auth
COPY apps/agent-portal ./apps/agent-portal

WORKDIR /app/apps/agent-portal

# Resolve local workspace packages without full monorepo install
RUN npm pkg set dependencies.@asanpay/shared-types="file:../../packages/shared-types" \
  && npm pkg set dependencies.@asanpay/auth="file:../../packages/auth" \
  && NODE_ENV=development npm install --include=dev

ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npm run build
ENV NODE_OPTIONS=

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
