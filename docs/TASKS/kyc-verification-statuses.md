# KYC verification statuses + admin review (PL-07)

**Size:** L — split into 2 chats. **Surfaces:** backend, agent web, mobile, admin (parity rule).
**Builds on:** [kyc-doc-checks.md](kyc-doc-checks.md) (PL-05 photo check engine — done).

## Already done (27 Oct, PL-05 follow-up)

- OCR: English-only, 2 workers (PSM 3 auto + PSM 11 sparse) + black/white pass, merged.
- PAN↔Aadhaar cross-check: Aadhaar photo name vs PAN-verified name (+ eKYC name), DOB vs entered,
  gender vs selected, Aadhaar last 4 vs OTP-verified (or typed) number.
- Red = confirmed different person: name < 50 % AND DOB differs, or card number differs AND
  (name < 80 % OR DOB differs) — `docCheck/identityRules.ts`. One soft mismatch = amber.
- Server gate: `submitKyc` re-runs checks before saving; any red or a missing PAN / Aadhaar photo →
  422 `KYC_DOC_CHECK_FAILED` / `KYC_DOC_PHOTO_REQUIRED`. Amber is accepted (admin reviews).
- Apps re-run checks after reload and when DOB / gender / Aadhaar number change.

## Read ONLY

- `apps/backend/src/modules/kyc/kyc.service.ts` — `submitKyc`, `docChecks` in `kyc.submit` metadata
- `apps/backend/src/modules/kyc/docCheck/docCheck.service.ts`, `docCheckLabels.ts`
- `apps/backend/src/modules/kyc/panVerify.service.ts`, `aadhaarOtp.service.ts`
- `apps/backend/src/modules/admin/admin.service.ts` — KYC queue / user detail
- `apps/admin-portal/app/kyc/page.tsx`, `app/users/[id]/page.tsx`, `components/users/KycDocumentGrid.tsx`

## Chat 1 — backend statuses

- New table `kyc_verifications` (one row per user): `pan_number`, `pan_image`, `aadhaar_otp`,
  `aadhaar_image`, `cross_check`, `overall` — enum `pending | verified | failed | retry_required |
  manual_review`; plus `updated_at`. Migration on EC2 SSH.
- Status history table or audit rows `kyc.status_changed` (from → to, reason, actor).
- Set from: PAN verify, Aadhaar OTP verify (store provider request id), photo checks, submit, admin decision.
- Mapping: photo `pass` → verified · `flag` → manual_review · `fail` → failed · quality fail →
  retry_required. Overall = worst of all (failed > retry_required > manual_review > pending > verified).
- `GET /api/kyc/me` returns the statuses (no raw numbers).

## Chat 2 — UI

- Agent web + mobile: status strip on KYC step / Settings → KYC (green / red / amber / retry).
- Admin: side-by-side review — photo, entered data, verified data, mismatched fields highlighted;
  approve / reject with reason (reject reason shown to agent). Manual-review filter in KYC queue.

## Not in scope

Tamper detection, duplicate detection (owner decision 27 Oct), face match (PL-06).

## Done check

- [ ] Someone else's PAN / Aadhaar → red at upload and refused at submit (web + mobile)
- [ ] Six statuses visible to admin; agent sees a clear status
- [ ] Amber → admin approves / rejects with reason
- [ ] `docs/CHECKLIST.md` + PLANNING PL-07 → done
