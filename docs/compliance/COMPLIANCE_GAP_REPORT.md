# AsanPay — Compliance matrix + codebase gap report

> Stage 1 of the compliance programme (research + gap analysis only — **no code changed**).
> Researched 26 Oct 2026 from official sources (rbi.org.in, uidai.gov.in, indiacode.nic.in, meity.gov.in, cert-in.org.in).
> This is an engineering analysis, **not legal advice**. Nothing here means AsanPay is "RBI compliant".
> Every row marked **CONFIRM** needs written confirmation from the sponsor/acquiring bank, the API provider, or Indian counsel.

Legend — **Type**: `Statutory` (law/regulation binds AsanPay directly) · `Regulatory-on-partner` (binds the bank / NPCI / NBBL; reaches AsanPay only through contract) · `Contractual` (partner agreement) · `Recommended` (internal control, no legal mandate).

---

## 0. AsanPay's legal role (must be confirmed before building workflow)

What the code shows (provider integrations): AsanPay is **not** a bank, **not** an RBI-authorised payment system operator (PSO) and has **no** RBI authorisation on record in this repo. AEPS / DMT / recharge run through an API provider (`providers/noble/*`), PAN/Aadhaar verification through another API provider, BBPS / bill-pay rails are not live.

Most likely structure (CONFIRM with the provider + its bank):

| Layer | Likely entity | Regulated by |
|---|---|---|
| Acquiring / sponsor bank | Bank behind the provider's AEPS + DMT rails (not named in repo) | RBI (bank) |
| Corporate BC / BC network manager / aggregator | The API provider (or its parent) | Bank contract (RBI BC directions apply to the bank) |
| Distribution network | **AsanPay** (Admin → SD → Distributor) | Contract with provider; statutory: IT Act, DPDP, Aadhaar Act, CERT-In |
| AePS touchpoint operator (ATO) / BC sub-agent / DMT agent | **Retailer** | Onboarded *by the bank* (via provider); AsanPay only collects + forwards |

Consequences:
- RBI directions addressed to banks (ATO due diligence, BC rules, KYC Directions) **do not bind AsanPay directly**. They reach AsanPay only through the provider/bank agreement. The software must still support them because the bank will refuse/turn off retailers who fail them.
- Laws that **do** bind AsanPay directly: IT Act 2000 (+ CERT-In directions), Aadhaar Act 2016 + Sharing of Information Regulations (AsanPay collects Aadhaar numbers), DPDP Act 2023 (from 13 May 2027 for the main duties), Indian Contract Act, state stamp laws for agreements.
- Two structural risks need counsel before more features ship: **agent wallets** (PPI question, §1 row 13) and **UPI QR collections / settlements** (payment aggregator question, §1 row 12).

---

## 1. Regulatory compliance matrix

