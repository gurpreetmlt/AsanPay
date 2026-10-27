# Figma prompt — Daily 2FA redesign, Aadhaar card view (PL-13)

Paste into Figma AI / give to the designer. Design both **web (1440 px)** and **Android mobile (360 × 800)**.

---

Redesign the **Daily verification (2FA)** screen of **AsanPay**, a B2B fintech app for Indian retail agents. Before the first AePS / Aadhaar Pay transaction of the day, the agent must verify themselves with their own Aadhaar biometric (fingerprint on an RD device, or face on Android). Today the screen is a plain form; make it feel like the agent is verifying **their own Aadhaar card**.

**Brand**
- Font: Poppins
- Primary blue #0B2A9A, mid blue #2A5CDD, light background #F0F4FF, secondary surface #E8EEFB, muted text #5A6DA8
- Success green #12B76A (dark #0F9E5C) · warning amber #F59E0B · error red #DC2626
- Main CTA: green → blue gradient pill. Secondary = white outline. Cancel = red.
- Rounded cards (16–20 px), soft shadows, clean fintech look. English copy only.

**Do not** use the official UIDAI / Aadhaar logo or the national emblem. Use a neutral placeholder emblem (fingerprint inside a sun-ray circle) and the word "Aadhaar" in plain text.

## Page layout

**Header:** back arrow · title "Daily verification" · subtitle "Verify once a day before your first AePS or Aadhaar Pay transaction." · small location chip on the right ("Location on · ±12 m").

**1. Hero: Aadhaar-style card** (the focus of the page, ID-card ratio 85.6 : 54)
- Card face: white with a thin saffron → white → green gradient band at the top and a faint fingerprint watermark.
- Top-left: placeholder emblem + "Aadhaar" + small text "Linked to your AsanPay account".
- Top-right: status pill. Amber "Not verified today", or green "Verified today · valid till 11:59 PM".
- Left: agent photo (from KYC) in a rounded square. Initials if there is no photo.
- Right: agent name (bold), role chip "Retailer · ASPR100123".
- Bottom: masked number in large, spaced digits **XXXX XXXX 9608**, with a small lock icon. No reveal button, the full number is never shown.
- Small green chip under the number: "KYC verified · Aadhaar OTP".

**2. Verify with** (segmented tiles under the card)
- **Fingerprint** (default, selected): icon + "RD device".
- **Face** (Android only): icon + "Uses the Face RD app". On web this tile is greyed out with "Android app only".
- **Iris**: disabled, "Coming soon".

**3. Device row**
- Connected: green dot + "Mantra MFS110 · connected" + "Change".
- Not found: red row "No RD device found. Connect the device and open RD Service, then tap Retry." + Retry (secondary).

**4. Consent card:** checkbox "I accept Aadhaar consent for today's AePS access" + "Read consent" link (expands the full text inline).

**5. Main CTA:** full-width gradient pill "Scan fingerprint" ("Verify with face" when Face is selected). Disabled until consent is ticked and a device is ready.

**6. Help panel** (web: right column 380 px · mobile: below the CTA)
- Numbered steps: 1 Connect the RD device · 2 Accept consent · 3 Place the same finger you used for Aadhaar.
- Tips: "Clean the sensor" · "Press gently and hold still" · "Try another finger if it fails".
- Small note: "Your fingerprint is sent encrypted to UIDAI. AsanPay never stores it."

## States (one frame each, web + mobile)
1. **Not verified today:** idle, as above.
2. **Device not found:** red device row, CTA disabled.
3. **Scanning:**
   - Pulsing fingerprint ring over the card.
   - Text "Place your finger on the device…".
   - Capture quality bar ("Quality 72%").
   - CTA shows "Scanning…" with a spinner.
4. **Verifying:**
   - Card shimmer.
   - Text "Checking with UIDAI…".
5. **Success:**
   - Green "Verified" stamp animates onto the card, and the status pill turns green.
   - Text "You're verified for today. Valid till 11:59 PM."
   - CTA "Continue to AePS" (blue).
6. **Failed:**
   - Red banner with the exact reason, e.g. "Fingerprint did not match your Aadhaar. Clean the sensor or try another finger."
   - Buttons: "Try again" (blue) and "Use face instead" (secondary, Android).
7. **Already verified today:** compact card, green pill, single CTA "Continue to AePS".
8. **Aadhaar not in KYC:**
   - Card shows a dashed outline and "Aadhaar not found in your KYC".
   - CTA "Complete KYC" (blue).

## Motion
- The card floats gently (2 px).
- Fingerprint pulse while scanning, and a stamp "pop" on success.
- Respect reduced-motion: no float or pulse, only instant state changes.

## Reuse
Design it as one component. The same layout is used for the DMT and Aadhaar Pay daily verification. Only the title, the consent sentence and the "Continue to …" label change.
