"use client";

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import {
  Check,
  ChevronDown,
  Fingerprint,
  History,
  Loader2,
  Lock,
  RotateCw,
  ScanEye,
  ScanFace,
  ShieldCheck,
  Usb,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { B, brand, initials, roleFromUserRole } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { todayPhoneLocation } from "@/lib/phoneLocation";
import { captureFingerprintWeb } from "@/lib/rdServiceFingerprint";
import { useAuthStore } from "@/lib/store";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import type { ApiResponse } from "@asanpay/shared-types";

export type RdStatus = "looking" | "ready" | "missing";

type Phase = "idle" | "scanning" | "verifying" | "success" | "failed";

type Props = {
  /** Service name used in consent + toasts, e.g. "AePS" or "DMT". */
  service: string;
  /** Success CTA, e.g. "Continue to AePS". */
  continueLabel: string;
  kycReady: boolean;
  aadhaarLastFour: string | null;
  lastVerifiedAt: string | null;
  verifiedToday?: boolean;
  rdStatus: RdStatus;
  deviceLabel: string;
  onRetryDevice: () => void;
  onChangeDevice: () => void;
  /** Continue tapped after a successful verification. */
  onVerified: () => void;
};

const TRICOLOR =
  "linear-gradient(90deg, #FF9933 0%, #FFB766 26%, #F2F4FA 50%, #5BBF6A 74%, #138808 100%)";
const SCAN_GRAD = "linear-gradient(90deg, #12B76A 0%, #2A5CDD 58%, #0B2A9A 100%)";

const IST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istTime(d: Date): string {
  return d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
    .toUpperCase();
}

function describeVerifiedAt(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  const key = IST_DAY.format(d);
  if (key === IST_DAY.format(new Date())) return `today ${istTime(d)}`;
  if (key === IST_DAY.format(new Date(Date.now() - 86_400_000))) return `yesterday ${istTime(d)}`;
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return `${day} ${istTime(d)}`;
}

function readQualityScore(pid: string): number | null {
  const raw = pid.match(/qScore="(\d{1,3})"/i)?.[1];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function failureHint(message: string): string {
  const m = message.toLowerCase();
  if (/\brd\b|device|scanner|port|rdservice/.test(m)) {
    return "Check the RD device is connected and RD Service is open, then try again.";
  }
  if (m.includes("location")) return "Allow location access on this browser, then try again.";
  return "Clean the sensor or try another finger.";
}

function useKycPhoto(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const res = await fetch("/api/proxy/kyc/documents/personalPhoto", {
          credentials: "include",
          cache: "no-store",
        });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.startsWith("image/")) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        /* initials fallback */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled]);
  return url;
}

/* ── Left: Aadhaar-style ID card ───────────────────────────────────── */

function CardEmblem() {
  return (
    <div className="relative h-12 w-12 shrink-0">
      <div
        aria-hidden
        className="absolute -inset-2.5 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(255,153,51,0.6) 0deg 3deg, transparent 3deg 15deg)",
          WebkitMaskImage: "radial-gradient(circle closest-side, #000 62%, transparent 100%)",
          maskImage: "radial-gradient(circle closest-side, #000 62%, transparent 100%)",
        }}
      />
      <div
        className="relative flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-sm"
        style={{ borderColor: "rgba(11,42,154,0.14)" }}
      >
        <Fingerprint size={22} style={{ color: B.blue }} />
      </div>
    </div>
  );
}

function StatusPill({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-semibold text-green-700">
      <Check size={12} strokeWidth={3} />
      Verified today · valid till 11:59 PM
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Not verified today
    </span>
  );
}

