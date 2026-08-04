# Network table actions (icons + tooltips)

## Goal
Agent Network **Table** view: party + wallets + icon action buttons with English tooltips (reference competitor panel).

## UI language
English only (see `.cursor/rules/ui-english-only.mdc`).

## Columns
| Column | Source |
|--------|--------|
| Party | name, mobile (not VR-style id as primary), shop/UID secondary, Active/Inactive |
| Main Wallet | main balance |
| Cash-IN Wallet | aeps balance (if API has it; else —) |
| Credit | — until product defines credit |
| Top-Up | icon → Fund (parent→child) |
| Put Receiving | icon → Collect / Wapas (OTP pull) |
| Debit | icon → same Collect flow (or hide if duplicate — prefer Receiving = Collect, Debit = Collect for now only if both needed; map Receiving=Collect, Debit=optional second entry same pull) |
| History | icon → passbook / ledger for that user |

## Read ONLY
- `apps/agent-portal/app/network/page.tsx`
- `apps/agent-portal/components/dashboard/FundForm.tsx`
- `apps/agent-portal/components/dashboard/PullForm.tsx`
- `apps/backend/src/modules/users/users.service.ts` (downline payload)
- `AGENTS.md`

## Done when
- [x] Table shows wallet columns + 4 icon actions with `title` tooltips in English
- [x] Fund / Collect open existing modals for selected downline
- [x] History opens passbook filtered or ledger modal
- [x] Active/Inactive still works
- [x] No Hinglish in UI strings
- Credit column shows — until product defines credit limits
