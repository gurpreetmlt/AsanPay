"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Clock3, Loader2, MapPin, RefreshCw, Smartphone, X } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";

export type VerifiedPhoneLocation = {
  token: string;
  latitude: string;
  longitude: string;
  accuracyMeters: number | null;
};

type StartResponse = { token: string; qrPayload: string; expiresAt: string };
type StatusResponse = {
  status: "pending" | "verified" | "used" | "expired";
  latitude: string | null;
  longitude: string | null;
  accuracyMeters: number | null;
};

const POLL_MS = 2000;

const STEPS = [
  "Open the AsanPay app on your phone (same account)",
  "On the home screen, tap Scan QR",
  "Scan this QR — keep phone location (GPS) ON",
];

/** Web → phone location hand-off: shows a QR, waits until the phone posts its GPS. */
export function PhoneLocationModal({
  open,
  purpose,
  title = "Verify your location",
  onClose,
  onVerified,
}: {
  open: boolean;
  purpose: "onboarding" | "aeps";
  title?: string;
  onClose: () => void;
  onVerified: (loc: VerifiedPhoneLocation) => void;
}) {
  const [qr, setQr] = useState<StartResponse | null>(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const doneRef = useRef(false);

  const start = useCallback(async () => {
    setQr(null);
    setError("");
    setExpired(false);
    doneRef.current = false;
    try {
      const { data } = await api.post<ApiResponse<StartResponse>>("/geo-link/start", { purpose });
      if (!data.success) throw new Error(data.message);
      setQr(data.data);
    } catch (err) {
      setError(extractApiError(err, "Could not create the location QR. Try again."));
    }
  }, [purpose]);

  useEffect(() => {
    if (open) void start();
  }, [open, start]);

  useEffect(() => {
    if (!open || !qr || expired) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      if (doneRef.current) return;
      try {
        const s = await fetchApi<StatusResponse>(`/geo-link/${qr.token}`);
        if (s.status === "verified" && s.latitude && s.longitude) {
          doneRef.current = true;
          onVerified({ token: qr.token, latitude: s.latitude, longitude: s.longitude, accuracyMeters: s.accuracyMeters });
        } else if (s.status === "expired" || s.status === "used") {
          setExpired(true);
        }
      } catch {
        /* keep polling; one dropped request must not end the hand-off */
      }
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [open, qr, expired, onVerified]);

  if (!open) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4 p-6" style={{ background: B.bg }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
            Steps to scan QR
          </p>
          {STEPS.map((s, i) => (
            <div key={s} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: B.blue }}
              >
                {i + 1}
              </span>
              <p className="text-sm font-semibold text-gray-800">{s}</p>
            </div>
          ))}
          <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs text-gray-600">
            <Smartphone size={16} className="mt-0.5 shrink-0" style={{ color: B.blue }} />
            Computer location is often wrong. Your phone&apos;s GPS gives the exact shop location the bank needs.
          </div>
        </div>

        <div className="relative flex flex-col items-center p-6 text-center">
          <button
            type="button"
            onClick={onClose}
            className="popup-close absolute right-3 top-3"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <MapPin size={18} style={{ color: B.blue }} />
            <h2 className="text-lg font-extrabold text-gray-900">{title}</h2>
          </div>
          <p className="mt-1 text-xs text-gray-500">Make sure your phone location is ON</p>

          <div className="my-5 flex min-h-[220px] items-center justify-center">
            {error ? (
              <p className="max-w-xs text-sm font-semibold text-red-600">{error}</p>
            ) : !qr ? (
              <Loader2 size={28} className="animate-spin text-gray-400" />
            ) : (
              <div className={expired ? "opacity-25" : ""}>
                <QRCodeSVG value={qr.qrPayload} size={210} fgColor={B.blue} marginSize={1} />
              </div>
            )}
          </div>

          {error || expired ? (
            <button
              type="button"
              onClick={() => void start()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: B.blue }}
            >
              <RefreshCw size={15} />
              {expired ? "QR expired — get a new QR" : "Try again"}
            </button>
          ) : qr ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <Clock3 size={14} />
              Scan the QR within <span className="text-orange-600">{mm}:{ss}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
