# Roadmap — Phased (har phase alag Cursor chat)

> XL task ek chat mein mat daalo. Har row = 1 ya multiple task files.

## Phase 0 — Done ✅
- [x] Monorepo, backend API, Postgres + Mongo
- [x] Admin web (:3000), Agent web (:3001)
- [x] Single login + portal guard
- [x] RN Android shell, role-based home
- [x] Task system + LOGIN.md

## Phase 1 — Core money (priority)
| Task file | Work | Size |
|-----------|------|------|
| [12-wallet-ledger.md](TASKS/12-wallet-ledger.md) | Fund transfer audit, txn PIN on wallet | M |
| [13-fund-management.md](TASKS/13-fund-management.md) | Admin load float, approve requests | M |

## Phase 2 — Retailer services
| Task file | Work | Size |
|-----------|------|------|
| [09-retailer-aeps.md](TASKS/09-retailer-aeps.md) | AEPS withdraw, balance, mini stmt | L → split |
| [10-retailer-dmt.md](TASKS/10-retailer-dmt.md) | Beneficiary + transfer | L |
| [14-retailer-bbps-recharge.md](TASKS/14-retailer-bbps-recharge.md) | Bill pay + recharge | M |

## Phase 3 — Mobile polish
| Task file | Work | Size |
|-----------|------|------|
| [11-mobile-bottom-tabs.md](TASKS/11-mobile-bottom-tabs.md) | Tabs: Services, History, Wallet, Account | M |
| [15-mobile-biometric.md](TASKS/15-mobile-biometric.md) | Mantra/Morpho native module | L |
| [16-mobile-txn-pin.md](TASKS/16-mobile-txn-pin.md) | PIN modal before every txn | S |

## Phase 4 — Admin & network
| Task file | Work | Size |
|-----------|------|------|
| [17-admin-dashboard.md](TASKS/17-admin-dashboard.md) | GMV stats, pending KYC count | M |
| [18-kyc-module.md](TASKS/18-kyc-module.md) | KYC queue, Sales Agent mobile | L |
| [19-commission-schemes.md](TASKS/19-commission-schemes.md) | Slab CRUD + calculator | M |

## Phase 5 — Production
| Task file | Work | Size |
|-----------|------|------|
| [08-vps-deploy.md](TASKS/08-vps-deploy.md) | API live on VPS | M |
| [20-production-env.md](TASKS/20-production-env.md) | Secrets, CORS, SSL, mobile API URL | S |

---

## Suggested order (fast value)
```
11-mobile-bottom-tabs → 09-retailer-aeps → 12-wallet-ledger → 08-vps-deploy
```

## Chat budget guide (approx)
- **~20–30 small (S) tasks** / month comfortably
- **~10 medium (M)** OR **~3 large (L)** — mix wisely
- **1 XL = 5–8 chats** after split

---

## Phase 6+ — Role-wise feature-rich roadmap (2026-07-21, user-approved)

Not yet broken into task files — reference doc for when we get here. Convert each
bullet into a `docs/TASKS/XX-*.md` (copy `_TEMPLATE.md`) before implementing; nothing
here should be built directly from this list.

### Admin (Control Tower + Compliance)
1. Maker-checker workflow for critical actions — **pull into Phase 1** (agent note:
   admin can currently disable/switch a whole provider category solo with no second
   check — same risk class as the provider-DMT-not-ready mistake this session flagged)
2. Risk engine dashboard with live alerts
3. Full reconciliation center
4. KYC operations console
5. SLA & provider health panel (partial — Providers panel health% already ships)
6. Dispute and chargeback desk
7. Configurable limits engine

### Super Distributor (Business Owner Layer)
1. Network performance cockpit
2. Smart fund allocator
3. Commission strategy module
4. Team productivity and hygiene score
5. Collection and receivables tracker
6. Partner onboarding pipeline
7. White-label brand controls

### Distributor (Execution Manager Layer)
1. Retailer cluster management
2. Assisted onboarding + KYC completion tracker
3. Daily working capital planner
4. Failed/pending transaction follow-up queue
5. Recharge and BBPS smart recommendations
6. Incentive campaign tools
7. Field sales mode