function AadhaarCard({
  phase,
  quality,
  kycReady,
  aadhaarLastFour,
}: {
  phase: Phase;
  quality: number | null;
  kycReady: boolean;
  aadhaarLastFour: string | null;
}) {
  const user = useAuthStore((s) => s.user);
  const name = user?.name?.trim() || "Retailer";
  const roleLabel = roleFromUserRole(user?.role).label;
  const photoUrl = useKycPhoto(kycReady);
  const verified = phase === "success";
  const busy = phase === "scanning" || phase === "verifying";
  const kycVerified = user?.kycStatus === "verified";

  return (
    // No overflow-hidden here: the ID-1 ratio is a minimum, the card grows when content needs more room.
    <div
      className={clsx(
        "relative rounded-2xl border bg-white shadow-[0_14px_36px_rgba(11,42,154,0.09)]",
        !kycReady && "border-dashed",
        phase === "idle" && kycReady && "dv-card-float",
      )}
      style={{
        aspectRatio: "85.6 / 54",
        borderColor: kycReady ? "rgba(11,42,154,0.10)" : "rgba(11,42,154,0.25)",
        background: "linear-gradient(135deg, #FFFFFF 0%, #F9FBFF 55%, #EEF3FF 100%)",
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: TRICOLOR }} />
        <div className="absolute right-[7%] top-1/2 -translate-y-1/2">
          <Fingerprint
            size={190}
            strokeWidth={1}
            className={busy ? "dv-watermark-scan" : "opacity-[0.06]"}
            style={{ color: B.blue }}
          />
        </div>
      </div>

      <div className="relative flex h-full min-h-[280px] flex-col gap-4 p-5 pt-6 sm:p-6 sm:pt-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CardEmblem />
            <div className="min-w-0">
              <p className="text-xl font-extrabold leading-tight" style={{ color: B.blue }}>
                Aadhaar
              </p>
              <p className="truncate text-[11px] text-gray-500">Linked to your {brand.name} account</p>
            </div>
          </div>
          <StatusPill verified={verified} />
        </div>

        {kycReady ? (
          <>
            <div className="flex min-w-0 items-center gap-4">
              <div className="shrink-0 rounded-xl border bg-white p-1 shadow-sm" style={{ borderColor: B.border }}>
                <div
                  className="relative flex h-[88px] w-[74px] items-center justify-center overflow-hidden rounded-lg"
                  style={{ background: B.badgeGrad }}
                >
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="KYC photo" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-white">{initials(name)}</span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-black/25 py-0.5 text-center text-[8px] font-bold tracking-[0.12em] text-white">
                    KYC PHOTO
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.14em] text-gray-400">ACCOUNT HOLDER</p>
                <p className="mt-1 truncate text-2xl font-semibold text-gray-900">{name}</p>
                <span className="mt-2 inline-flex max-w-full items-center truncate rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                  {roleLabel}
                  {user?.uid ? ` · ${user.uid}` : ""}
                </span>
              </div>
            </div>

            <div className="mt-auto">
              <p className="text-[10px] font-bold tracking-[0.14em] text-gray-400">AADHAAR NUMBER</p>
              <p className="mt-1.5 flex items-center gap-2.5">
                <Lock size={16} className="shrink-0 text-gray-400" />
                <span className="text-lg font-bold tabular-nums tracking-[0.2em] text-[#0F1B4D] sm:text-xl xl:text-2xl">
                  XXXX XXXX {aadhaarLastFour ?? "····"}
                </span>
              </p>
              <span
                className={clsx(
                  "mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  kycVerified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
                )}
              >
                {kycVerified ? <Check size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                {kycVerified ? "KYC verified · Aadhaar OTP" : "KYC under review"}
              </span>
            </div>
          </>
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center"
            style={{ borderColor: "rgba(11,42,154,0.18)" }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <Fingerprint size={26} className="text-gray-500" />
            </div>
            <p className="mt-4 text-base font-bold text-gray-800">Aadhaar not found in your KYC</p>
            <p className="mt-1 text-xs text-gray-500">Add your Aadhaar details to complete daily verification.</p>
          </div>
        )}
      </div>

      {verified ? (
        <div className="pointer-events-none absolute bottom-6 right-6 -rotate-12">
          <div className="dv-stamp flex h-24 w-24 flex-col items-center justify-center rounded-full border-[3px] border-green-500/70 bg-white/70 text-green-600 ring-4 ring-green-500/15 ring-offset-2">
            <Check size={22} strokeWidth={3} />
            <span className="text-[13px] font-extrabold tracking-[0.12em]">VERIFIED</span>
            <span className="text-[8px] font-bold tracking-[0.2em]">TODAY</span>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="dv-fade-up absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/85 px-6 backdrop-blur-[3px]">
          <div className="dv-ring flex h-24 w-24 items-center justify-center rounded-full border-4 border-blue-100 bg-white">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
              <Fingerprint size={34} style={{ color: B.blueLight }} />
            </div>
          </div>
          <p className="mt-4 text-center text-lg font-bold" style={{ color: B.blue }}>
            {phase === "scanning" ? "Place your finger on the device…" : "Checking with UIDAI…"}
          </p>
          <div className="mt-3 w-full max-w-60">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {quality != null ? `Quality ${quality}%` : "Capturing fingerprint"}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              {quality != null ? (
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${quality}%`, background: "linear-gradient(90deg, #12B76A, #24CC82)" }}
                />
              ) : (
                <div className="dv-bar-indeterminate h-full w-2/5 rounded-full" style={{ background: SCAN_GRAD }} />
              )}
            </div>
          </div>
          <p className="absolute bottom-4 right-5 flex items-center gap-1.5 text-[11px] text-gray-500">
            <ShieldCheck size={13} className="text-green-600" />
            Secure biometric session
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ── Right: action column pieces ───────────────────────────────────── */

function MethodTile({
  icon: Icon,
  label,
  hint,
  selected,
  muted,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  label: string;
  hint: string;
  selected?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "relative flex min-w-0 flex-col items-start gap-2 rounded-xl border p-3 text-left transition xl:flex-row xl:items-center",
        selected ? "border-2 shadow-sm" : "hover:bg-gray-50",
        muted && "opacity-60",
      )}
      style={selected ? { borderColor: B.blueLight, background: "#F3F6FF" } : { borderColor: B.border }}
    >
      {selected ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
      <span
        className={clsx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-white" : "bg-gray-50",
        )}
      >
        <Icon size={18} className={selected ? undefined : "text-gray-400"} style={selected ? { color: B.blue } : undefined} />
      </span>
      <span className="min-w-0">
        <span className={clsx("block truncate text-[13px] font-bold", selected ? "" : "text-gray-500")} style={selected ? { color: B.blue } : undefined}>
          {label}
        </span>
        <span className="block truncate text-[10px] text-gray-400">{hint}</span>
      </span>
    </button>
  );
}

function DeviceRow({
  status,
  label,
  locked,
  onRetry,
  onChange,
}: {
  status: RdStatus;
  label: string;
  locked: boolean;
  onRetry: () => void;
  onChange: () => void;
}) {
  if (status === "missing") {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
          <RotateCw size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-700">No RD device found</p>
          <p className="text-xs text-red-600/80">Connect the device and open RD Service, then tap Retry.</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={locked}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-bold text-gray-800 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
        >
          <RotateCw size={14} />
          Retry
        </button>
      </section>
    );
  }

  const ready = status === "ready";
  return (
    <section className="flex items-center gap-3 rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
      <span
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          ready ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600",
        )}
      >
        {ready ? <Usb size={18} /> : <Loader2 size={18} className="animate-spin" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-bold text-gray-900">
          <span className={clsx("h-2 w-2 shrink-0 rounded-full", ready ? "bg-green-500" : "bg-amber-400")} />
          <span className="truncate">{ready ? `${label} · connected` : "Looking for RD Service…"}</span>
        </p>
        <p className="text-xs text-gray-500">
          {ready ? "Registered device is ready to capture." : "Keep the device plugged in. This takes a few seconds."}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        disabled={locked}
        className="shrink-0 text-sm font-bold text-blue-700 hover:underline disabled:opacity-50"
      >
        Change
      </button>
    </section>
  );
}

const STEPS = [
  { title: "Connect the RD device", hint: "Make sure RD Service is open." },
  { title: "Accept consent", hint: "Consent is valid for today only." },
  { title: "Place your finger", hint: "Use the same finger used for Aadhaar." },
] as const;

const TIPS = ["Clean the sensor", "Press gently and hold still", "Try another finger if it fails"] as const;

/* ── Main ──────────────────────────────────────────────────────────── */

export function DailyVerifyCard({
  service,
  continueLabel,
  kycReady,
  aadhaarLastFour,
  lastVerifiedAt,
  verifiedToday = false,
  rdStatus,
  deviceLabel,
  onRetryDevice,
  onChangeDevice,
  onVerified,
}: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [phase, setPhase] = useState<Phase>(verifiedToday ? "success" : "idle");
  const [consent, setConsent] = useState(verifiedToday);
  const [consentOpen, setConsentOpen] = useState(false);
  const [quality, setQuality] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(lastVerifiedAt);

  const busy = phase === "scanning" || phase === "verifying";
  const done = phase === "success";
  const deviceReady = rdStatus === "ready";
  const canScan = kycReady && consent && deviceReady && !busy && !done;

  const blockedHint = !consent
    ? "Accept Aadhaar consent above to continue."
    : rdStatus === "missing"
      ? "Connect the RD device and tap Retry to continue."
      : rdStatus === "looking"
        ? "Waiting for the RD device…"
        : null;

  function showFaceHint() {
    toast(`Face verification works in the ${brand.name} Android app. Use Fingerprint on web.`);
  }

  async function scan() {
    if (!canScan) {
      if (blockedHint) toast.error(blockedHint);
      return;
    }
    setError(null);
    setQuality(null);
    setPhase("scanning");
    try {
      const biometricPayload = await captureFingerprintWeb();
      setQuality(readQualityScore(biometricPayload));
      setPhase("verifying");
      // Today's phone-verified location; without it the API uses the saved shop location.
      const phone = todayPhoneLocation();
      const geo = phone ? { latitude: phone.latitude, longitude: phone.longitude } : {};
      const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", {
        biometricPayload,
        ...geo,
      });
      if (!data.success) throw new Error(data.message);
      setLastAt(data.data?.verifiedAt ?? new Date().toISOString());
      setPhase("success");
      toast.success(`${service} unlocked for today`);
    } catch (err) {
      setError(extractApiError(err, "Fingerprint could not be verified with your Aadhaar."));
      setPhase("failed");
      onRetryDevice();
    }
  }

  const consentText = `I, ${user?.name?.trim() || "the account holder"}, allow ${brand.name} to use my Aadhaar number and fingerprint to authenticate me with UIDAI for today's ${service} session. My fingerprint is encrypted on the RD device and is not stored by ${brand.name}. This consent is valid until 11:59 PM today.`;

  const stepDone = [deviceReady, consent, false];

  return (
    <div className="space-y-4">
      {error && phase === "failed" ? (
        <div className="dv-fade-up flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5" role="alert">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-800">{error}</p>
            <p className="text-xs text-red-700/80">{failureHint(error)}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded-lg p-1 text-red-400 transition hover:bg-red-100 hover:text-red-600"
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6" style={{ borderColor: B.border }}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <AadhaarCard phase={phase} quality={quality} kycReady={kycReady} aadhaarLastFour={aadhaarLastFour} />
            {kycReady ? (
              <div
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs text-gray-600"
                style={{ borderColor: B.border, background: "#F7F9FF" }}
              >
                <span className="flex items-center gap-2">
                  <History size={14} className="text-gray-400" />
                  Last verified: <b className="font-semibold text-gray-800">{describeVerifiedAt(lastAt)}</b>
                </span>
                <span>
                  {done ? "Next: " : "Due: "}
                  <b className="font-semibold text-gray-800">{done ? "tomorrow" : "before your first transaction today"}</b>
                </span>
              </div>
            ) : null}
          </div>

          {kycReady ? (
            <div className="flex min-w-0 flex-col gap-3">
              <section className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                <p className="mb-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] font-bold tracking-[0.14em]" style={{ color: B.blue }}>
                    VERIFY WITH
                  </span>
                  <span className="text-[11px] text-gray-400">Choose a verification method</span>
                </p>
                <div className="grid grid-cols-3 gap-2.5">
                  <MethodTile icon={Fingerprint} label="Fingerprint" hint="RD device" selected />
                  <MethodTile icon={ScanFace} label="Face" hint="Android app only" muted onClick={showFaceHint} />
                  <MethodTile
                    icon={ScanEye}
                    label="Iris"
                    hint="Coming soon"
                    muted
                    onClick={() => toast("Iris verification is coming soon. Use Fingerprint.")}
                  />
                </div>
              </section>

              <DeviceRow
                status={rdStatus}
                label={deviceLabel}
                locked={busy}
                onRetry={onRetryDevice}
                onChange={onChangeDevice}
              />

              <section className="rounded-2xl border bg-white p-4" style={{ borderColor: B.border }}>
                <label className={clsx("flex items-start gap-3", busy || done ? "cursor-default" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy || done}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
                  />
                  <span>
                    <span className="block text-sm font-bold text-gray-900">
                      I accept Aadhaar consent for today&apos;s {service} access
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      Your consent is required once each day before biometric verification.
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setConsentOpen((v) => !v)}
                  aria-expanded={consentOpen}
                  className="ml-7 mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700"
                >
                  Read consent
                  <ChevronDown size={14} className={clsx("transition-transform", consentOpen && "rotate-180")} />
                </button>
                {consentOpen ? (
                  <p
                    className="dv-fade-up ml-7 mt-2 rounded-xl p-3 text-xs leading-relaxed text-gray-600"
                    style={{ background: "#F7F9FF" }}
                  >
                    {consentText}
                  </p>
                ) : null}
              </section>

              {done ? (
                <>
                  <section className="dv-fade-up flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm">
                      <Check size={22} strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-green-800">You&apos;re verified for today.</p>
                      <p className="text-xs text-green-700">Valid till 11:59 PM.</p>
                    </div>
                  </section>
                  <PrimaryButton type="button" variant="primary" onClick={onVerified} className="mt-auto">
                    {continueLabel}
                  </PrimaryButton>
                </>
              ) : phase === "failed" ? (
                <div className="mt-auto grid grid-cols-2 gap-3">
                  <PrimaryButton
                    type="button"
                    variant="primary"
                    showArrow={false}
                    disabled={!canScan}
                    onClick={() => void scan()}
                  >
                    <RotateCw size={16} />
                    Try again
                  </PrimaryButton>
                  <PrimaryButton type="button" variant="secondary" onClick={showFaceHint}>
                    Use face instead
                  </PrimaryButton>
                </div>
              ) : (
                <div className="mt-auto">
                  <button
                    type="button"
                    onClick={() => void scan()}
                    disabled={!canScan}
                    className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-bold text-white shadow-[0_12px_28px_rgba(11,42,154,0.25)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    style={{ background: SCAN_GRAD }}
                  >
                    {busy ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        {phase === "scanning" ? "Scanning…" : "Checking with UIDAI…"}
                      </>
                    ) : (
                      <>
                        Scan fingerprint
                        <Fingerprint size={18} />
                      </>
                    )}
                  </button>
                  {!busy && blockedHint ? (
                    <p className="mt-2 text-center text-xs font-medium text-amber-700">{blockedHint}</p>
                  ) : null}
                </div>
              )}

              {!done ? (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
                  <ShieldCheck size={13} className="text-green-600" />
                  256-bit encrypted biometric verification
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-3">
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">Daily verification needs the Aadhaar from your KYC</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Add your Aadhaar in KYC. Once it is on file, come back here and verify with your fingerprint to
                  unlock {service} for the day.
                </p>
              </section>
              <PrimaryButton
                type="button"
                variant="primary"
                className="mt-auto"
                onClick={() => router.push("/settings?tab=kyc")}
              >
                Complete KYC
              </PrimaryButton>
            </div>
          )}
        </div>

        {!done ? (
          <section
            className="mt-5 grid items-center gap-4 rounded-2xl border p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)_minmax(0,1.3fr)]"
            style={{ borderColor: B.border, background: "#F7F9FF" }}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100/70">
                <Fingerprint size={20} style={{ color: B.blueLight }} />
              </span>
              <div>
                <p className="text-base font-semibold text-gray-900">Complete verification</p>
                <p className="text-xs text-gray-500">It takes less than a minute.</p>
              </div>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-2.5">
                  <span
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      stepDone[i] ? "border-green-500 bg-green-500 text-white" : "bg-white text-gray-600",
                    )}
                    style={stepDone[i] ? undefined : { borderColor: B.border }}
                  >
                    {stepDone[i] ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-gray-900">{s.title}</span>
                    <span className="block text-[11px] text-gray-500">{s.hint}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="rounded-xl border bg-white/80 p-3.5" style={{ borderColor: B.border }}>
              <p className="mb-2 text-[10px] font-bold tracking-[0.14em] text-gray-500">TIPS FOR A GOOD SCAN</p>
              <ul className="space-y-1.5">
                {TIPS.map((t) => (
                  <li key={t} className="flex items-center gap-2 text-xs text-gray-600">
                    <Check size={13} strokeWidth={3} className="shrink-0 text-green-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
