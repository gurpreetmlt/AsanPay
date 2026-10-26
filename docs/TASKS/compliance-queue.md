# Compliance queue — KYC, agreements, onboarding, AEPS operator controls

> Size: XL — **one phase per chat**. Read only this file + `AGENTS.md` + `docs/compliance/COMPLIANCE_GAP_REPORT.md` (the gap ids `G1…G21` and question ids `Q1…Q14` refer to it) + the paths listed in the CURRENT phase.
> Research done 26 Oct 2026. Never claim "RBI compliant" in UI, docs or commits. Never put competitor / provider brand names in UI or commits.

## Rules for every phase
- Additive migrations only (register in `meta/_journal.json`); keep `users.kycStatus` working until C6 switches gates.
- Web + mobile parity for agent-facing UI; admin = admin web only.
- Never store Aadhaar OTP, PID / biometric data, passwords. Aadhaar shown as last-4 only.
- Every compliance state change goes through one service function + audit event (actor, action, entity, refs, reason).
- Tests (vitest) for each phase's state transitions / gates.
- Phase blocked on a question → mark `blocked (Qn)` and move to the next unblocked row.

## Queue

| # | Phase | Gaps | Needs | Status |
|---|-------|------|-------|--------|
| C1 | Security exposure fixes: remove public `/uploads`, owner/admin-only document routes, last-4 Aadhaar in API responses, pino redact + strip query tokens from access log, customer consent unchecked by default, refuse test-OTP flags in production | G1 G2 G4 G6 G20 | — | **CURRENT** |
| C2 | KYC data model: `kyc_submissions`, `kyc_documents` (private storage ref + sha256), `kyc_verification_events` (PAN / Aadhaar OTP results), reject reason required, approve needs verification events; backfill from `audit_logs` **before the next partition drop** | G3 G11 | — | todo |
| C3 | `compliance_audit_logs`: append-only trigger + hash chain, ≥ 1 year retention; reason required on reassignment / restriction; dual approval for compliance overrides | G15 G16 | Q7 (retention) | todo |
| C4 | Agreement module backend: `agreements`, `agreement_versions` (immutable, sha256, effective dates, draft/published, signing policy), `user_agreement_acceptances`, re-acceptance on material change, click-accept + OTP confirm methods, PDF copy | G10 | Q6 Q13 (policy defaults) | todo |
| C5 | Agreement UI: signup + re-accept gate (web + mobile), admin template / version management, download copy | G10 | C4 | todo |
| C6 | Onboarding state machine (`onboarding_applications` + events) + `service_approvals`; transaction gate = ACTIVE + partner approval | G7 G8 | Q1–Q4 | todo |
| C7 | AEPS operator controls: persisted dormancy (3 calendar months since last customer txn), unlock only on partner re-KYC confirmation, periodic KYC due dates, agent-auth mismatch lock if partner doesn't enforce | G9 G12 | Q4 Q5 | todo |
| C8 | Webhook hardening: HMAC / shared secret with `timingSafeEqual`, timestamp window, event-id dedupe (provider callback, WhatsApp, VyaparAPI, Telegram) | G5 | provider callback spec | todo |
| C9 | Admin compliance dashboard: pending KYC / agreements / eSign / partner approvals, rejected, suspended, dormant, expiring docs, full onboarding history; exception path with reason + dual approval | — | C2 C4 C6 | todo |
| C10 | eSign adapter interface + `esign_requests` / `esign_events`, webhook verification + idempotency tests, **no vendor wired** | — | owner: vendor, cost, policy | todo |
| C11 | Privacy + retention: itemised privacy notice, consent records, retention jobs for KYC files / risk signals, replace hard delete with terminate, AES key versioning, peppered customer Aadhaar hash, AEPS geo required on web | G17 G18 G19 G21 | Q14 (counsel) | todo |

## Phase notes

### C1 — Security exposure fixes
Read: `apps/backend/src/app.ts`, `modules/kyc/kycDocuments.service.ts`, `modules/kyc/kyc.routes.ts`, `modules/auth/agentAuth.ts`, `modules/onboarding/nobleOnboarding.service.ts`, `utils/logger.ts`.
- Check every client that reads `aadhaarNumber` from `/auth/agent-auth/status` or `/onboarding/noble/identity` (web + mobile) before switching to last-4 — the server must fill the full number when calling the provider.
- Admin preview already goes through `GET /admin/users/:id/kyc-documents/:docKey`; add the owner-only equivalent for agents.
- Customer consent default unchecked: web `app/aeps/page.tsx`, mobile `AepsScreen.tsx`.
