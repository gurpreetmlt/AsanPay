"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Clock3, Home, Loader2, MapPin, RefreshCw, Smartphone, Store } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import type { SignupGeoFix } from "@/lib/signupDraft";

type Purpose = "home" | "shop";
type StartResponse = { token: string; capturePath: string | null; expiresAt: string };
type StatusResponse = {
  status: "pending" | "verified" | "used" | "expired";
  accuracyMeters: number | null;
};

const POLL_MS = 2000;

const COPY: Record<Purpose, { title: string; hint: string; action: string }> = {
  home: {
    title: "Home location",
    hint: "Capture this while you are at home. Services also work near your home location.",
    action: "Capture home location",
  },
  shop: {
    title: "Shop location",
    hint: "Stand inside your shop while capturing the location. Services work only near this location.",
    action: "Capture shop location",
  },
};

/**
 * Signup shop / home location from the phone: the QR opens a public page in the phone's browser
 * (camera scan, no app or login) that posts GPS to the server. Desktop browser location is never used.
 */
export function SignupGeoCapture({
  purpose,
  value,
  onChange,
  optional = false,
  hint,
}: {
  purpose: Purpose;
  value: SignupGeoFix | null;
  onChange: (fix: SignupGeoFix | null) => void;
  optional?: boolean;
  hint?: string;
}) {
  const copy = COPY[purpose];
  const [qr, setQr] = useState<{ token: string; url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const doneRef = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // A saved capture older than the server's use window can no longer be submitted.
  const savedToken = value?.token;
  useEffect(() => {
    if (!savedToken) return;
    let cancelled = false;
    void fetchApi<StatusResponse>(`/geo-link/${savedToken}`)
      .then((s) => {
        if (!cancelled && s.status === "expired") onChangeRef.current(null);
      })
      .catch(() => {
        /* offline / transient — keep the saved capture; submit re-checks on the server */
      });
    return () => {
      cancelled = true;
    };
  }, [savedToken]);

  const start = useCallback(async () => {
    setBusy(true);
    setError("");
    setExpired(false);
    doneRef.current = false;
    try {
      const { data } = await api.post<ApiResponse<StartResponse>>("/geo-link/start", { purpose });
      if (!data.success) throw new Error(data.message);
      if (!data.data.capturePath) throw new Error("Location QR could not be created. Tap Generate new QR.");
      setQr({
        token: data.data.token,
        url: `${window.location.origin}${data.data.capturePath}`,
        expiresAt: data.data.expiresAt,
      });
    } catch (err) {
      setError(extractApiError(err, `Could not create the ${copy.title.toLowerCase()} QR. Check your internet and tap Generate new QR.`));
    } finally {
      setBusy(false);
    }
  }, [purpose, copy.title]);

  useEffect(() => {
    if (!qr || expired) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((new Date(qr.expiresAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    const poll = setInterval(async () => {
      if (doneRef.current) return;
      try {
        const s = await fetchApi<StatusResponse>(`/geo-link/${qr.token}`);
        if (s.status === "verified" || s.status === "used") {
          doneRef.current = true;
          onChangeRef.current({ token: qr.token, accuracyMeters: s.accuracyMeters, capturedAt: new Date().toISOString() });
          setQr(null);
        } else if (s.status === "expired") {
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
  }, [qr, expired]);

  const Icon = purpose === "shop" ? Store : Home;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="rounded-2xl border-2 p-4" style={{ borderColor: B.border, background: "#F7F9FF" }}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: value ? "rgba(18,183,106,0.12)" : "rgba(42,92,221,0.12)" }}
        >
          <Icon size={20} style={{ color: value ? B.green : B.blueLight }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: B.blue }}>
            {copy.title}{" "}
            {optional ? (
              <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Optional
              </span>
            ) : (
              <span className="text-red-600">*</span>
            )}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
            {hint ?? copy.hint}
          </p>
        </div>
      </div>

      {value && !qr ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: B.greenDark }}>
            <CheckCircle2 size={18} />
            Location captured ✓{value.accuracyMeters != null ? ` · accuracy ${value.accuracyMeters} m` : ""}
          </p>
          <PrimaryButton variant="secondary" size="sm" loading={busy} onClick={() => void start()}>
            <RefreshCw size={14} /> Capture again
          </PrimaryButton>
          {error ? <p className="w-full text-xs font-semibold text-red-600">{error}</p> : null}
        </div>
      ) : null}

      {!value && !qr ? (
        <div className="mt-3 space-y-2">
          <PrimaryButton size="sm" loading={busy} onClick={() => void start()} showArrow={false}>
            <MapPin size={15} /> {copy.action}
          </PrimaryButton>
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
        </div>
      ) : null}

      {qr ? (
        <div className="mt-3 grid gap-4 rounded-xl bg-white p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className={`flex justify-center ${expired ? "opacity-25" : ""}`}>
            <QRCodeSVG value={qr.url} size={176} fgColor={B.blue} marginSize={1} />
          </div>
          <div className="space-y-2 text-sm" style={{ color: B.blueMid }}>
            <p className="flex items-start gap-2 font-semibold">
              <Smartphone size={16} className="mt-0.5 shrink-0" style={{ color: B.blueLight }} />
              Scan this QR with your phone camera. No app or login needed.
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              The page asks to allow location — tap Allow and keep phone GPS on. This screen updates by itself.
            </p>
            {expired ? (
              <PrimaryButton size="sm" loading={busy} onClick={() => void start()} showArrow={false}>
                <RefreshCw size={14} /> Generate new QR
              </PrimaryButton>
            ) : (
              <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: B.muted }}>
                <Loader2 size={14} className="animate-spin" />
                Waiting for your phone ·
                <Clock3 size={14} /> QR valid for <span className="text-orange-600">{mm}:{ss}</span>
              </p>
            )}
            {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
