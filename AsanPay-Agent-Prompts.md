> **ARCHIVED / SUPERSEDED.** Product name is **AsanPay**. Do NOT follow this file for new work — use `AGENTS.md`, `docs/TASKS/`, and `docs/ROADMAP.md`.
>
> This file contains **historical build prompts** from early prototyping. Treat any old structure or third-party comparisons below as historical context only — the product is **AsanPay**.

# [ARCHIVED] Early Build Prompts (AsanPay)

A B2B agent banking platform.
Three roles in a strict hierarchy: **Admin → Distributor → Retailer**.
Money flows down (Admin loads float → Distributor wallet → Retailer wallet), and the
Retailer serves the end customer at the counter (AEPS / DMT / BBPS / recharge).

---

## Architecture at a glance

- **Monorepo:** Turborepo
- **Apps:** `apps/admin` (web), `apps/distributor` (web), `apps/retailer` (mobile-first web / can later wrap in React Native)
- **Shared packages:** `packages/db`, `packages/auth`, `packages/aggregator`, `packages/ui`, `packages/config`, `packages/commission`
- **Stack:** TypeScript, Next.js 15 (App Router), React 19, MongoDB (Mongoose), Tailwind
- **Golden rule:** the app is a *software layer*. All real banking (AEPS, DMT, BBPS) goes through a **pluggable aggregator adapter** (Eko / PaySprint / Setu / Decentro). Never hardcode one provider.

---

## PROMPT 0 — Foundation & Shared Packages

```
You are setting up a Turborepo monorepo for "AsanPay", a B2B agent fintech platform.
Stack: TypeScript, Next.js 15 (App Router), React 19, MongoDB with Mongoose, Tailwind CSS.

Create this structure:
- apps/admin, apps/distributor, apps/retailer  (three Next.js apps)
- packages/db        -> Mongoose connection + all shared models
- packages/auth      -> JWT auth, role guard, transaction-PIN + OTP helpers
- packages/aggregator-> provider-agnostic interface + adapters
- packages/commission-> commission/scheme calculation engine
- packages/ui        -> shared React components (Button, Card, Table, StatCard, Modal)
- packages/config    -> env schema (zod), constants, service list

ROLES: enum Role = 'admin' | 'distributor' | 'retailer'. Strict parent hierarchy:
a distributor has a parent admin; a retailer has a parent distributor.

MongoDB models (in packages/db, Mongoose, with timestamps and proper indexes):
1. User { role, name, mobile(unique), email, passwordHash, txnPinHash, parentId(ref User),
   status: 'pending'|'active'|'blocked', kycStatus, walletId, meta }
2. Wallet { ownerId, ownerRole, balance(Decimal128), holdBalance, limit, currency }
3. WalletLedger { walletId, type:'credit'|'debit', amount, balanceAfter, reason,
   refType:'fund_transfer'|'service'|'commission'|'reversal', refId, idempotencyKey(unique) }
   -> This is a DOUBLE-ENTRY ledger. Every money move writes matching credit+debit rows.
4. ServiceTxn { retailerId, service:'aeps'|'dmt'|'bbps'|'recharge'|'aadhaar_pay',
   aggregator, aggregatorTxnId, status:'pending'|'success'|'failed'|'reversed',
   amount, customerRef, requestPayload, responsePayload, idempotencyKey(unique) }
5. CommissionScheme { name, role, service, slabs:[{min,max,type:'flat'|'percent',value}] }
6. CommissionEntry { txnId, userId, role, service, amount, status }
7. Kyc { userId, docType, docNumber, provider:'digilocker'|'surepass', verifiedData, status }
8. ServiceConfig { service, enabled:boolean, aggregator, minAmount, maxAmount }
9. Ticket { raisedBy, subject, category, status, messages:[] }
10. AuditLog { actorId, action, entity, entityId, before, after, ip }

CRITICAL financial rules to implement as reusable functions in packages/db:
- Every wallet mutation must be atomic (Mongoose session/transaction) and idempotent
  (reject duplicate idempotencyKey).
- No balance ever goes negative; check-and-debit inside the same transaction.
- Never store real API keys in code — read from env via packages/config zod schema.

packages/aggregator:
- Define interface IAggregator with methods: aepsBalanceEnquiry, aepsWithdraw,
  aepsMiniStatement, aadhaarPay, dmtAddBeneficiary, dmtTransfer, bbpsFetchBill,
  bbpsPayBill, recharge, checkStatus.
- Each returns a normalized { success, aggregatorTxnId, status, amount, raw }.
- Create two stub adapters: EkoAdapter and PaySprintAdapter (return mocked responses now,
  real HTTP later). Export a getAggregator(service) factory that reads ServiceConfig.

packages/auth:
- JWT with role in payload, middleware/guard requireRole(...roles).
- verifyTxnPin(userId, pin) and requireTxnPin wrapper for money endpoints.
- OTP send/verify helpers (mock SMS provider for now).

Set up shared Tailwind config, root package.json with turbo pipeline (dev, build, lint),
and a seed script that creates 1 admin, 1 distributor, 1 retailer with linked wallets.
Write clean, typed, production-minded code. Add a README explaining money flow.
```

