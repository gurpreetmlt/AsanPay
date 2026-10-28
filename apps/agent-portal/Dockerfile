# AsanPay Agent Portal (web) — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /apps/agent-portal/Dockerfile | Context = /
# Redeploy bump: 2026-09-14 (main / VyaparAPI)

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

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build
ENV NODE_OPTIONS=

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Next writes its image / fetch cache under .next at runtime.
RUN chown -R node:node .next
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/', { redirect: 'manual' }).then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
