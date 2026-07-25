# AsanPay Marketing Site (Frontend) — Next.js
# Coolify: Build Pack = Dockerfile | Dockerfile = /Frontend/Dockerfile | Context = /

FROM node:22-bookworm-slim

WORKDIR /app

COPY Frontend ./Frontend

WORKDIR /app/Frontend

RUN npm install --include=dev

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["npm", "start"]
