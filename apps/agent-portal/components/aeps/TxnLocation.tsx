"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MapPin, RefreshCw, Smartphone } from "lucide-react";
import { B } from "@/lib/brand";
import { PhoneLocationModal } from "@/components/location/PhoneLocationModal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

export const LOCATION_REQUIRED_MESSAGE = "Allow location access before continuing";

/** The API accepts a phone fix for 10 minutes; browser fixes are refreshed on the same clock. */
const MAX_FIX_AGE_MS = 9 * 60 * 1000;

export type TxnLocationFix = {
  source: "browser" | "phone";
  latitude: string;
  longitude: string;
  accuracyMeters: number | null;
  capturedAt: number;
  /** Phone fixes only: single-use proof the server resolves to the stored phone GPS. */
  token?: string;
};

/** Location fields for a money transaction (DMT transfer, AePS withdrawal / deposit, Aadhaar Pay). */
export function txnLocationBody(fix: TxnLocationFix): Record<string, string | number> {
  if (fix.source === "phone" && fix.token) return { geoLinkToken: fix.token };
  return {
    latitude: fix.latitude,
    longitude: fix.longitude,
    ...(fix.accuracyMeters != null && fix.accuracyMeters > 0 ? { accuracyMeters: fix.accuracyMeters } : {}),
  };
}

/** API errors after which the current fix cannot be sent again. */
export function isLocationError(err: unknown): boolean {
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code ?? "";
  return code.startsWith("LOCATION_");
}

/** Live location for money transactions: browser GPS first, phone QR when the browser blocks it. */
export function useTxnLocation(enabled = true) {
  const [fix, setFix] = useState<TxnLocationFix | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "blocked">("idle");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fresh = fix && now - fix.capturedAt < MAX_FIX_AGE_MS ? fix : null;

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("blocked");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = Date.now();
        setNow(at);
        setFix({
          source: "browser",
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          capturedAt: at,
        });
        setStatus("idle");
      },
      () => setStatus("blocked"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (enabled && !fresh && status === "idle") locate();
  }, [enabled, fresh, status, locate]);

  useEffect(() => {
    if (!fix) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [fix]);

  const onPhoneVerified = useCallback(
    (v: { token: string; latitude: string; longitude: string; accuracyMeters: number | null }) => {
      const at = Date.now();
      setNow(at);
      setFix({ source: "phone", ...v, capturedAt: at });
      setPhoneOpen(false);
    },
    [],
  );

  /** After a submit that used the fix: a phone fix is single use; a rejected fix is dropped. */
  const release = useCallback((err?: unknown) => {
    setFix((cur) => {
      if (!cur) return cur;
      if (err ? isLocationError(err) : cur.source === "phone") return null;
      return cur;
    });
  }, []);

  return {
    fix: fresh,
    status,
    locate,
    phoneOpen,
    openPhone: () => setPhoneOpen(true),
    closePhone: () => setPhoneOpen(false),
    onPhoneVerified,
    release,
  };
}

export type TxnLocation = ReturnType<typeof useTxnLocation>;

/** Status strip above the form + the phone QR popup. */
export function TxnLocationStrip({ loc }: { loc: TxnLocation }) {
  const { fix, status } = loc;
  const ok = Boolean(fix);
  return (
    <>
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
        style={
          ok
            ? { borderColor: `${B.green}55`, background: `${B.green}0D` }
            : status === "blocked"
              ? { borderColor: "#FCA5A5", background: "#FEF2F2" }
              : { borderColor: `${B.blue}33`, background: `${B.blue}0A` }
        }
      >
        <div className="flex items-center gap-2.5 text-sm">
          {ok ? (
            <CheckCircle2 size={18} style={{ color: B.greenDark }} />
          ) : status === "locating" ? (
            <Loader2 size={18} className="animate-spin" style={{ color: B.blue }} />
          ) : (
            <MapPin size={18} style={{ color: status === "blocked" ? "#DC2626" : B.blue }} />
          )}
          <div>
            <p className="font-bold" style={{ color: ok ? B.greenDark : status === "blocked" ? "#B91C1C" : B.blue }}>
              {fix
                ? fix.source === "phone"
                  ? "Location verified with your phone"
                  : "Live location captured"
                : status === "locating"
                  ? "Getting your live location…"
                  : LOCATION_REQUIRED_MESSAGE}
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              {fix
                ? `${Number(fix.latitude).toFixed(4)}, ${Number(fix.longitude).toFixed(4)}${
                    fix.accuracyMeters != null ? ` · ±${fix.accuracyMeters} m` : ""
                  }${fix.source === "phone" ? " — valid for one transaction" : ""}`
                : status === "blocked"
                  ? "This browser blocked location. Allow it in the address bar, or verify with your phone."
                  : "Money transactions need your live location."}
            </p>
          </div>
        </div>
        {status === "locating" ? null : (
          <div className="flex flex-wrap gap-2">
            {!fix || fix.source === "browser" ? (
              <PrimaryButton type="button" variant="secondary" size="sm" showArrow={false} onClick={loc.locate}>
                <RefreshCw size={14} />
                {fix ? "Refresh" : "Try again"}
              </PrimaryButton>
            ) : null}
            {!fix || fix.source === "phone" || status === "blocked" ? (
              <PrimaryButton type="button" variant="primary" size="sm" showArrow={false} onClick={loc.openPhone}>
                <Smartphone size={14} />
                {fix ? "Verify again" : "Verify with phone"}
              </PrimaryButton>
            ) : null}
          </div>
        )}
      </div>
      <PhoneLocationModal
        open={loc.phoneOpen}
        purpose="aeps"
        onClose={loc.closePhone}
        onVerified={loc.onPhoneVerified}
      />
    </>
  );
}

/** Helper line under a submit button that stays disabled until a live fix exists. */
export function LocationRequiredHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
      <MapPin size={12} />
      {LOCATION_REQUIRED_MESSAGE}
    </p>
  );
}
