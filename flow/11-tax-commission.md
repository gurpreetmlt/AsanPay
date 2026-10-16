# 11 — Tax & commission (money layers)

Parent queue: [`docs/TASKS/tax-commission-queue.md`](../docs/TASKS/tax-commission-queue.md)

Use these names in UI copy and ledger descriptions. Do not mix layers.

## Layers

| Layer | Meaning | Who sees |
|-------|---------|----------|
| **Provider pool** | Margin / cashback from Vyapar, InstantPay, Noble, etc. | Admin (books / recon) |
| **Chain split** | Scheme slabs: Retailer → Dist → Super Dist share of commission | Admin sets; each role sees **own** share |
| **Customer fee** | Fee charged on the txn (e.g. DMT CCF) — not commission | Retailer confirm + receipt |
| **GST on fee** | GST on **customer fee** (product rule: **DMT on**) | Confirm / receipt fee breakdown |
| **Gross commission** | Agent share before TDS | Detail / expand |
| **TDS** | Tax deducted on commission income (all commission products) | Detail; monthly summary |
| **Net commission** | Credited to agent wallet (= Gross − TDS) | Home Today's Earnings, My Earnings lists |

## What is not tax/commission

- Wallet **Transfer** / **Reverse** (float) — no TDS, no commission
- Fund request credit — float top-up, not earnings

## Defaults (draft until CA locks)

- TDS ≈ **2%** on gross commission (excl GST) when `tds_applies`
- GST on fee ≈ **18%** when `gst_on_fee_applies` (DMT / Money Transfer)
- List UIs show **net**; expand shows Gross · TDS · Net

## Earnings UX (Fullimit-style)

| Role | Home | My Earnings |
|------|------|-------------|
| Super Dist | Balance · Earnings Report · Today's Earnings | Distributor-wise + Product-wise |
| Distributor | same | Retailer-wise + Product-wise |
| Retailer | same (mobile first) | Product-wise only (no downline) |

Web + mobile for SD/Dist. Retailer **web** earnings layout = later (TC21).

## Code anchors

- Schemes: `commission_rules` / `user_commission_rates` · Task 19
- Payout: `distributeCommissionForTxn` · `commission_ledger`
- Tax config: `tax_service_configs` (TC02+)
- Customer fee: `service_charges` · `transactions.customer_fee`
- My Earnings: `GET /api/earnings/summary` · `/by-product` · `/` · mobile `MyEarnings` · web `/earnings` (SD/Dist)
