# Daily 2FA redesign — Aadhaar card view (PL-13)

**Size:** L — 2 chats (D1 web, D2 mobile). **Surfaces:** agent web + mobile (parity). No backend change
expected (same daily auth APIs).
**Design:** owner screens 27 Oct (idle + verified):
`~/.cursor/projects/Users-gurpreetchauhan-Desktop-AsanPay/assets/image-b7b1dde1-4149-46cc-b60c-4924016f0ff7.png`,
`…/image-2b34c095-9911-4f50-858b-a16cc3a1a187.png` · prompt [figma-daily-2fa.md](../PROMPTS/figma-daily-2fa.md).

## Read ONLY
- Web: `apps/agent-portal/app/aeps/page.tsx` (daily verification block ~L890–1100, `verifyDailyAgentAuth`), DMT / Aadhaar Pay 2FA gates (grep `agentAuthConsent`)
- Mobile: `apps/asanpay-mobile-app/src/screens/retailer/AepsScreen.tsx` (daily auth), DMT screen gate
- Data: KYC Aadhaar last 4 (`/kyc/me` → `aadhaarMasked`), agent photo (`/kyc/documents/personal-photo` if present), name, role, UID

## Build: one shared component per platform
Web `components/aeps/DailyVerifyCard.tsx` · mobile `components/DailyVerifyCard.tsx`. Props: title, consent text,
continue label, onVerified. Used by AePS, Aadhaar Pay and DMT gates (portal-type-scale rule: all 2FA gates match).

**Left — Aadhaar-style card (keep the owner's layout, refine):**
- True ID-1 shape (85.6 : 54, 16 px radius). One continuous saffron · white · green strip along the top edge
  (owner screen has gaps). Neutral emblem (fingerprint in a sun-ray circle) — never the UIDAI logo / national emblem.
- "Aadhaar · Linked to your AsanPay account" · status pill top-right (amber "Not verified today" / green
  "Verified today · valid till 11:59 PM").
- KYC photo tile ("KYC PHOTO" caption; initials fallback) · "ACCOUNT HOLDER" name · role chip "Retailer · ASPR…".
- "AADHAAR NUMBER" + lock + **XXXX XXXX 9608** (tabular, spaced) · chip "KYC verified · Aadhaar OTP".
- Faint fingerprint watermark; on success a rotated circular "VERIFIED TODAY" stamp pops in.
- Fill the column (no empty space under the card): info row "Last verified: yesterday 10:42 AM · Next: tomorrow".

**Right — action column:**
1. Verify with: Fingerprint (selected, check badge) · Face ("Android app only" on web) · Iris ("Coming soon", locked).
2. Device row: status dot + device name + "Change" (device picker); not found → red row with Retry.
3. Consent card: checkbox + "Read consent" (expands inline).
4. CTA gradient "Scan fingerprint" (disabled until consent + device) · under it "256-bit encrypted biometric verification".
5. Success: green banner "You're verified for today. Valid till 11:59 PM." + CTA "Continue to AePS".

**Bottom strip:** "Complete verification · takes less than a minute" + 3 steps + tips. **Hide after success.**

**States:** idle · no device · scanning (watermark pulse + quality %) · verifying ("Checking with UIDAI…") ·
success · failed (exact reason + Try again / Use face instead) · already verified · Aadhaar missing in KYC (Complete KYC).

**Mobile:** card full width on top → tiles → device → consent; CTA sticky at the bottom; steps/tips collapsible.
Reduced motion: no float / pulse / stamp animation.

## Done check
- [ ] AePS, Aadhaar Pay, DMT gates use the same component on web and mobile
- [ ] All 8 states reachable; copy English, errors field-specific
- [ ] `tsc` clean (mobile: only pre-existing errors); PLANNING PL-13 + CHECKLIST updated

**D1 web — done 27 Oct:** `components/aeps/DailyVerifyCard.tsx` on `/aeps` + `/dmt`. Web exceptions: Face tile and
"Use face instead" show an "Android app only" toast; quality % comes from the RD `qScore` after capture
(indeterminate bar while the finger is on the sensor). "Already verified" = `verifiedToday` prop (pages skip the
gate when verified, so it is only reachable via the prop).
