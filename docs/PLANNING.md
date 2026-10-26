# Planning list

Features we have discussed and decided to build, before they become task files.
One row per feature; details in the section below the table. Newest at the top of the table.

**Status flow:** `idea` → `planned` → `design` (Figma in progress) → `ready` (task file written) → `building` → `done`

| # | Feature | Surfaces | Size | Status | Design | Task file |
|---|---------|----------|------|--------|--------|-----------|
| PL-02 | Cash Management page (CMS provider cards, in-app CMS, CMS transactions) | Backend, web, mobile | M | planned | — | — |
| PL-01 | Linked accounts + role switch (same person, Distributor + Retailer) | Backend, web, mobile, admin | M | design | [Figma prompt](PROMPTS/figma-linked-accounts.md) | — |

---

## PL-02 — Cash Management page

**Problem:** Cash collection today is a modal that asks the retailer for a merchant id, then opens the Airtel CMS page in the phone browser — the user leaves the app and nothing is recorded on our side.

**Plan**
- **Page:** Services → Cash Collection → "Cash Management" page (web + mobile).
  - One card per CMS provider: icon, name, one-line description, **Initiate** button. Airtel CMS now; list is config-driven so new providers are one entry each.
  - Below: **CMS Transactions** — From date / To date / Fetch → list (txn id, provider, amount, status, UTR, time) + Export (PDF · Excel · CSV).
- **No merchant id input:** backend fills `merchantId` from the logged-in retailer (value to confirm with provider) and generates `transactionId`.
- **In-app CMS:**
  - Mobile: new WebView screen (our header + back, status bar / nav bar in brand color). Needs `react-native-webview` → APK rebuild.
  - Web: open inside the portal (iframe) if the bank page allows framing; otherwise a centered popup window and the portal polls status.
- **Record every CMS txn:** new `cms_transactions` table (retailer, provider, txn id, status, amount, UTR, raw). Status via status-check on return from the CMS page; provider callback later.
- Mobile + web parity; "hover cursor" is web only.

**Open decisions (owner)**
- [ ] Merchant id = retailer's registered mobile, or a provider-issued merchant id? (ask provider)
- [ ] Does Airtel's CMS page allow iframe on web? (test once built)
- [ ] Commission / charges on CMS collections?
- [ ] Does a CMS collection credit any AsanPay wallet, or is it record-only?

**Notes:** Only one CMS provider live today; don't hard-code provider names in UI layout.

---

## PL-01 — Linked accounts + role switch

**Problem:** One person runs both a Distributor and a Retailer account, each on a different mobile. Today they log out and log in again to move between them.

**Plan**
- **Link:** Dashboard → Linked accounts → Link another account → other account's mobile → OTP on that mobile + that account's MPIN / password.
- **Same person only:** link allowed only when both accounts have the same KYC PAN / Aadhaar.
- **Switch:** header profile menu → "Switch to Retailer" / "Switch to Distributor" → MPIN → fresh session for the other account (no logout).
- **Unlink:** Settings, any time. Every link / unlink / switch goes to the audit log.
- Accounts stay separate: own mobile, wallet, ledger account, commission, daily 2FA.
- Backend sketch: `linked_accounts` table; switch endpoint checks the link and issues tokens for the target account (role is re-read from the DB on every request already).
- Admin: user detail shows "Linked accounts".

**Open decisions (owner)**
- [ ] Self-commission: if the Retailer sits under the same Distributor, may the Distributor earn commission on their own Retailer's transactions?
- [ ] Can the same PAN / Aadhaar register two accounts today? (check signup) — linking rules follow that answer.
- [ ] Max linked accounts per person (suggest 2: one Distributor + one Retailer).
- [ ] MPIN on every switch, or only when the last switch was > 15 min ago?

**Notes:** AEPS (provider agent id + daily 2FA) stays on the Retailer account only. Wallet transfers between the two follow the normal hierarchy rule.
