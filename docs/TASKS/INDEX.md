# Task Index

> **AI editor limit bachao:** sirf 1 task file + AGENTS.md per chat. Plan: [AGENT_PLAN.md](../AGENT_PLAN.md) | Roadmap: [ROADMAP.md](../ROADMAP.md)

## Setup & infra
| # | Task | Size | File |
|---|------|------|------|
| 01 | Local dev start | S | [01-local-dev.md](01-local-dev.md) |
| 07 | Database & seed | S | [07-database-seed.md](07-database-seed.md) |
| 08 | VPS deploy | M | [08-vps-deploy.md](08-vps-deploy.md) |
| 20 | Production env | S | [20-production-env.md](20-production-env.md) |

## Auth & core
| # | Task | Size | File |
|---|------|------|------|
| 02 | Login / auth | S | [02-auth-login.md](02-auth-login.md) |
| 03 | New API endpoint | M | [03-new-api-endpoint.md](03-new-api-endpoint.md) |
| 12 | Wallet & ledger | M | [12-wallet-ledger.md](12-wallet-ledger.md) |
| 13 | Fund management | M | [13-fund-management.md](13-fund-management.md) |
| — | Wallet hierarchy | M | [wallet-hierarchy.md](wallet-hierarchy.md) |
| — | Network table actions | M | [network-table-actions.md](network-table-actions.md) |
| — | Retailer activity metric | M | [retailer-activity-metric.md](retailer-activity-metric.md) |
| — | Linked accounts + role switch (PL-01) | M ⚠️ 1 phase/chat | [linked-accounts.md](linked-accounts.md) |
| — | Bank account check on signup, settlement + company banks (PL-23 / PL-24) | M | [settlement-bank-penny-drop.md](settlement-bank-penny-drop.md) |
| — | **Noble-only queue** (remove old rails, finish provider) | XL ⚠️ 1 phase/chat | [noble-only-queue.md](noble-only-queue.md) |
| — | **Compliance queue** (KYC data, agreements, onboarding states, AEPS re-KYC, audit) | XL ⚠️ 1 phase/chat | [compliance-queue.md](compliance-queue.md) |
| — | **Agent controls queue** (PL-31: services & limits, security, wallet/commission holds, activity) | XL ⚠️ 1 phase/chat | [agent-controls-queue.md](agent-controls-queue.md) |

## Web UI
| # | Task | Size | File |
|---|------|------|------|
| 04 | Agent web | M | [04-agent-web-ui.md](04-agent-web-ui.md) |
| 05 | Admin web | M | [05-admin-web-ui.md](05-admin-web-ui.md) |
| 17 | Admin dashboard stats | M | [17-admin-dashboard.md](17-admin-dashboard.md) |
| 18 | KYC module | L | [18-kyc-module.md](18-kyc-module.md) |
| — | KYC document photo checks, in-house (PL-05) | L ⚠️ 3 chats | [kyc-doc-checks.md](kyc-doc-checks.md) |
| — | KYC verification statuses + admin review (PL-07) | L ⚠️ 2 chats | [kyc-verification-statuses.md](kyc-verification-statuses.md) |
| — | Daily 2FA redesign — Aadhaar card view (PL-13) | L ⚠️ 2 chats | [daily-2fa-redesign.md](daily-2fa-redesign.md) |
| — | Signup flow v2 — 8 steps, shop + home location (PL-18) | L ⚠️ 3 parts | [signup-flow-v2.md](signup-flow-v2.md) |
| — | Commission rate card + share % + agent Commission card (PL-14) | L ⚠️ 5 chats | [commission-rate-card.md](commission-rate-card.md) |
| — | Per-slab Retailer / Distributor / SD split, % or flat (PL-29) | M–L | [per-slab-commission-split.md](per-slab-commission-split.md) |
| 19 | Commission schemes | M | [19-commission-schemes.md](19-commission-schemes.md) |
| 25 | Group AEPS rows on Commission page | M | [25-admin-service-grouping.md](25-admin-service-grouping.md) |
| 28 | Commission payout report | M | [28-commission-payout-report.md](28-commission-payout-report.md) |
| 29 | Wire settlements + orphan UI | M | [29-wire-settlements-ui.md](29-wire-settlements-ui.md) |
| 30 | Admin banking ops UI | M | [30-admin-banking-ui.md](30-admin-banking-ui.md) |
| 31 | Mobile partner Reverse (pull) | S | [31-mobile-partner-pull.md](31-mobile-partner-pull.md) |