---

## PROMPT 1 — Admin Panel (`apps/admin`)

```
Build the ADMIN web panel in apps/admin (Next.js 15 App Router, React 19, Tailwind),
importing from packages/db, packages/auth, packages/aggregator, packages/commission, packages/ui.
Auth: only role='admin' can log in. Protect all routes with requireRole('admin').

Pages / modules:

1. DASHBOARD
   - Stat cards: total GMV (today/month), txn count, total float in system,
     active retailers, active distributors, pending KYC count.
   - Line chart: daily volume last 30 days. Table: latest 10 transactions.

2. DISTRIBUTOR MANAGEMENT
   - List (search, filter by status). Create distributor (name, mobile, email).
   - Detail page: KYC approve/reject, set wallet limit, assign commission scheme,
     block/unblock, view their retailers & network volume.

3. RETAILER MANAGEMENT
   - List of ALL retailers across the system (search, filter by distributor/status).
   - Detail: KYC docs view + approve/reject, per-service on/off toggle for that retailer,
     block/unblock, view wallet & transaction history.

4. FUND MANAGEMENT
   - Load main system float (admin master wallet) — record only, manual reconcile.
   - Fund transfer: Admin -> Distributor wallet (uses double-entry ledger, requires txn PIN).
   - Reversal tool for a specific ledger entry (with reason + audit log).

5. COMMISSION / SCHEME BUILDER
   - CRUD schemes: per role (distributor/retailer) + per service, slab-based
     (flat or percent). Preview calculator: enter amount -> show split.

6. SERVICE & AGGREGATOR CONFIG
   - Table of services (AEPS, DMT, BBPS, Recharge, Aadhaar Pay).
   - Per service: enable/disable, choose aggregator (Eko/PaySprint/...), min/max amount.
   - API keys are read from env only — UI shows "configured / not configured", never the key.

7. TRANSACTIONS MONITOR
   - All ServiceTxn with filters (service, status, date, retailer). Drill-in shows
     request/response payloads. Actions: recheck status (calls aggregator.checkStatus),
     mark reversed.

8. KYC MODULE
   - Queue of pending KYCs. Integrate DigiLocker/Surepass via a verifyKyc() call
     (abstract like the aggregator). Show verified data, approve/reject.

9. VIP / SUBSCRIPTION PLANS
   - CRUD plans (name, price, benefits, commission multiplier). Assign to retailers.

10. REPORTS
    - Commission payout report, settlement report, GST summary. CSV export.

11. SUPPORT (tickets) + AUDIT LOG viewer + RBAC sub-admins (roles & permissions).

UI: clean admin dashboard style, sidebar nav, data tables with pagination, toast on actions.
Every money action and status change writes an AuditLog. Money endpoints require txn PIN.
```

---

## PROMPT 2 — Distributor Panel (`apps/distributor`)

