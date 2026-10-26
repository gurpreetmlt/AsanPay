# KYC document photo checks — in-house (PL-05)

**Size:** L — split into the 3 chats below. **Surfaces:** backend, agent web, mobile, admin (parity rule).

## Goal

When an agent uploads PAN / Aadhaar front / Aadhaar back photos during signup KYC, check on our own
server (no vendor, nothing leaves EC2) that the photo is the right document with the right data.
Face match + original-vs-copy detection are **out of scope** (PL-06).

## Read ONLY

- `apps/backend/src/modules/kyc/kycDocuments.service.ts` — photo save / slots
- `apps/backend/src/modules/kyc/kyc.service.ts` — `submitKyc` (audit `kyc.submit` metadata)
- `apps/backend/src/modules/kyc/panVerify.service.ts`, `aadhaarOtp.service.ts` — verified PAN / eKYC data
- `apps/agent-portal/app/signup/page.tsx` — KYC upload fields (web)
- `apps/asanpay-mobile-app/src/screens/signup/SignupScreen.tsx` — KYC upload fields (mobile)
- `apps/admin-portal/app/users/[id]/page.tsx`, `components/users/KycDocumentGrid.tsx` — admin view

## Chat 1 — backend check engine ✅ done (26 Oct)

Built in `apps/backend/src/modules/kyc/docCheck/` (`docCheck.service.ts` engine, `docText.ts` rules,
`aadhaarSecureQr.ts`, `imageQuality.ts`, `ocr.ts`); tests `test/kycDocCheck.test.ts`.
Response also has `qr` (name, dob, gender, aadhaarLast4, address, verified) when a Secure QR is read.
UIDAI certs bundled in `apps/backend/assets/uidai/` (all offline e-KYC + Secure QR certs from
uidai.gov.in/en/data-and-download; old ones kept — older cards are signed with older keys). When UIDAI
publishes a new one, add the `.cer` there. A signed-QR Aadhaar last-4 mismatch is a hard `fail`.

- New `POST /api/kyc/documents/check` `{ slot: "panImage" | "aadhaarFront" | "aadhaarBack", dataUrl }` → `{ ok, status: "pass" | "flag" | "fail", docType, checks: [...], message }`.
- **Quality:** reject tiny (< 600 px short side), very dark, or blurry (Laplacian variance) images → `fail` "Photo is blurry. Retake it in good light with the full card visible."
- **Aadhaar Secure QR:** decode QR from image (`zxing` / `jsqr` + `sharp`), decompress, parse fields + photo, verify RSA signature with UIDAI public cert (bundle the cert in repo). Valid → strong pass; extract name, DOB, gender, last 4 digits, address.
- **OCR:** Tesseract (`tesseract.js`, eng + hin), server-side. Rules:
  - PAN: "INCOME TAX DEPARTMENT" / "Permanent Account Number" + PAN regex `[A-Z]{5}\d{4}[A-Z]`.
  - Aadhaar front: "Government of India" + 12-digit (masked ok) + DOB/gender.
  - Aadhaar back: "Unique Identification Authority" / "Address" / QR present.
- **Data match:** PAN number from OCR == verified PAN; name fuzzy match (≥ 0.8) vs PAN name. Aadhaar last 4 + name + DOB vs OTP eKYC (or QR data).
- Status: wrong doc type or PAN number mismatch → `fail`; name fuzzy < 0.8 or OCR unreadable → `flag`; all good → `pass`.
- Save result per slot in `kyc.submit` metadata (`docChecks`) — no new table needed. Never log Aadhaar numbers in plain text.
- Timeout 8 s → treat as `flag` (never block signup because our checker is slow).

## Chat 2 — web + mobile upload UX (same change, both apps) ✅ done (26 Oct)

Shared copy + result → UI mapping in `packages/shared-types/kycDocCheck.ts` (both apps import it).
Continue is disabled while a photo on the step is checking or was rejected; picking a new photo
(or Remove on web) clears the red state. Network / server error → amber (never blocks).
PDF uploads and photos picked before the account exists are not checked.

- After choosing a photo, call the check; show "Checking photo…".
- `fail` → red text under that field with the exact `message`, clear the photo, Continue stays disabled for that step.
- `flag` → amber text "We couldn't fully read this photo — it will be reviewed." photo kept.
- `pass` → green "✓ PAN card verified" / "✓ Aadhaar QR verified".
- English copy only; same strings on web + mobile.

## Chat 3 — admin

- KYC queue + user page: labels per doc: "✓ PAN photo matched", "✓ Aadhaar QR verified", "⚠ Name mismatch (72%)", "✗ Wrong document".
- Filter in KYC queue: "Flagged photos".

## Done check

- [ ] Wrong image in PAN field → blocked with clear message (web + mobile)
- [ ] Real Aadhaar back with clear QR → "Aadhaar QR verified"
- [ ] Blurry photo → retake message
- [ ] Admin sees labels; nothing sent to third parties
- [ ] `docs/CHECKLIST.md` + PLANNING PL-05 → done; then **remind owner about PL-06**
