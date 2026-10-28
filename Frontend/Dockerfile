# AsanPay Marketing Site (Frontend) — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /Frontend/Dockerfile | Context = /
# Redeploy bump: 2026-09-14 (main / VyaparAPI)

FROM node:22-bookworm-slim

WORKDIR /app

COPY Frontend ./Frontend

WORKDIR /app/Frontend

RUN NODE_ENV=development npm install --include=dev

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Next writes its image / fetch cache under .next at runtime.
RUN chown -R node:node .next
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/', { redirect: 'manual' }).then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
