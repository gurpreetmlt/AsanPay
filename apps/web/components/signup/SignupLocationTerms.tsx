"use client";

import { MapPin, X } from "lucide-react";
import { B } from "@/lib/brand";

export type GeoCoords = { latitude: string; longitude: string };

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" style={{ border: `1px solid ${B.border}` }}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: B.border }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Terms &amp; Conditions
            </h2>
            <p className="mt-1 text-xs" style={{ color: B.muted }}>
              Please read the information below and confirm your agreement.
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1" style={{ color: B.muted }}>
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed" style={{ color: B.blue }}>
          <p className="mb-3 font-semibold">AsanPay Agent Terms</p>
          <p className="mb-2">
            By registering as an AsanPay agent you agree to provide accurate KYC information, use services only for
            lawful retail transactions, keep login credentials confidential, and comply with RBI / UIDAI / NPCI
            guidelines applicable to AEPS, DMT, BBPS and related services.
          </p>
          <p className="mb-2">
            AsanPay may suspend or terminate access for fraud, KYC mismatch, misuse of customer data, or policy
            violations. Commission and settlement are subject to the published scheme and successful provider
            confirmation.
          </p>
          <p className="mb-2">
            Location captured at registration is used for outlet geofencing and compliance checks. You consent to
            processing of identity documents and transaction data as described in the Privacy Policy.
          </p>
          <p className="font-semibold">Privacy Policy (summary)</p>
          <p className="mt-1">
            We collect mobile, identity, bank, business, and location data to onboard agents, process transactions,
            meet regulatory obligations, and prevent abuse. Data is shared with payment providers and regulators only
            as required to deliver services.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: B.border }}>
          <div className="text-xs" style={{ color: B.muted }}>
            <div>
              Latitude: <span className="font-mono font-semibold" style={{ color: B.blue }}>{latitude || "—"}</span>
            </div>
            <div>
              Longitude: <span className="font-mono font-semibold" style={{ color: B.blue }}>{longitude || "—"}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: B.green, color: B.greenDark }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!latitude || !longitude}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
