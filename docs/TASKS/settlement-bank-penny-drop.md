# Bank account check on signup, settlement bank and company bank (PL-23 / PL-24)

**Goal:** run the shared bank account check (already live for DMT payees) wherever an account number is
entered, show the bank's account holder name, and match it with the right name.

**Shared function (done):** `verifyBankAccount({ userId, accountNumber, ifsc, purpose })` in
`apps/backend/src/modules/transactions/bankNameCheck.service.ts` — BestAPI (free) → provider pennyless (₹0.80)
→ ₹1 penny drop (₹1.80); stops on the first name or when BestAPI says invalid / closed; logs every hit with
its cost in `bank_name_checks`; 90-day cache per account + IFSC. Name match: `bankNameMatch` in
`@asanpay/shared-types`. Returns `{ status, bankName, method, cached, message }`. No charge inside.

## Decided (owner, 27 Oct)
**Agent bank (signup step + settlement bank add):** only **BestAPI** runs automatically — free, no agent
charge. Name as per bank + match vs PAN name shown; not confirmed → **warn only**, Continue allowed.

**Admin (KYC review + Agent bank accounts):** shows the BestAPI result and two buttons, admin-only:
"Check with pennyless" and "₹1 penny drop". Each run charges the **agent's wallet** at Bank check prices
(₹1.50 pennyless / ₹2.50 penny drop, admin Platform settings). Agent wallet too low (e.g. right after signup)
→ the check still runs and the **company pays** that one (log `cost_rupees`, no agent txn).

| Where | Auto check | Admin extra checks | Who pays extra checks |
|-------|-----------|--------------------|-----------------------|
| Signup bank step (web + mobile) | BestAPI only | pennyless / penny drop | Agent wallet, else company |
| Agent settlement / payout bank | BestAPI only | pennyless / penny drop | Agent wallet, else company |
| Admin company bank accounts | Full chain | — | Company |

DMT payee check (already built) keeps the full chain with the agent paying once.

Name to match: signup + settlement = agent's PAN name; company = company / account name typed by admin.

## Plan
1. Split the chain: `verifyBankAccount` gets an option to run BestAPI only, and a separate admin call for one
   Noble method (pennyless | pennydrop). Add `purpose` `signup_bank`.
2. Signup bank step (web + mobile): BestAPI only, no charge → "Name as per bank" + match pill vs PAN name +
   "Use bank name"; result saved in KYC submit metadata (`bankNameAsPerBank`, `bankNameMatchPercent`,
   `bankCheckStatus`). Warn only.
3. Admin KYC review + agent page: result + "Check with pennyless" / "₹1 penny drop" buttons → charge agent
   wallet via `executeServiceTxn` (`serverFee`, as DMT); low balance → run anyway, company pays (log only).
4. Settlement bank add (`registerSettlementBank`): BestAPI only; admin "Agent bank accounts" shows result + the
   same two buttons; replace the `PENNYDROP-STUB` ref with the check log id.
5. Company bank accounts (admin Banking): full chain on add, company pays; show the name before save.

## Read ONLY
- `apps/backend/src/modules/transactions/bankNameCheck.service.ts`
- `apps/agent-portal/app/signup/page.tsx` (bank step ~L1300 / L2715), `apps/asanpay-mobile-app/src/screens/signup/SignupScreen.tsx`
- `apps/backend/src/modules/kyc/kyc.service.ts` (bank fields in KYC metadata)
- `apps/backend/src/modules/settlements/settlement.service.ts` (`registerSettlementBank`, `verifySettlementBank`)
- UI pattern: `apps/agent-portal/components/dmt/BankNameCheck.tsx`, mobile `src/components/BankNameCheck.tsx`

## Not in scope
Automatic payout to the agent's bank (no payout API in the provider list) — payouts stay manual with UTR.
