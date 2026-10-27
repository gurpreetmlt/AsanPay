"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Home, Loader2, MapPin, Store, XCircle } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { AsanPayLockup } from "@/components/brand/Logo";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type Purpose = "shop" | "home";
type LinkInfo = { purpose: Purpose; status: "pending" | "captured" | "expired"; expiresAt: string };
type Stage = "loading" | "ready" | "locating" | "sending" | "done" | "error" | "expired" | "captured" | "invalid";

/** Stop waiting once the fix is this good; otherwise keep the best fix seen for a few seconds. */
const GOOD_ACCURACY_M = 30;
const WATCH_MS = 12_000;

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser cannot share location. Open this link in Chrome or Safari."));
      return;
    }
    let best: GeolocationPosition | null = null;
    let settled = false;
    const finish = (pos: GeolocationPosition | null, err?: Error) => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (pos) resolve(pos);
      else reject(err ?? new Error("Getting location took too long. Go near a window and try again."));
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) finish(pos);
      },
      (err) => {
        if (best) return finish(best);
        if (err.code === err.PERMISSION_DENIED) {
          finish(null, new Error("Location permission is blocked. Allow location for this site in your browser settings, then tap Try again."));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          finish(null, new Error("Location is not available. Turn on GPS and try again."));
        } else {
          finish(null, new Error("Getting location took too long. Go near a window and try again."));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: WATCH_MS + 8_000 },
    );
    const timer = setTimeout(() => finish(best), WATCH_MS);
  });
}

export default function GeoCapturePage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [message, setMessage] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<ApiResponse<LinkInfo>>(`/geo-link/public/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!data.success) throw new Error(data.message);
        setInfo(data.data);
        setStage(data.data.status === "pending" ? "ready" : data.data.status);
      } catch (err) {
        if (cancelled) return;
        setMessage(extractApiError(err, "This location link is not valid. Tap Generate new QR on the computer and scan again."));
        setStage("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function capture() {
    setMessage("");
    setStage("locating");
    let pos: GeolocationPosition;
    try {
      pos = await readPosition();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Location is not available. Turn on GPS and try again.");
      setStage("error");
      return;
    }
    setStage("sending");
    try {
      const { data } = await api.post<ApiResponse<{ accuracyMeters: number }>>(
        `/geo-link/public/${encodeURIComponent(token)}/confirm`,
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        },
      );
      if (!data.success) throw new Error(data.message);
      setAccuracy(data.data.accuracyMeters);
      setStage("done");
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      setMessage(extractApiError(err, "Location could not be sent. Check your internet and tap Try again."));
      setStage(code === "GEO_LINK_EXPIRED" ? "expired" : code === "GEO_LINK_USED" ? "captured" : "error");
    }
  }

  const purpose: Purpose = info?.purpose ?? "shop";
  const place = purpose === "shop" ? "shop" : "home";
  const Icon = purpose === "shop" ? Store : Home;

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-8" style={{ background: B.bg }}>
      <div className="w-full max-w-md space-y-5">
        <div className="flex justify-center">
          <AsanPayLockup width={132} light={false} showTagline={false} />
        </div>
        <div className="rounded-3xl border bg-white p-6 text-center shadow-sm" style={{ borderColor: B.border }}>
          <span
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: stage === "done" ? "rgba(18,183,106,0.12)" : "rgba(42,92,221,0.12)" }}
          >
            {stage === "done" ? (
              <CheckCircle2 size={28} style={{ color: B.green }} />
            ) : stage === "error" || stage === "invalid" ? (
              <XCircle size={28} className="text-red-600" />
            ) : stage === "expired" ? (
              <Clock3 size={28} className="text-orange-600" />
            ) : (
              <Icon size={28} style={{ color: B.blueLight }} />
            )}
          </span>

          {stage === "loading" ? (
            <Loader2 size={24} className="mx-auto mt-5 animate-spin text-gray-400" />
          ) : null}

          {stage === "ready" || stage === "locating" || stage === "sending" || stage === "error" ? (
            <>
              <h1 className="mt-4 text-xl font-bold" style={{ color: B.blue }}>
                Allow location to capture your {place} location
              </h1>
              <p className="mt-2 text-sm" style={{ color: B.muted }}>
                {purpose === "shop"
                  ? "Stand inside your shop while capturing the location. Services work only near this location."
                  : "Capture this while you are at home. Keep phone GPS on."}
              </p>
              {message ? (
                <p className="mt-4 rounded-xl px-3 py-2 text-sm font-semibold text-red-700" style={{ background: "#FEE2E2" }}>
                  {message}
                </p>
              ) : null}
              <div className="mt-5">
                <PrimaryButton
                  size="lg"
                  className="w-full"
                  loading={stage === "locating" || stage === "sending"}
                  onClick={() => void capture()}
                  showArrow={false}
                >
                  <MapPin size={18} /> {stage === "error" ? "Try again" : "Allow location"}
                </PrimaryButton>
              </div>
              {stage === "locating" ? (
                <p className="mt-3 text-xs" style={{ color: B.muted }}>
                  Getting an accurate GPS fix — this can take a few seconds…
                </p>
              ) : null}
            </>
          ) : null}

          {stage === "done" ? (
            <>
              <h1 className="mt-4 text-xl font-bold" style={{ color: B.greenDark }}>
                Location captured ✓{accuracy != null ? ` · accuracy ${accuracy} m` : ""}
              </h1>
              <p className="mt-2 text-sm" style={{ color: B.muted }}>
                You can close this page and continue signup on the computer.
              </p>
            </>
          ) : null}

          {stage === "captured" ? (
            <>
              <h1 className="mt-4 text-xl font-bold" style={{ color: B.greenDark }}>
                Location already captured
              </h1>
              <p className="mt-2 text-sm" style={{ color: B.muted }}>
                You can close this page and continue signup on the computer.
              </p>
            </>
          ) : null}

          {stage === "expired" ? (
            <>
              <h1 className="mt-4 text-xl font-bold" style={{ color: B.blue }}>
                This QR has expired
              </h1>
              <p className="mt-2 text-sm" style={{ color: B.muted }}>
                Tap Generate new QR on the computer and scan again.
              </p>
            </>
          ) : null}

          {stage === "invalid" ? (
            <>
              <h1 className="mt-4 text-xl font-bold" style={{ color: B.blue }}>
                Link not valid
              </h1>
              <p className="mt-2 text-sm" style={{ color: B.muted }}>
                {message}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
