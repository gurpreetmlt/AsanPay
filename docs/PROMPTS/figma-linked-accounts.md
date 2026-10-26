# Figma prompt — Linked accounts + role switch (PL-01)

Paste into Figma AI / give to the designer. Design both **web (1440 px)** and **Android mobile (360 × 800)**.

---

Design a "Linked accounts & switch role" feature for **AsanPay**, a B2B fintech app for Indian retail agents (Retailer, Distributor, Super Distributor). One person can own a Distributor account and a Retailer account on two different mobile numbers. They link them once, then switch between them from the dashboard without logging out.

**Brand**
- Font: Poppins
- Primary blue #0B2A9A, mid blue #2A5CDD, light background #F0F4FF, secondary surface #E8EEFB, muted text #5A6DA8
- Success / add green #12B76A (dark #0F9E5C)
- Buttons: Submit / Continue / Verify = blue; Add / Link = green; Cancel / Unlink = red; secondary = white outline
- Rounded cards (16 px radius), soft shadows, clean fintech look. English copy only.

**Screens (web + mobile for each)**

1. **Header account switcher**
   - Avatar + name + role chip (e.g. "Distributor · ASPD100123") in the top bar.
   - Opens a dropdown / bottom sheet listing: current account (check mark), linked account(s) with role chip, masked mobile (XXXXXX4521) and Main balance, then "+ Link another account" and "Manage linked accounts".
   - Each linked row has a "Switch" action.

2. **Switch confirm**
   - Small modal / bottom sheet: "Switch to Retailer account?" with name, role, masked mobile.
   - 4-digit MPIN input, Cancel (red) and Switch (blue).
   - Loading state "Switching…", then the dashboard of that role with a toast "You are now using your Retailer account".

3. **Link account — step 1**
   - Title "Link another account". Explainer: "Link your other AsanPay account (same PAN / Aadhaar) to switch without logging out."
   - Field: "Mobile number of the other account" (+91 prefix). Helper: "We will send an OTP to this number."
   - Buttons: Cancel (red), Send OTP (blue).

4. **Link account — step 2**
   - 6-digit OTP boxes, resend timer (00:30), MPIN / password field for that account.
   - Inline errors: "Incorrect OTP. Check the code and try again." / "This account belongs to a different PAN / Aadhaar and cannot be linked."
   - Buttons: Back, Link account (green).

5. **Success**
   - Check icon, "Accounts linked", both accounts shown side by side with role chips, CTA "Switch now" (blue) and "Done" (secondary).

6. **Settings → Linked accounts page**
   - List of linked accounts: avatar, name, role, masked mobile, linked on date, "Switch" and "Unlink" (red text).
   - Empty state: illustration + "No linked accounts yet" + "Link another account" (green).
   - Unlink confirm modal: "Unlink Retailer account? You will need OTP to link it again." Cancel / Unlink (red).

7. **Admin portal — user detail card** (web only)
   - Small "Linked accounts" card on the user profile: rows with role, UID, masked mobile, linked date, link method (OTP), and a "View" link.

**States to include:** loading, error, empty, disabled button, success toast.
**Mobile:** use bottom sheets instead of modals; switcher opens from the avatar in the top app bar.
