"use client";

import { useState } from "react";
import { ChevronDown, Download, MapPin, X } from "lucide-react";
import { B } from "@/lib/brand";

export type GeoCoords = { latitude: string; longitude: string };

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

export function requestBrowserLocation(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        });
      },
      (err) => {
        reject(new Error(err.message || "Location access denied"));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60_000 },
    );
  });
}

function downloadLegalDocs() {
  const content = [
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

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "AsanPay-Terms-and-Privacy-Policy.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LocationPermissionModal({
  error,
  busy,
  onAllow,
  onHome,
}: {
  error: string | null;
  busy: boolean;
  onAllow: () => void;
  onHome: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" style={{ border: `1px solid ${B.border}` }}>
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={22} style={{ color: B.green }} />
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Location Permission Required
          </h2>
        </div>
        <p className="mb-3 text-sm" style={{ color: B.muted }}>
          Please allow location access to continue with login and registration.
        </p>
        {error ? (
          <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: "#FEE2E2", color: "#991B1B" }}>
            Error: {error}. Please allow location in your browser or device settings.
          </div>
        ) : null}
        <div className="mb-4 rounded-xl px-3 py-2 text-xs" style={{ background: "#FEF3C7", color: "#92400E" }}>
          <p className="mb-1 font-semibold">If permission was denied:</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Open browser site settings</li>
            <li>Find Location</li>
            <li>Set to Allow</li>
            <li>Refresh this page</li>
            <li>Tap Allow below</li>
          </ol>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onAllow}
            className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.green }}
          >
            {busy ? "Requesting…" : "Allow"}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="w-full rounded-xl border py-3 text-sm font-semibold"
            style={{ borderColor: B.green, color: B.greenDark }}
          >
            Go to Home Page
          </button>
        </div>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  body,
  open,
  onToggle,
  accepted,
  onAcceptSection,
}: {
  title: string;
  body: string;
  open: boolean;
  onToggle: () => void;
  accepted: boolean;
  onAcceptSection: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: B.border }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        style={{ background: open ? `${B.green}08` : "#fff" }}
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2"
          style={{
            borderColor: accepted ? B.green : B.border,
            background: accepted ? B.green : "#fff",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
          }}
          aria-hidden
        >
          {accepted ? "✓" : ""}
        </span>
        <span className="flex-1 text-sm font-semibold" style={{ color: B.blue }}>
          {title}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: B.muted }}
        />
      </button>

      {open ? (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: B.border, background: "#FAFBFF" }}>
          <p className="mb-2 text-sm font-bold" style={{ color: B.greenDark }}>
            {title}
          </p>
          <div
            className="mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-white p-3 text-xs leading-relaxed"
            style={{ borderColor: B.border, color: B.blue, scrollbarColor: `${B.green} transparent` }}
          >
            {body}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAcceptSection}
              disabled={accepted}
              className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: accepted ? B.muted : B.green }}
            >
              {accepted ? "Accepted" : "Accept"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TermsAcceptModal({
  latitude,
  longitude,
  onAccept,
  onCancel,
}: {
  latitude: string;
  longitude: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [openSection, setOpenSection] = useState<"terms" | "privacy" | null>("terms");
  const [termsOk, setTermsOk] = useState(false);
  const [privacyOk, setPrivacyOk] = useState(false);
  const bothOk = termsOk && privacyOk;
  const canAccept = bothOk && Boolean(latitude && longitude);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: `1px solid ${B.border}` }}
      >
        {/* Header */}
        <div className="border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold" style={{ color: B.blue }}>
                Terms &amp; Privacy Policy
              </h2>
              <p className="mt-1 text-xs" style={{ color: B.muted }}>
                Please read the information below and confirm your agreement.
              </p>
            </div>
            <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1" style={{ color: B.muted }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: B.muted }}>
              Expand each section, read, then Accept.
            </p>
            <button
              type="button"
              onClick={downloadLegalDocs}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50"
              style={{ borderColor: B.border, color: B.muted }}
            >
              <Download size={14} />
              Download Privacy Policy and Terms &amp; Conditions
            </button>
          </div>
        </div>

        {/* Accordion body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <AccordionSection
            title="Terms & Conditions"
            body={TERMS_BODY}
            open={openSection === "terms"}
            onToggle={() => setOpenSection((s) => (s === "terms" ? null : "terms"))}
            accepted={termsOk}
            onAcceptSection={() => {
              setTermsOk(true);
              setOpenSection("privacy");
            }}
          />
          <AccordionSection
            title="Privacy Policy"
            body={PRIVACY_BODY}
            open={openSection === "privacy"}
            onToggle={() => setOpenSection((s) => (s === "privacy" ? null : "privacy"))}
            accepted={privacyOk}
            onAcceptSection={() => setPrivacyOk(true)}
          />
        </div>

        {/* Footer */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: B.border, background: "#FAFBFF" }}
        >
          <div className="font-mono text-xs" style={{ color: B.blue }}>
            <div>
              Latitude : <span className="font-semibold">{latitude || "—"}</span>
            </div>
            <div>
              Longitude : <span className="font-semibold">{longitude || "—"}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border px-5 py-2.5 text-sm font-semibold"
              style={{ borderColor: B.green, color: B.greenDark, background: "#fff" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!canAccept}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: canAccept ? B.badgeGrad : "#9CA3AF" }}
              title={!bothOk ? "Accept both Terms and Privacy Policy first" : undefined}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