### Retailer (Counter Speed + Conversion)
1. Lightning POS screen
2. Customer quick book
3. Smart retries and alternate route suggestions
4. Daily cashflow and margin view
5. EMI/loan/insurance cross-sell widgets
6. Voice-assisted flow (Hindi + English prompts)
7. Trust-building outputs

### Cross-role (big impact)
1. Unified notification center
2. Goal and incentive engine
3. AI copilot per role
4. Offline-first mobile queue
5. Multi-level approval policies
6. Financial health score per agent
7. Fraud shield layer — **needs concrete rules before scoping** (velocity checks?
   same-device multi-account? AEPS dormancy tie-in with existing `compliance.ts`?)

### Suggested phase order
- **Phase 6 (4–6 wk, quick wins):** role dashboards, pending/retry queues,
  notification center, receipt improvements, working-capital widgets, **+
  maker-checker for provider/category-disable actions**
- **Phase 7 (6–10 wk, revenue/growth):** commission simulator, campaign tools,
  onboarding funnel, cluster analytics, receivables tracking
- **Phase 8 (8–12 wk, enterprise controls):** risk rules engine, reconciliation
  center, SLA monitoring, dispute desk

### KPIs to track
1. Transaction success rate
2. Pending-to-settled turnaround time
3. Average retailer daily GMV
4. Distributor / Super Distributor active network count
5. KYC completion TAT
6. Failed transaction repeat rate
7. Revenue per active retailer

---

## Phase 6+ deeper analysis (2026-07-21, v2 — impact/effort tiered)

Refines the list above with impact-vs-effort tiering and two agent-flagged corrections
(see below). Still reference-only — convert to `docs/TASKS/XX-*.md` one at a time when
actually starting each, per this repo's "no speculative planning docs" rule.

### Tier 1 — quick win, high impact (start here)
1. Retailer smart home + recent-transaction templates
2. Distributor action queue (low balance / high failure / KYC pending / login risk, grouped)
3. Super Distributor P&L summary (revenue, commission, active retailers, net spread)
4. Admin provider reliability panel (partial — health% already ships in Providers panel)
5. Unified alert center

### Tier 2 — medium effort, strategic
1. Failure recovery workbench (grouped by root cause, retry/recheck/alt-rail suggestions)
2. Float planner + allocation suggestions
3. Commission scenario simulator
4. KYC assisted-completion (missing-field prompts, resubmission nudges)
5. Route-to-resolution support tickets (prefilled txn context, SLA timer)

### Tier 3 — heavy but transformational
1. Policy engine (configurable amount/velocity/geography/time-window rules)
2. Maker-checker framework (dual approval for fund loads, commission changes, KYC override, provider switching)
3. Reconciliation command center (internal ledger vs provider settlement vs bank statement)
4. Tamper-evident compliance vault (hash-chained audit export)
5. Risk graph / anomaly detection

### Differentiators (defer — data-dependent)
Settlement Confidence Score, Beneficiary Trust Score (DMT), Service Availability
Forecast, dynamic risk-weighted routing, fraud pattern snapshots, retailer cashflow
forecast, commission leakage detector. **Agent note:** these need real transaction
volume/history to calibrate meaningfully — building them now (low volume) would
produce meaningless scores. Revisit once there's enough live transaction history.

### 90-day execution blueprint (as proposed, with one correction)
- **Month 1:** role dashboards v2, alert center, retailer smart shortcuts, distributor action queue
- **Month 2:** recovery workbench, KYC completion assistant, Super Distributor P&L + float planner, basic support workflow
- **Month 3 — ⚠️ overloaded as originally proposed.** Policy engine + maker-checker +
  reconciliation + risk/anomaly detection were each independently scoped as "Tier 3:
  heavy" — doing all four in one month isn't realistic. Sequence them across Month 3+
  instead of parallel; **maker-checker first** (smallest of the four, and directly
  covers the provider-switch risk already flagged in this doc).

### Weekly success metrics (superset of the KPI list above)
Adds: pending aging (>15 min, >2 hr), average retries per failed transaction, active
retailers per distributor, fraud incident rate + prevented amount, support tickets per
1000 transactions, float idle time / stockout events, 7-day and 30-day user retention.
