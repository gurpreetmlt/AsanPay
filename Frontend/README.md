# Frontend — AsanPay public site

Marketing / waitlist Next.js app (`@asanpay/frontend`).

| | |
|--|--|
| Port | **3002** |
| Package | `@asanpay/frontend` |
| Agent Log in | `NEXT_PUBLIC_AGENT_WEB_URL` → `/login` (`apps/agent-portal` :3001) |
| Agent Sign up | same → `/signup` |

## Dev (Mac Terminal)

```bash
cd "/Users/gurpreetchauhan/Desktop/AsanPay"
npm install
npm run dev:frontend
# → http://localhost:3002
```

Agent portal alag:

```bash
npm run dev:web      # :3001
npm run dev:backend  # :4000
```