| # | Instrument | Reference · issue date | Effective | Applies to AsanPay? | Type | Source |
|---|---|---|---|---|---|---|
| 1 | **AePS – Due Diligence of AePS Touchpoint Operators** | RBI/2025-26/63, CO.DPSS.POLC.No.S339/02-01-001/2025-2026 · 27 Jun 2025 | **1 Jan 2026** | Addressed to banks + NPCI. Reaches AsanPay contractually: retailers are ATOs | Regulatory-on-partner → Contractual | [rbi.org.in Id=12877](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12877) |
| 2 | KYC reference update for payment system directions | RBI/2025-26/101, CO.DPSS.POLC.No.S-955/02-30-010/2025-26 · 28 Nov 2025 | Immediate | Old KYC Master Direction 2016 **repealed**; all PSS references (incl. row 1) now read as row 3 | Regulatory-on-partner | [rbi.org.in Id=13171](https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=13171) |
| 3 | **RBI (Commercial Banks – Know Your Customer) Directions, 2025** (+ Amendment Directions 2026: RBI/2026-27/257, DOR.AML.REC.226/14.01.002/2026-27, 18 Sep 2026) | 28 Nov 2025 (reference no. of base direction: CONFIRM on RBI MD list) | Immediate | Banks. Individual CDD (para 16 equivalent) is the standard the bank applies to ATOs | Regulatory-on-partner | [Amendment Id=13699](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13699&Mode=0) · [Consolidation press release](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=61705) |
| 4 | **RBI (Commercial Banks – Branch Authorisation) Directions, 2025** — Chapter V BC model, paras 65–87 | RBI/DOR/2025-26/147, DOR.LIC.REC.No.66/22-01-001/2025-26 · 28 Nov 2025 | Immediate | Banks. BC due diligence (69), sub-agent oversight by base branch (70), sub-agent represents the appointing bank (72), KYC/AML = bank responsibility (75), outlet signage incl. fees + grievance contacts, training, grievance machinery (86) | Regulatory-on-partner → Contractual | Copy used: [PDF](https://avantiscdnprodstorage.blob.core.windows.net/legalupdatedocs/49963/Reserve-Bank-of-India-Commercial-Banks-Branch-Authorisation-Directions-2025-DEC012025.pdf) — CONFIRM against rbi.org.in MD list |
| 5 | **Domestic Money Transfer – Review of Framework** | RBI/2024-25/52, CO.DPSS.POLC.No.S415/02.27.019/2024-25 · 24 Jul 2024 (2011 limits circular DPSS.PD.CO.No.622 still applies) | 1 Nov 2024 | Remitting banks **and their BCs**: remitter registered on verified mobile + self-certified OVD; **AFA on every remitter txn**; Income-Tax cash-deposit rules; remitter details + cash identifier in IMPS/NEFT message | Regulatory-on-partner (BC agents in scope) | [rbi.org.in Id=12707](https://rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12707) |
| 6 | **Master Direction – BBPS Directions, 2024** | RBI/DPSS/2023-24/111, CO.DPSS.POLC.No.S1114/02-27-020/2023-2024 · 29 Feb 2024 | 1 Apr 2024 | Para 3(b): bill payment **outside BBPS needs PSS authorisation**. Agent Institutions must be **NBBL-certified** and onboarded by a COU; COU responsible for them. NBBL procedural guidelines: an **Agent cannot onboard sub-agents** | Regulatory-on-partner + Structural | [rbi.org.in Id=12616](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12616) · [NBBL procedural guidelines](https://www.bharat-connect.com/strapi/uploads/Procedural_Guidelines_BBPS_June_24_V4_1_1e6f44afdd.pdf) |
| 7 | NPCI AePS OC 088/2023-24 — BC/agent biometric authentication | NPCI, Dec 2023 | 1 Jan 2024 | Agent 2FA **at least once daily**, one factor Aadhaar biometric; **block 24h after 3 consecutive biometric mismatches**, investigate before re-enable | Regulatory-on-partner → Contractual | Secondary only ([BusinessLine](https://www.thehindubusinessline.com/money-and-banking/npci-swings-into-action-to-prevent-aeps-frauds/article67672192.ece)); NPCI text is member-only — CONFIRM with bank |
| 8 | NPCI AePS OC 096 (FY 26-27) step-up authentication for CW + Aadhaar Pay; OC 095 UIDAI Aadhaar status notification APIs | NPCI FY 26-27 / 25-26 | CONFIRM | Title verified on NPCI list; content not public — CONFIRM what the provider must change | Contractual | [npci.org.in AePS circulars](https://www.npci.org.in/circulars/aeps) |
| 9 | **Aadhaar Act 2016 s.29 + Aadhaar (Sharing of Information) Regulations 2016, regs 5–6** | UIDAI No. 5 of 2016 · 12 Sep 2016 | In force | **Yes, directly** — AsanPay collects Aadhaar numbers. Reg 5: lawful purpose; tell the holder purpose, mandatory/voluntary + legal basis, alternatives; consent. Reg 6: never display publicly (mask to last 4), keep confidential, encrypted transmission, **retain no longer than needed**. Contravention = s.29(2) violation | **Statutory** | [UIDAI compendium](https://uidai.gov.in/images/resource/Compendium_August_2019.pdf) |
| 10 | UIDAI Aadhaar Data Vault — Circular 14 of 2025 + ADV FAQ (3 Nov 2025) | UIDAI 2025 | In force | Requesting entities (AUA/KUA) only. AsanPay is not an RE (CONFIRM) → AsanPay should not hold full Aadhaar numbers at all; masked/encrypted copies outside an ADV are not allowed for REs | Statutory for REs / Recommended for AsanPay | [Circular 14/2025](https://www.uidai.gov.in/images/Circular-No.14_of-2025.pdf) · [ADV FAQ](https://uidai.gov.in/images/FAQs_Aadhaar_Data_Vault_03112025_v10.pdf) |
| 11 | **IT Act 2000 — s.3A + Second Schedule (Aadhaar / other e-KYC eSign via CCA-licensed providers), s.10A (e-contracts valid)** | Act 21 of 2000; Schedule amended 2015, 2019 | In force | **Yes.** Click-accept is a valid e-contract (s.10A) but has **no statutory presumption** of signature; Aadhaar eSign / DSC is a recognised electronic signature (s.3A). Evidence quality, not a blanket mandate | **Statutory** (choice of method = legal/partner decision) | [s.10A](https://www.indiacode.nic.in/show-data?actid=AC_CEN_45_76_00001_200021_1517807324077&orderno=14&sectionId=13023&sectionno=10A) · [Second Schedule](https://upload.indiacode.nic.in/schedulefile?aid=AC_CEN_45_76_00001_200021_1517807324077&rid=394) · [CCA](https://cca.gov.in/) |
| 12 | Master Direction on Regulation of Payment Aggregators | RBI/DPSS/2025-26/141, CO.DPSS.POLC.No.S-633/02-14-008/2025-26 · 15 Sep 2025 | 15 Sep 2025 | **Uncertain.** Applies if AsanPay collects customer funds for merchants and settles them (UPI QR collections → retailer wallet; wallet top-ups). Non-bank PA needs RBI authorisation | Statutory if in scope — **CONFIRM with counsel before P9 ships** | [rbi.org.in MD id=12896](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896) |
| 13 | Master Directions on Prepaid Payment Instruments | (referenced in row 2 annex) | In force | **Uncertain.** Agent Main / AEPS balances held by AsanPay: closed-system float vs. PPI. Settlement of AEPS balance to bank is the sensitive part | **CONFIRM with counsel** | Row 2 annex |
| 14 | Storage of Payment System Data | RBI/2017-18/153, DPSS.CO.OD No.2785/06.08.005/2017-2018 · 6 Apr 2018 | 2018 | System providers must keep end-to-end payment data **only in India**, incl. data with their service providers / vendors → flows to AsanPay | Regulatory-on-partner → Contractual | [rbi.org.in MD id=11244](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=11244) |
| 15 | **DPDP Act 2023 + DPDP Rules 2025** | Rules G.S.R. 846(E); Act commencement G.S.R. 843(E) · 13 Nov 2025 (corrigendum 16 Dec 2025) | Rules 3, 5–16 from **13 May 2027**; Rule 4 from 13 Nov 2026 | **Yes, directly** (AsanPay = Data Fiduciary). Standalone itemised notice + easy withdrawal (R3); security safeguards incl. **access logs kept 1 year** (R6); **breach report to Board within 72h** (R7); retention/erasure (R8, min 1-year logs); contact person (R9) | **Statutory** | [Rules PDF](https://www.dpdpa.in/dpdpa_rules_2025/dpdpa_rules_english_2.pdf) · [MeitY](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa) · [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014) |
| 16 | **CERT-In Directions under s.70B(6) IT Act** | No. 20(3)/2022-CERT-In · 28 Apr 2022 | 28 Jun 2022 | **Yes, directly** (body corporate). Report listed incidents **within 6 hours**; keep ICT logs **180 days rolling, in India**; NTP time sync | **Statutory** | [CERT-In PDF](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf) |
| 17 | PMLA 2002 / PML (Maintenance of Records) Rules 2005 | — | In force | Reporting-entity duties sit with banks / PSOs. AsanPay: not a reporting entity unless authorised (CONFIRM). Bank contracts usually require AsanPay to **escalate suspicious activity to the bank** | Conditional / Contractual | Cited in row 3 |
| 18 | Grievance redress — BC grievance machinery (row 4 para 86), BBPS ODR (row 6 para 8), TAT harmonisation for failed txns (20 Sep 2019, per row 6) | — | In force | Bank / COU duty; AsanPay supplies complaint capture + TAT tracking + bank grievance contacts in app | Contractual | Rows 4, 6 |

**Not verified this session (do not cite as fact until checked):** stamp duty on e-agreements (state Stamp Acts / e-stamping), Bharatiya Sakshya Adhiniyam 2023 rules on electronic-record evidence, police verification of agents (RBI does **not** prescribe it — some banks' BC policies do).

### What these rows mean for features

| Area | Verified rule | Who it binds | Build in AsanPay as |
|---|---|---|---|
| ATO onboarding KYC | Individual CDD before onboarding; reuse BC/sub-agent DD allowed (row 1 §2.1) | Bank | Collect + forward KYC; record **bank/provider approval** per retailer; AEPS stays off until approval |
| ATO inactivity | No customer txn (financial or non-financial) for **3 continuous months** → bank re-KYC before transacting (row 1 §2.2) | Bank | Track last customer AEPS txn; auto-suspend AEPS only (not other services); unlock only after **provider re-KYC confirmation** |
| ATO monitoring | Ongoing monitoring by location, type, volume, velocity (row 1 §3) | Bank | Risk signals + escalation feed to provider/bank (Recommended + Contractual) |
| Daily agent auth | Daily 2FA incl. biometric; 3 mismatches → 24h block (row 7) | Bank | Already partly built (daily 2FA) — add mismatch counter if provider does not |
| DMT | Verified mobile + OVD remitter registration, AFA per txn (row 5) | Bank + BC | Already via provider eKYC + transaction OTP — keep |
| BBPS | Only via NBBL-certified Agent Institution; no sub-agents under an Agent (row 6) | Structural | **Do not** expose SD → D → R chain as BBPS sub-agents; CONFIRM AI status before go-live |
| Aadhaar numbers | Purpose notice + consent, mask, minimise retention (row 9) | **AsanPay** | Store last-4 + provider reference only; consent screen before capture |
| Agreements | e-contract valid (s.10A); eSign = recognised signature (s.3A) | **AsanPay** | Configurable signing policy per agreement type; eSign only where partner/counsel requires |
| Privacy | DPDP notice, logs 1 yr, 72h breach (row 15) | **AsanPay** (from 13 May 2027) | Privacy notice + consent records, access logs, breach runbook |
| Security logs | 180-day logs in India, 6h incident reporting (row 16) | **AsanPay** (now) | Log retention + NTP + incident runbook |
| Data location | Payment data only in India (row 14) | Partner → AsanPay | Confirm DB + backups + log sinks are India-region |

---

## 2. Codebase gap report

Severity: **S1** = active legal/security exposure today · **S2** = blocks partner/regulatory requirement · **S3** = control improvement.
Basis column points at §1 rows. Paths relative to `apps/backend/src` unless noted.

### 2.1 Fix first (S1 — exposure today)

| # | Gap | Evidence | Basis | Fix |
|---|---|---|---|---|
| G1 | **KYC images are public.** `/uploads` served by `express.static` with no auth; `POST /kyc/documents/upload` returns the public path | `app.ts:92`, `kyc/kycDocuments.service.ts:27,66-72` | Row 9 reg 6(1)-(3) (Aadhaar images), row 15, row 16 | Remove static mount; serve only via authenticated proxy (admin already has `GET /admin/users/:id/kyc-documents/:docKey`) + owner-only route; move files off container disk to private object storage (India region) |
| G2 | **Full Aadhaar returned to the client.** `GET /auth/agent-auth/status` returns decrypted 12 digits; `GET /onboarding/noble/identity` returns full PAN + Aadhaar | `auth/agentAuth.ts:44-58`, `onboarding/nobleOnboarding.service.ts:107-126` | Row 9 reg 6 | Return last-4 only; resolve full number server-side when calling the provider |
| G3 | **KYC data lives in audit logs and is auto-deleted.** `kyc.submit` metadata holds full bank account no., DOB, addresses and base64 images; profile + admin docs read from it; audit partitions dropped after 6 months | `kyc/kyc.service.ts:217-255,118`, `admin/admin.service.ts:133,241`, `jobs/logPartitions.ts:17-20` | Row 9 reg 6(5), row 15 (R6/R8), row 16 (180-day logs) | New `kyc_documents` + `kyc_submissions` tables; audit stores only refs/hashes; backfill before next partition drop |
| G4 | **No redaction in app logs; webhook tokens in access logs.** pino has no `redact`; morgan `combined` logs `?token=` query strings; `provider_logs` keeps raw responses and full Noble callback bodies | `utils/logger.ts:4-10`, `app.ts:85`, `providers/provider.router.ts:213-221`, `noble/webhook.routes.ts` | Row 15 R6, row 16 | pino `redact` paths; strip query tokens from morgan; redact provider responses (Aadhaar, account no., names) |
| G5 | **Unauthenticated / weak webhooks.** Provider callback: no auth. WhatsApp: no `X-Hub-Signature-256` check. VyaparAPI + Telegram: query token compared with `!==` | `noble/webhook.routes.ts`, `whatsapp/support/webhook.routes.ts:30-37`, `vyaparapi/webhook.routes.ts:21-34` | Recommended (security) | Shared secret / HMAC, `timingSafeEqual`, timestamp window, event-id dedupe (P10 must include this) |
| G6 | **Customer Aadhaar consent pre-ticked; no consent stored.** AePS customer consent defaults checked; agent/customer consent never sent to API | web `app/aeps/page.tsx:455`, mobile `AepsScreen.tsx:647` | Row 9 reg 5(1)(c) | Default unchecked; send `consentVersion` with txn; store in txn data |

### 2.2 Partner / regulatory blockers (S2)

| # | Gap | Evidence | Basis | Fix |
|---|---|---|---|---|
| G7 | **No onboarding state machine.** Only `kycStatus` + `isActive`; retailers active at creation | `auth/auth.service.ts:194,1772`; `schema/users.ts` | Rows 1, 4 (bank approval before onboarding) | `onboarding_applications` with proposed statuses (§3) |
| G8 | **No per-retailer service approval.** AEPS usable after admin KYC approve + self-service provider onboarding; no record of *bank/provider* approval; no per-user service flags | `aeps/compliance.ts:38-107`, `onboarding/onboarding.routes.ts:34-72` | Row 1 §2.1, row 6 | `service_approvals(user, service, partner, status, partner_ref, approved_at, expires_at)`; txn gate reads it |
| G9 | **Dormancy unlock ignores re-KYC.** 90-day dormancy computed, but `reactivateAeps` only needs existing `verified` KYC + admin reason; never-transacted agents never go dormant; no persisted dormant state | `aeps/compliance.ts:85-93`, `admin/admin.service.ts:789-848` | Row 1 §2.2 | Persist `aeps_dormant_since`; rule = 3 calendar months since last *customer* AEPS txn (or since approval if none); unlock requires provider re-KYC confirmation event (+ admin exception path with reason, dual approval) |
| G10 | **No agreement / terms acceptance evidence.** Checkboxes exist client-side only; Zod strips them; no version, hash, timestamp, no agreement tables, no eSign | web `app/signup/page.tsx:997,1064`, `packages/shared-types/legalCopy.ts` | Row 11 (evidence), row 15 R3 | Agreement module (§4) |
| G11 | **KYC rejection has no reason; no review history table; approval does not require PAN/Aadhaar verification success** (verify results are not persisted) | `admin/admin.service.ts:1089-1116`, `kyc/panVerify.service.ts`, `kyc/aadhaarOtp.service.ts` | Rows 1, 3 (CDD evidence) | `kyc_verification_events`; reason required on reject; approve blocked unless PAN + Aadhaar verification events exist |
| G12 | **Daily 2FA mismatch rule differs from NPCI.** App blocks after 2 mismatches on one *customer* hash (EDD); NPCI rule is 3 consecutive *agent* biometric mismatches → 24h block | `aeps/compliance.ts:146-180`, `auth/agentAuth.ts` | Row 7 | CONFIRM whether provider/bank already enforces; if not, add agent-auth mismatch counter + 24h lock |
| G13 | **BBPS hierarchy.** SD → D → R tree cannot be BBPS sub-agents | — | Row 6 | Product decision before BBPS go-live |
| G14 | **Data location unknown.** AGENTS.md says Postgres on Neon in prod; region not documented; uploads on container disk | `AGENTS.md` | Row 14 | CONFIRM DB, backups, logs, object storage are India region |

### 2.3 Controls to add (S3)

| # | Gap | Evidence | Fix |
|---|---|---|---|
| G15 | Audit log not tamper-evident; 6-month retention | `schema/logs.ts:29-47`, `jobs/logPartitions.ts` | Separate `compliance_audit_logs`: append-only trigger (like `0023_ledger_guards.sql`), hash chain, ≥ 1 year (DPDP R6) — retention period per partner contract (often 5–10 yrs: CONFIRM) |
| G16 | Single-admin decisions: KYC, AEPS reactivation, restriction, parent reassignment (no reason required for reassignment) | `admin/admin.service.ts:925-1066,789-848` | Reason mandatory everywhere; dual approval for compliance overrides |
| G17 | Hard delete of users removes transactions + ledger history; UIDs can be reused | `admin/admin.service.ts:633-773,762` | Replace with deactivate/terminate; never reuse UIDs |
| G18 | Single AES key, no rotation; customer Aadhaar hash unsalted | `utils/aes.ts:17-33`, `aeps/compliance.ts:15` | Key versioning; HMAC with secret pepper instead of bare SHA-256 |
| G19 | Privacy page claims retention "as required by RBI"; no itemised notice; no terms page on marketing site | `apps/agent-portal/app/privacy/page.tsx`, `Frontend/src/app/privacy/page.tsx` | Rewrite with counsel; itemised notice before 13 May 2027 |
| G20 | Test OTP override / OTP-in-response flags exist | `config/env.ts:65,332`, `auth/auth.service.ts:1547,1579-1587` | Hard-fail boot if enabled with production keys |
| G21 | Web `/aeps` sends no geo, so geofence is skipped | `transactions/txn.validators.ts:133-197` | Make geo required for AEPS on both surfaces (same rule) |

### 2.4 Already in place (keep)

- PAN + Aadhaar encrypted at rest (AES-256-GCM); admin sees masked values.
- Aadhaar OTP never stored; logs show last-4 only; PID never stored (hash-only replay guard).
- Daily agent 2FA with Aadhaar match + replay guard; AEPS gates (active, KYC, block, EDD, dormancy, geofence).
- Mobile permissions are minimal: no IMEI, no installed-app list, no contacts/SMS, `allowBackup=false`, random per-install device id. Location is fine-grained — keep only for outlet geofence + AEPS, disclose purpose.
- `requireAuth` re-reads role/active/block from DB each request; admin router admin-only; retailer cannot set own KYC status.
- Maker-checker already on recon adjustments, float transfers, settlement accounts, admin wallet moves (pattern to reuse).
- Append-only DB triggers on ledger tables (pattern to reuse for compliance audit).

---

## 3. Recommended architecture (summary)

**Onboarding status** (proposed workflow, not RBI names): `DRAFT → KYC_PENDING → KYC_UNDER_REVIEW → AGREEMENT_PENDING → PARTNER_APPROVAL_PENDING → APPROVED → ACTIVE`, side states `REJECTED · SUSPENDED · EXPIRED · TERMINATED`. Transitions only through one service function that validates the edge, actor role and evidence, inside a DB transaction, writing a compliance audit event. Retailers can only move `DRAFT → KYC_PENDING` (submit) and resubmit after `REJECTED`.

**Service activation** = `onboarding.status = ACTIVE` **and** `service_approvals(service).status = APPROVED` (partner reference present, not expired) **and** service-specific gates (AEPS: not dormant, daily 2FA). Admin KYC approval alone never enables AEPS / DMT / BBPS.

**Agreements**: `agreements` (type) → `agreement_versions` (immutable content, SHA-256, effective_from, status draft/published, signing_policy) → `user_agreement_acceptances` (version, method, hash, event id, session ref, IP/UA when disclosed, provider ref, status, superseded_by). Signing policy per (agreement type, role): `click_accept | otp_confirm | aadhaar_esign | dsc`. eSign behind an adapter interface with **no vendor wired** until owner confirms vendor, cost and policy.

**Proposed new tables** (reuse `users`, `audit_logs` writer, ledger maker-checker pattern): `onboarding_applications`, `onboarding_status_events`, `kyc_submissions`, `kyc_documents`, `kyc_verification_events`, `agreements`, `agreement_versions`, `user_agreement_acceptances`, `esign_requests`, `esign_events`, `service_approvals`, `compliance_audit_logs`, `compliance_policy_versions`. All additive migrations; existing `kycStatus` kept and derived during transition.

---

## 4. Implementation queue

One phase per chat → see [`docs/TASKS/compliance-queue.md`](../TASKS/compliance-queue.md).

---

## 5. Questions that need written answers

**Provider / acquiring bank**
1. Which bank is the AEPS acquiring bank and the DMT remitting bank? Is the provider a corporate BC, BC network manager or sub-aggregator?
2. Is AsanPay registered in the bank's records (sub-BC / BCNM / distributor)? Are retailers onboarded as ATOs / BC sub-agents *by the bank*?
3. Who performs ATO CDD (row 1 §2.1) — bank, provider, or AsanPay collecting for them? Which documents, and does the provider's merchant eKYC count as bank onboarding?
4. How will the bank/provider tell us an ATO is approved, suspended, re-KYC'd after 3-month inactivity, or due for periodic KYC update? (API, webhook, report?)
5. Does the provider already enforce NPCI daily 2FA + 3-mismatch 24h block, and the new OC 096 step-up authentication?
6. Required agreements: does the bank/provider require a specific retailer / distributor agreement, declarations, stamp duty, or Aadhaar eSign?
7. Record retention period required for KYC, agreements and transaction logs; audit rights over AsanPay; data-location requirement (row 14).
8. Suspicious-activity escalation: format, channel and timeline.
9. BBPS: which COU; is AsanPay (or the provider) an NBBL-certified Agent Institution? Can distributors exist in the BBPS chain at all?

**Indian counsel**
10. Do agent Main / AEPS wallet balances and bank settlement make AsanPay a PPI issuer (row 13)?
11. Do UPI QR collections credited to retailer wallets make AsanPay a payment aggregator (row 12)? Hold P9 until answered.
12. Is AsanPay a PMLA reporting entity in any service line (row 17)?
13. Minimum signing method per agreement type (click-accept vs OTP vs Aadhaar eSign vs DSC); stamp duty on e-agreements by state.
14. DPDP: privacy notice text, lawful basis for each data item, retention schedule.