## Retailer services
| # | Task | Size | File |
|---|------|------|------|
| 09 | AEPS | L ⚠️ split | [09-retailer-aeps.md](09-retailer-aeps.md) |
| 10 | DMT | L ⚠️ split | [10-retailer-dmt.md](10-retailer-dmt.md) |
| 14 | BBPS & recharge | M | [14-retailer-bbps-recharge.md](14-retailer-bbps-recharge.md) |
| 23 | Admin: Providers panel + Txns | L ⚠️ split, order 23A→24→23B | [23-provider-admin-panel.md](23-provider-admin-panel.md) |
| 24 | Financial-safety layer | L ⚠️ split | [24-financial-safety-layer.md](24-financial-safety-layer.md) |

## Mobile (Android)
| # | Task | Size | File |
|---|------|------|------|
| 06 | Mobile overview | S | [06-android-mobile.md](06-android-mobile.md) |
| 11 | Bottom tabs | M | [11-mobile-bottom-tabs.md](11-mobile-bottom-tabs.md) |
| 15 | Biometric SDK | L ⚠️ split | [15-mobile-biometric.md](15-mobile-biometric.md) |
| 16 | Txn PIN modal | S | [16-mobile-txn-pin.md](16-mobile-txn-pin.md) |

## Treasury & Balance ease (ordered)
Queue: [treasury-balance-ease-queue.md](treasury-balance-ease-queue.md) — **complete (TB01–TB20)**

## Tax & Commission (ordered)
Queue: [tax-commission-queue.md](tax-commission-queue.md) — product mostly done; **TC17 Noble 33A blocked**; TC15 parse awaits Vyapar sample
Rich features: [tax-commission-rich-queue.md](tax-commission-rich-queue.md) — TCR01–14 done; **TCR15/16 blocked**
Earnings UX: SD/Dist + Retailer web+mobile My Earnings · Est. earn on recharge/DMT

**Admin IA (Treasury-style):** [tax-commission-admin-ia-queue.md](tax-commission-admin-ia-queue.md) — **complete (TCA01–06)**

## Wallet engine pending (ordered)
Queue: [wallet-engine-queue.md](wallet-engine-queue.md) (MVP 27A–27D done)

**Pinned leftovers:** [wallet-engine-leftovers-queue.md](wallet-engine-leftovers-queue.md)

| # | Task | Size | File |
|---|------|------|------|
| 27A | Fund request + banking HTTP | M | [27A-fund-request-http.md](27A-fund-request-http.md) |
| 27B | Ledger recon cron | M | [27B-ledger-recon-cron.md](27B-ledger-recon-cron.md) |
| 27C | Settlements module | L | [27C-settlements.md](27C-settlements.md) |
| 27D | VAN + webhook auto-credit | M | [27D-van-webhook.md](27D-van-webhook.md) |
| 32 | Fund dual-approve limit (admin DB) | S | [32-fund-dual-approve-setting.md](32-fund-dual-approve-setting.md) done |
| 33 | Noble commercials: GST + TDS split (33A → 33B) | L ⚠️ split | [33-noble-commercials.md](33-noble-commercials.md) |

## Recommended next (fast value)
```
1. @docs/TASKS/tax-commission-queue.md  (TC01 CURRENT — Tax & Commission)
2. @docs/TASKS/18-kyc-module.md  (KYC CRUD leftovers)
```

## Prompt format
```
@docs/TASKS/11-mobile-bottom-tabs.md @AGENTS.md
Sirf task file ke paths read karo. Poori repo explore mat karo.
```

## New task?
Copy [_TEMPLATE.md](_TEMPLATE.md) → max 40 lines.
