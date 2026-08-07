"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { B, brand } from "@/lib/brand";

const SECTIONS = [
  {
    title: "What we collect",
    body: "Your name, mobile number, email, address and KYC documents (PAN, Aadhaar) submitted during onboarding; transaction details for services you perform; device information (app device id and, where applicable, biometric scanner serial number) used to secure your account; and location data captured at the moment of an AePS transaction, used solely to confirm you are transacting from your registered outlet.",
  },
  {
    title: "How we use it",
    body: "To operate your account, process transactions, verify your identity as required by RBI and UIDAI regulations, detect and prevent fraud, and communicate service updates, security alerts and support responses to you.",
  },
  {
    title: "Biometric data",
    body: "Fingerprint or iris captures used for AePS are processed through UIDAI-certified Registered Devices and sent as encrypted, signed PidData to the relevant authentication service — raw biometric images are never stored by our systems.",
  },
  {
    title: "What we never do",
    body: "We never sell your data. We never ask for your transaction PIN, login password, or OTP over phone, SMS or WhatsApp — any such request is fraud, not us. Your prepaid balance is never withdrawable as cash; only money you've genuinely earned can be settled to your own bank account.",
  },
  {
    title: "Data retention",
    body: "Transaction and audit records are retained as required by RBI recordkeeping rules. Device and location logs used for fraud detection are retained separately from financial records and periodically purged per our data retention schedule.",
  },
  {
    title: "Your rights",
    body: "You can view your own transaction history, KYC status, and registered devices at any time from your account. To request correction of incorrect personal information, or to raise a privacy concern, use Raise Ticket from the Support page.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: B.bg }}>
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link
          href="/support"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: B.blueLight }}
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
          Privacy Policy
        </h1>
        <p className="mt-1 text-xs" style={{ color: B.muted }}>
          How {brand.name} collects, uses and protects your information.
        </p>

        <div className="mt-6 space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.title} className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <h2 className="mb-1.5 text-sm font-bold" style={{ color: B.blue }}>
                {s.title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: B.blueMid }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
