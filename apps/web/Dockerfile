# AsanPay Agent Portal (web) — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/web/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

COPY packages/shared-types ./packages/shared-types
COPY packages/auth ./packages/auth
COPY apps/web ./apps/web

WORKDIR /app/apps/web

# Resolve local workspace packages without full monorepo install
RUN npm pkg set dependencies.@adhikaripay/shared-types="file:../../packages/shared-types" \
  && npm pkg set dependencies.@adhikaripay/auth="file:../../packages/auth" \
  && npm install --include=dev

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npm", "start"]
