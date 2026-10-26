# Planning list

Features we have discussed and decided to build, before they become task files.
One row per feature; details in the section below the table. Newest at the top of the table.

**Status flow:** `idea` → `planned` → `design` (Figma in progress) → `ready` (task file written) → `building` → `done`

| # | Feature | Surfaces | Size | Status | Design | Task file |
|---|---------|----------|------|--------|--------|-----------|
| PL-01 | Linked accounts + role switch (same person, Distributor + Retailer) | Backend, web, mobile, admin | M | design | [Figma prompt](PROMPTS/figma-linked-accounts.md) | — |

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
