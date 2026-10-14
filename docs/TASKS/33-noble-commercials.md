# Task 33 — Noble Web Studio (P2P Noble) commercials: GST + TDS split

## Size: L ⚠️ split → 33A (Phase 1) → 33B (Phase 2)
## Depends: 12 (wallet & ledger), 19 (commission schemes)
## Status: 33A = user says done (verify paths) · 33B = not started — wait for "start karo"

## Hard rules
- All rates, slabs, caps, GST %, TDS %, share % → DB config table, versioned by `effective_from`. Nothing hardcoded.
- Money in paise (integer). Never float. Rounding: half-up per component (confirm).
- Minimal diff. English only in code/UI. No secrets in git.
- Do NOT touch settlement cycles (11:00 / 15:00 / 20:00 same-day).
- Calculation applies only to txns routed via Noble (confirm provider code).

## Read ONLY these files (fill before coding — ask user)
| Path | Why |
|------|-----|
| `TBD` ledger / transaction schema | 33A columns + 33B retailer columns |
| `TBD` Noble calc service (33A output) | extend for role share |
| `TBD` commission / wallet credit service | hook retailer credit |
| `TBD` migrations folder + one seed script | follow pattern |
| `TBD` admin-portal report page + nav | 33B admin screen |

---

## 33A — Phase 1: config + calc + ledger columns
Deliver: Drizzle migration (config table + ledger columns), seed, pure calc service + unit tests, hook into AePS / UPI / DMT / recharge success path (only where user points). No invoices, no UI, no payout changes.

### INCOME (Noble pays partner; +18% GST billed to Noble; Noble deducts TDS)
| Service | Rule |
|---|---|
| AePS cash withdrawal / deposit, amount > 100 | `min(interchange × 93%, 13.95)` |
| "0.50 paisa sharing" | separate config field, default 0, `UNCONFIRMED` |
| AePS / UPI amount ≤ 100 | 0 |
| Balance enquiry | 0 |
| On-Us txn | 0 |
| Mini statement | 1.50 per success |
| UPI withdrawal | `(interchange − psp_charge) × 90%` |
| UPI interchange | 0.5% of amount, max 15 |
| UPI psp_charge | 101–1000 = 0.10 · 1001–3000 = 0.25 · >3000 = 0.50 |
| DMT CCF (from customer) | 1% of amount |

### COST (Noble charges partner; +18% input GST / ITC)
| Item | Rule |
|---|---|
| AePS 2FA | 0.80 per hit — success AND failed |
| DMT processing | 2.50 per txn |
| DMT e-KYC | 10.00 GST inclusive |
| Payout | 100–1000 = 1.50 · 1001–25000 = 3.50 · >25000 = 6.50 |
| Verification API (per hit) | PAN basic 0.70 · PAN details 1.40 · Aadhaar OTP 2.50 · DL 1.50 · Voter ID 0.80 · CIN basic 0.80 · CIN adv 1.60 · GST basic 0.80 · GST adv 1.00 · IMPS penny drop 1.80 · IMPS pennyless 0.80 · PAN OCR 0.50 · Aadhaar OCR 0.50 |
| One-time setup | 100000 — record only, not per txn |

### RECHARGE / DTH (discount model; Noble invoices net)
Airtel 0.90% · BSNL 3.00% · BSNL STV 3.00% · VI 3.50% · Jio 0.75% · Airtel Digital TV 3.70% · Dish TV 3.40% · Sun Direct 3.20% · Videocon D2h 3.40% · Tata Play 2.90%.
GST/TDS treatment = config flag (pending CA).

### Tax defaults (config)
- `output_gst_percent` = 18 (on commission income)
- `input_gst_percent` = 18 (on provider costs)
- `tds_receivable_percent` = 2 (194H, on commission excl GST) — confirm with CA
- `effective_from` = revised commercial date (user to confirm)

### Ledger columns (per successful txn)
`service, txn_amount, interchange, gross_commission, output_gst, tds_receivable, net_receivable, provider_cost, input_gst, invoice_month, settlement_status, rate_version_id`

### Unit tests (must pass)
- AePS commission 13.95 → output_gst 2.51 → tds 0.28 → net_receivable 16.18
- UPI withdrawal 1000 → (5.00 − 0.10) × 90% = 4.41
- UPI withdrawal 5000 → (15.00 − 0.50) × 90% = 13.05

### 33A open questions
1. AePS `interchange` source — Noble response field or config slab?
2. "0.50 paisa sharing" = ₹0.50 or 0.50 paise? Applies to which txn?
3. Decimal amounts at slab edges (e.g. 100.50); payout < 100 — reject or 0?
4. Failed 2FA + verification hits — where stored (cost-only row / separate table)?
5. DMT e-KYC split: base 8.47 + GST 1.53?
6. CCF min/max (e.g. min ₹10)? Already computed somewhere?
7. Recharge: discount = `gross_commission`; GST/TDS only if flag on?
8. `invoice_month` from IST txn date? `settlement_status` values?

---

## 33B — Phase 2: role share + retailer TDS/GST + monthly reports + admin screen
1. Retailer / distributor commission share from `gross_commission` (share % per role in config, versioned).
2. Deduct TDS (194H, configurable %) when crediting retailer commission; add GST only if retailer is GST-registered (flag on retailer profile).
3. Ledger columns: `retailer_commission, retailer_tds, retailer_net`.
4. Monthly report (Noble e-invoice): sum `gross_commission`, `output_gst`, `tds_receivable` per `invoice_month`.
5. Monthly report (ITC): sum `input_gst` from provider costs per `invoice_month`.
6. Admin read-only screen (`apps/admin-portal` only, nav entry) for these totals. Admin-only → no mobile / agent-portal parity.

### 33B open questions
1. Share model: flat % of gross per role (retailer / distributor / SD, rest = AsanPay) or chain (upline takes from downline)?
2. Distributor / SD ledger columns too, or retailer only for now?
3. Existing commission credit / slab system — replace for Noble txns or run alongside? (Risk: double credit.)
4. Credit timing: instant wallet credit per txn, or ledger-only now?
5. TDS: 2% default; no-PAN 20% (206AA) as separate config?
6. GST-registered retailer: credit commission + 18%? GSTIN field already on profile or new column?
7. Which services share: income only? Are provider costs (2FA, DMT processing) recovered from retailer?
8. Reports: exclude reversed/refunded? Post-close reversal → which month?
9. ITC: include failed 2FA + verification costs?
10. Admin screen: month filter + CSV export, or table only?

## Test (Mac Terminal — commands filled after paths are known)
```bash
cd "/Users/gurpreetchauhan/Desktop/AsanPay"
npm run db:migrate          # local only; prod migrate → EC2 SSH
npm test -w @asanpay/backend
```

## Done when
- [ ] 33A: migration + seed + calc service + tests green + hooks in success paths
- [ ] 33B: role share + retailer TDS/GST columns + 2 monthly reports + admin screen
- [ ] `docs/CHECKLIST.md` updated
