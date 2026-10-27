# Agent settlement bank — ₹1 penny drop check (PL-23)

**Goal:** when an agent adds the bank account their settlement payouts go to, confirm it with the bank
(₹1 IMPS penny drop), get the account holder name, match it with the agent's PAN name, and replace the
fake `PENNYDROP-STUB-…` reference admins approve today.

**Today:** agent adds bank (web `/settlements`, mobile `SettlementsModal`) → row saved unverified →
admin "Agent bank accounts" approves it (maker–checker, stub ref) → payouts are paid by hand from the
company bank and marked with a UTR. No bank-side name check anywhere.

**Decided (owner, 27 Oct):** check cost is debited from the agent's wallet.

## Provider (Noble, `service` host — same client as `common/balance_check`)

| Call | Path | Cost / hit |
|------|------|-----------|
| Penny drop (₹1 IMPS) | `POST /api/v1.0/verification/pennydrop` | ₹1.80 |
| Pennyless (name only) | `POST /api/v1.0/verification/penniless` | ₹0.80 |
| Status (pending) | `POST /api/v1.0/verification/penny_status_check` | — |

Body `{ accountNumber, ifsc, transactionId }` (12–25 chars, unique). Success =
`responseData[0].tranStatus === "Success"` + `beneficiaryName`. Docs `NobleWebStudio/VERIFICATION.md`,
rates `docs/TASKS/33-noble-commercials.md`.

## Plan
1. `registerSettlementBank` → after insert, run penny drop (status check if pending); store bank holder
   name, match % vs PAN name and typed name, Noble `apiTransactionId` as `verificationRef`, check status.
   New columns on `agent_settlement_accounts` → migration (EC2 SSH migrate).
2. Debit the agent wallet per hit (own txn type → passbook / statement); low balance → clear error first.
3. Agent web + mobile: after Add bank show "Name as per bank: …" + match pill; failed → "Bank could not
   confirm this account. Check the account number and IFSC."
4. Admin "Agent bank accounts": bank name + match pill + penny status on each pending row; approve uses the
   real ref (stub removed); "Re-check with bank" button. Strong match → auto-verify (if decided below).

## Read ONLY
- `apps/backend/src/modules/settlements/settlement.service.ts` (`registerSettlementBank`, `verifySettlementBank`)
- `apps/backend/src/modules/providers/noble/client.ts`
- `apps/agent-portal/app/settlements/page.tsx`, `apps/asanpay-mobile-app/src/screens/shared/SettlementsModal.tsx`
- `apps/admin-portal/app/settlements/page.tsx`

## Open decisions
- [ ] Strong name match → auto-verify, or admin still approves every bank?
- [ ] Match threshold (e.g. ≥ 80% green, 60–80% amber, < 60% red)?
- [ ] Charge the agent when the bank returns "Failed"?
- [ ] Penny drop (₹1.80, proves the account is live) or pennyless (₹0.80) first?

## Not in scope
Automatic payout to the agent's bank — the Noble API list we have has no payout / IMPS transfer API.
Ask Noble; until then payouts stay manual with UTR.