```
Build the DISTRIBUTOR web panel in apps/distributor (Next.js 15, React 19, Tailwind),
reusing packages/db, packages/auth, packages/ui, packages/commission.
Auth: only role='distributor'. A distributor can only see/act on their OWN network
(retailers where retailer.parentId == distributor._id). Enforce this on every query.

Pages / modules:

1. DASHBOARD
   - My wallet balance, my retailers count (active/pending), my network volume
     (today/month), my earnings (override commission). Chart of daily network volume.

2. RETAILER ONBOARDING
   - Create a retailer under me (name, mobile, email, shop details).
   - Upload/submit their KYC docs (goes to admin queue for final approval).

3. MY RETAILERS
   - List (search/filter). Detail: wallet balance, transactions, request block/unblock
     (block goes to admin as request OR direct per business rule — make it configurable).

4. FUND TRANSFER
   - Transfer from MY wallet -> a retailer's wallet (double-entry ledger, requires txn PIN,
     cannot exceed my balance). History of transfers.

5. MY WALLET
   - Balance, statement (WalletLedger filtered to my wallet), "Add money" request to admin
     (creates a pending fund request the admin sees).

6. EARNINGS
   - Override commission earned from my retailers' transactions, daily/weekly/monthly,
     service-wise breakdown. CSV export.

7. SUPPORT (raise ticket to admin) + profile/txn-PIN change.

UI: same design language as admin but lighter. Strict data isolation — never leak other
distributors' data. All money moves require txn PIN and write AuditLog.
```

---

## PROMPT 3 — Retailer / Agent App (`apps/retailer`)  ← the app in the video

```
Build the RETAILER app in apps/retailer as a MOBILE-FIRST Next.js 15 (React 19, Tailwind)
PWA. This is the app the shopkeeper uses at the counter (like the counter-service screen).
Reuse packages/db, packages/auth, packages/aggregator, packages/commission, packages/ui.
Auth: only role='retailer', status must be 'active' and kycStatus 'verified' to transact.

Design: mobile layout, bottom tab nav [ Services | History | Help | Account ], a top wallet
balance bar with hide/show, and a grid of service tiles. Clean, colorful, fast.

HOME (Services):
- Wallet balance bar + "Add Money" button.
- Banking Services grid: Cash Withdraw (AEPS), Balance Enquiry, Mini Statement,
  Aadhaar Pay, Money Transfer (DMT).
- Recharges & Bills grid (BBPS): Mobile, DTH, Electricity, Gas, Water, FASTag, Broadband,
  etc. Show commission badge on each tile.
- Only show services that are enabled globally (ServiceConfig) AND for this retailer.

FLOWS (each calls packages/aggregator, writes ServiceTxn idempotently, then commission):
1. AEPS (Cash Withdraw / Balance / Mini Statement / Aadhaar Pay)
   - Inputs: customer Aadhaar, bank (IIN), amount. Capture biometric via RD-service
     device (abstract behind a captureFingerprint() interface; mock for now).
   - Call aggregator, show receipt, credit commission to retailer + override to distributor.
2. DMT (Domestic Money Transfer)
   - Add beneficiary (name, account, IFSC, mobile) -> verify -> transfer -> receipt.
3. BBPS / Recharge
   - Fetch bill -> confirm -> pay from wallet -> receipt.

WALLET:
- Balance, "Add money" (UPI / bank transfer instructions / request to distributor),
  passbook (WalletLedger), pending requests.

HISTORY:
- Transaction list with status chips, filter by service/date, tap for receipt + recheck status.

EARNINGS:
- Daily/weekly/monthly commission, service-wise, "all-time best" style highlight.

ACCOUNT:
- Profile, KYC status, set/change transaction PIN, complaints (tickets), logout.

SECURITY (mandatory):
- Every transaction requires the transaction PIN.
- Every money call is idempotent (generate idempotencyKey client-side, enforce server-side).
- Never allow a transaction if wallet balance < amount (checked atomically server-side).
- Show clear success/failed/pending states; never assume success without aggregator confirm.

Make it feel like a real production agent app: fast, receipt after every txn, offline-friendly
PWA shell, and graceful handling of aggregator timeouts (mark pending, allow status recheck).
```

---

## Build order & non-negotiables

1. **Prompt 0 first** — nothing works without shared models + ledger + aggregator interface.
2. Then **Admin**, then **Distributor**, then **Retailer** (each depends on the tier above for funds).
3. **Keep the aggregator pluggable.** Today Eko/PaySprint mock; swap real API later without touching UI.
4. **Double-entry ledger + idempotency** on every rupee. This is the part that must never be sloppy.
5. **Compliance reality (not code, but decide early):** AEPS needs a BC / bank tie-up via your
   aggregator; your wallet rides on a partner's PPI license unless you get your own; use certified
   biometric devices. Build the software now, line up the partner in parallel.
