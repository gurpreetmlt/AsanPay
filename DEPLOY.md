# AsanPay — Coolify Deploy Reference

Server: Mumbai (`ap-south-1`) · `t4g.medium` (4GB, ARM) · Elastic IP `13.206.56.155`
Coolify: https://coolify.asanpay.in · Project `Asanpay` → environment `production`
SSH: `~/Desktop/AsanPay/"AsanPay Aws"/connect-mumbai.sh`

Har app ke liye **Base Directory = `/`** aur **Build Pack = `Dockerfile`** rehta hai.

---

## 1. backend — `AsanPay_API`

| | |
|---|---|
| Dockerfile Location | `/apps/backend/Dockerfile` |
| Port | `4000` |
| Domain | `https://api.asanpay.in` |
| Watch Paths | `apps/backend/**`<br>`packages/shared-types/**` |

**Zaroori (inke bina boot nahi hoga):**

```
DATABASE_URL=postgres://asanpay:<password>@t34dlg5h566yiw2wh1kpms1b:5432/asanpay
JWT_ACCESS_SECRET=<min 32 characters>
JWT_REFRESH_SECRET=<min 32 characters>
AES_ENCRYPTION_KEY=<purana wala — badla to encrypted data nahi khulega>
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://asanpay.in,https://dev.asanpay.in,https://admin.asanpay.in
```

**Optional — provider credentials (sirf jo service live hai uske):**

```
NOBLE_API_KEY=
NOBLE_API_VALUE=
AEPS_PROVIDER_MODE=noble
VYAPARAPI_API_KEY=
VYAPARAPI_CALLBACK_SECRET=
BESTAPI_API_KEY=
BESTAPI_API_SECRET=
REDIS_URL=
```

`AEPS_PROVIDER_MODE=off` jab tak Noble keys na hon (AePS clear message ke saath band rehta hai).

Koi Build Variable nahi — backend Next.js nahi hai.

---

## 2. admin-portal

| | |
|---|---|
| Dockerfile Location | `/apps/admin-portal/Dockerfile` |
| Port | `3000` |
| Domain | `https://admin.asanpay.in` |
| Watch Paths | `apps/admin-portal/**`<br>`packages/**` |

```
NEXT_PUBLIC_API_URL=https://api.asanpay.in/api
NEXT_PUBLIC_BRAND_NAME=AsanPay
NEXT_PUBLIC_BRAND_TAGLINE=Payment Made Easy
API_URL=https://api.asanpay.in/api
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

**Build Variable ka tick:** teeno `NEXT_PUBLIC_*`

---

## 3. agent-portal

| | |
|---|---|
| Dockerfile Location | `/apps/agent-portal/Dockerfile` |
| Port | `3001` ← Dockerfile mein 3001 hai par deploy 3000 par hua hai, mat badalna |
| Domain | `https://dev.asanpay.in` |
| Watch Paths | `apps/agent-portal/**`<br>`packages/**` |

```
NEXT_PUBLIC_API_URL=https://api.asanpay.in/api
NEXT_PUBLIC_BRAND_NAME=AsanPay
NEXT_PUBLIC_BRAND_TAGLINE=Payment Made Easy
API_URL=https://api.asanpay.in/api
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

**Build Variable ka tick:** teeno `NEXT_PUBLIC_*`

---

## 4. Frontend (landing site)

| | |
|---|---|
| Dockerfile Location | `/Frontend/Dockerfile` |
| Port | `3002` |
| Domain | `https://asanpay.in` |
| Watch Paths | `Frontend/**`<br>`packages/**` |

```
NEXT_PUBLIC_AGENT_WEB_URL=https://dev.asanpay.in
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
```

**Build Variable ka tick:** `NEXT_PUBLIC_AGENT_WEB_URL`

---

## 5. Database — `asanpay-db`

```
Image            : postgres:18-alpine
User / DB        : asanpay / asanpay
Host (internal)  : t34dlg5h566yiw2wh1kpms1b
Port             : 5432
Public Port      : khaali — internet par kabhi mat kholna
```

---

## 6. Production — `asanpay-production` EC2 + RDS

Upar wala setup dev/staging hai. Production alag EC2 (`65.1.118.51`, Coolify) + private RDS
(`asanpay-production-db`, PostgreSQL 18, encrypted, SSL required) par chalta hai.

**Backend extra env (production):**

