/** Shared signup legal copy — keep web + mobile popups identical. */

export const TERMS_BODY = `These Terms and Conditions ("Terms") govern the relationship between AsanPay ("AsanPay", "we", "us") and agents ("Agents") who register on the AsanPay platform to offer digital payment and related services.

1. Eligibility
You confirm that you are legally able to enter into this agreement, that the information you provide is true and complete, and that you will keep your KYC documents up to date.

2. Account & credentials
You are responsible for safeguarding your login credentials, OTP, MPIN and transaction PIN. Any activity under your account is deemed to be authorised by you unless you notify us promptly of unauthorised access.

3. Permitted use
Services (including AEPS, DMT, BBPS, recharge and related products) may be used only for lawful retail transactions at your registered outlet. You must not facilitate fraud, money laundering, or misuse of customer data.

4. KYC & compliance
You agree to complete KYC as required, allow verification by AsanPay or its partners, and comply with RBI, UIDAI, NPCI and other applicable guidelines. Location captured at registration may be used for outlet geofencing and compliance checks.

5. Fees, commission & settlement
Fees and commissions follow the published scheme for your role. Settlement is subject to successful provider confirmation and may be withheld or adjusted for chargebacks, disputes or policy breaches.

6. Suspension & termination
AsanPay may suspend or terminate access for KYC mismatch, fraud indicators, inactivity, or material breach of these Terms, without prejudice to other remedies.

7. Limitation of liability
To the fullest extent permitted by law, AsanPay is not liable for indirect or consequential losses, provider outages, or delays beyond our reasonable control.

8. Changes
We may update these Terms. Continued use after notice constitutes acceptance of the updated Terms.

9. Contact
For questions about these Terms, contact AsanPay support through the channels published in the agent app or website.`;

export const PRIVACY_BODY = `This Privacy Policy explains how AsanPay ("we", "us") collects, uses and protects personal information when you register and use the agent platform.

1. Data we collect
We may collect your name, mobile number, email, Aadhaar/PAN details (stored encrypted), bank account details, business information, device information, and geolocation captured during signup and service use.

2. Why we collect it
Data is used to onboard Agents, verify identity, process transactions, settle commissions, meet regulatory and audit obligations, prevent fraud and abuse, and improve platform reliability and support.

3. Sharing
We share data with payment / banking providers, regulators, and service vendors only as needed to deliver services or as required by law. We do not sell personal data.

4. Retention & security
We retain data as long as needed for legal, operational and dispute-resolution purposes. Sensitive identifiers are encrypted at rest. Access is restricted to authorised personnel and systems.

5. Your choices
You may request correction of inaccurate profile data via support. Marketing emails (if any) are opt-in and can be turned off in settings; transactional notices still apply.

6. Updates
We may update this Policy. Material changes will be communicated through the app, website, or email where appropriate.

7. Contact
For privacy-related requests, contact AsanPay support through the channels published in the agent app or website.`;

export function buildLegalDownloadText(): string {
  return [
    "ASANPAY — TERMS & CONDITIONS",
    "================================",
    "",
    TERMS_BODY,
    "",
    "",
    "ASANPAY — PRIVACY POLICY",
    "================================",
    "",
    PRIVACY_BODY,
    "",
  ].join("\n");
}
