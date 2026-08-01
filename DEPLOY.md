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

**Optional — provider credentials (app-env-backup.txt se):**

```
PAYSPRINT_PARTNER_ID=
PAYSPRINT_JWT_SECRET=
PAYSPRINT_AES_KEY=
PAYSPRINT_AES_IV=
PAYSPRINT_AUTHORISED_KEY=
PAYSPRINT_UAT_BASE_URL=
INSTANTPAY_CLIENT_ID=
INSTANTPAY_CLIENT_SECRET=
INSTANTPAY_AES_KEY=
INSTANTPAY_BASE_URL=
REDIS_URL=
AEPS_PROVIDER_MODE=dummy
```

Koi Build Variable nahi — backend Next.js nahi hai.

---

## 2. admin-web

| | |
|---|---|
| Dockerfile Location | `/apps/admin-web/Dockerfile` |
| Port | `3000` |
| Domain | `https://admin.asanpay.in` |
| Watch Paths | `apps/admin-web/**`<br>`packages/**` |

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

## 3. web (retailer portal)

| | |
|---|---|
| Dockerfile Location | `/apps/web/Dockerfile` |
| Port | `3000` ← Dockerfile mein 3001 hai par deploy 3000 par hua hai, mat badalna |
| Domain | `https://dev.asanpay.in` |
| Watch Paths | `apps/web/**`<br>`packages/**` |

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

Migration aur seed (tarteeb maayne rakhti hai):

```bash
sudo docker exec $API npm run db:migrate
sudo docker exec -e SEED_ADMIN_PASSWORD='<12+ char>' $API npm run seed:admin
sudo docker exec $API npm run seed:catalog
sudo docker exec $API npm run seed:providers
sudo docker exec -e SEED_NETWORK_PASSWORD='<password>' $API npm run seed:network
sudo docker exec -e SEED_LOGIN_MPIN='<4 digit>' $API npm run seed:mpin
sudo docker exec $API npm run seed:txns
```

Admin ka login username: `admin`

Data check:

```bash
sudo docker exec t34dlg5h566yiw2wh1kpms1b psql -U asanpay -d asanpay -c "\dt"
```