```
DATABASE_URL=postgres://<user>:<password>@<rds-endpoint>:5432/<db>
DATABASE_SSL_CA_PATH=/etc/ssl/rds/global-bundle.pem
DATABASE_POOL_MAX=10
STRICT_PRODUCTION=true
REQUIRE_TXN_PIN=true
AGENT_PORTAL_URL=<production agent web address, not dev.>
CORS_ORIGIN=<production web domains only, no localhost>
ADMIN_TOTP_REQUIRED=true
PROXY_SHARED_SECRET=<same value on API, admin-portal, agent-portal>
```

- `DATABASE_URL` mein `sslmode` mat likho — CA file se TLS verify hota hai.
- `STRICT_PRODUCTION=true` → unsafe config (stub providers, biometric replay, signup test OTP,
  localhost CORS, dev agent URL, RDS without CA) par API boot hi nahi hoga.
  Boot fail ho to logs mein `Launch safety` line padho, setting theek karo.
- JWT secrets + `AES_ENCRYPTION_KEY` production ke liye **naye** banao (dev wale reuse mat karo).
  Password manager mein bhi rakho — Admin portal mein kabhi nahi.

**Jobs service (second Coolify app, same Dockerfile):** same env as API + `PROCESS_ROLE=jobs`.
Jobs container migrate nahi chalata; sirf API chalata hai.

**Fresh production DB:** pehli baar API deploy hote hi migrations khud chalengi. Phir sirf
`seed:admin`, `seed:catalog`, `seed:providers` (neeche "Database commands"). Test seeds kabhi nahi.

**Admin first login:** Security → two-factor on karo → 10 recovery codes offline save karo.

**Play Store release se pehle:** `apps/asanpay-mobile-app/android/app/build.gradle` → release
`ENABLE_SECURE_SCREEN` wapas `"true"` karo (abhi testing ke liye screenshots allowed hain).

---

## Dhyan dene wali baatein

**`NEXT_PUBLIC_*` par Build Variable ka tick zaroori hai.** Next.js inhe build ke waqt
bundle mein bake karta hai. Tick na lagaya to app chalega par browser se koi API call
nahi jayegi — aur error se wajah samajh nahi aayegi.

**Watch Paths mein `apps/` likhna hai, `cpps/` nahi.** Galat likha to auto-deploy
kabhi trigger nahi hoga.

**`AES_ENCRYPTION_KEY` kabhi mat badalna.** Isse database ka encrypted data
(Aadhaar, bank details) decrypt hota hai. Badla to purana data padha nahi jayega.

**`PORT` badalne se routing tootegi.** Traefik jis port par bhej raha hai, container
usi par sun raha hona chahiye.

**`NEXT_PUBLIC_*` badalne ke baad Restart nahi, Redeploy karna** — poora build chahiye.

---

## Database commands

Backend container ka naam har deploy par badalta hai, isliye khud dhoondho:

```bash
API=$(for c in $(sudo docker ps --format '{{.Names}}' | grep -v '^coolify'); do [ "$(sudo docker exec $c printenv PORT 2>/dev/null)" = "4000" ] && echo $c; done | head -1)
```

**Migration ab container start par khud chalti hai** (`apps/backend/Dockerfile` ka CMD). Neeche
wali `db:migrate` line sirf manual re-run ke liye hai — idempotent hai, chalane se kuch nahi
bigadta. Migration fail hui to API boot nahi hoga: ye jaan-boojh kar hai, aadhi-migrated schema
par paisa chalane se behtar hai band rehna.

Seed (tarteeb maayne rakhti hai):

```bash
sudo docker exec $API npm run db:migrate
read -rs -p 'Admin password (12+ chars): ' P; echo; sudo docker exec -e SEED_ADMIN_PASSWORD="$P" $API npm run seed:admin; unset P
sudo docker exec $API npm run seed:catalog
sudo docker exec $API npm run seed:providers
```

Production: stop here — only admin, catalog and providers. `seed:network` and `seed:txns`
create test agents, fake transactions and wallet money; they refuse to run
when `NODE_ENV=production` (staging only, with `ALLOW_TEST_SCRIPTS=true`).

Admin ka login username: `admin`

Data check:

```bash
sudo docker exec t34dlg5h566yiw2wh1kpms1b psql -U asanpay -d asanpay -c "\dt"
```
