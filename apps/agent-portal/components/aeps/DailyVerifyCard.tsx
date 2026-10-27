"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { toast } from "react-hot-toast";
import { AlertTriangle, CalendarDays, Check, ChevronDown, Fingerprint, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import api from "@/lib/api";
import { B, brand, initials } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { todayPhoneLocation } from "@/lib/phoneLocation";
import { captureFingerprintWeb, type FingerprintCaptureOptions } from "@/lib/rdServiceFingerprint";
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
  /** Omit to hide the "Last verified" line (e.g. Aadhaar Pay, where the provider keeps that date). */
  lastVerifiedAt?: string | null;
  verifiedToday?: boolean;
  /** AEPS agent onboarding not finished: the provider 2FA needs the onboarding agent id. */
  onboardingPending?: boolean;
  onCompleteOnboarding?: () => void;
  /** Heading on the right, default "Daily Merchant Authentication (2FA)". */
  title?: string;
  /** Small label above the heading, e.g. "Step 1 of 2". */
  stepLabel?: string;
  scanLabel?: string;
  successToast?: string;
  captureOptions?: FingerprintCaptureOptions;
  /** Sends the captured PID; returns verifiedAt when known. Default: POST /auth/agent-auth. */
  submit?: (biometricPayload: string) => Promise<string | null | void>;
  rdStatus: RdStatus;
  deviceLabel: string;
  onRetryDevice: () => void;
  onChangeDevice: () => void;
  /** Continue tapped after a successful verification. */
  onVerified: () => void;
};

type KycCardProfile = {
  dob: string | null;
  gender: string | null;
  fatherName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

const TRICOLOR = "linear-gradient(90deg, #FF9933 0%, #FFB766 30%, #F2F4FA 50%, #5BBF6A 70%, #138808 100%)";
const SCAN_GRAD = "linear-gradient(90deg, #2A5CDD 0%, #1E44C0 55%, #0B2A9A 100%)";

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

function formatDob(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : raw.trim() || null;
}

function relationPrefix(gender: string | null): string {
  const g = (gender ?? "").toLowerCase();
  if (g.startsWith("f")) return "D/O";
  if (g.startsWith("m")) return "S/O";
  return "C/O";
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

async function submitAgentAuth(biometricPayload: string): Promise<string | null> {
  // Today's phone-verified location; without it the API uses the saved shop location.
  const phone = todayPhoneLocation();
  const geo = phone ? { latitude: phone.latitude, longitude: phone.longitude } : {};
  const { data } = await api.post<ApiResponse<{ verifiedAt: string }>>("/auth/agent-auth", {
    biometricPayload,
    ...geo,
  });
  if (!data.success) throw new Error(data.message);
  return data.data?.verifiedAt ?? null;
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

function useKycCardProfile(enabled: boolean): KycCardProfile | null {
  const [profile, setProfile] = useState<KycCardProfile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api
      .get<ApiResponse<{ profile: KycCardProfile }>>("/kyc/me")
      .then(({ data }) => {
        if (!cancelled && data.success) setProfile(data.data.profile);
      })
      .catch(() => {
        /* card shows name + number only */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return profile;
}

/* ── Left: Aadhaar card ────────────────────────────────────────────── */

function CardEmblem() {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <div
        aria-hidden
        className="absolute -inset-2 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(255,153,51,0.7) 0deg 3deg, transparent 3deg 15deg)",
          WebkitMaskImage: "radial-gradient(circle closest-side, #000 60%, transparent 100%)",
          maskImage: "radial-gradient(circle closest-side, #000 60%, transparent 100%)",
        }}
      />
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white">
        <Fingerprint size={18} className="text-red-600" />
      </div>
    </div>
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
  const photoUrl = useKycPhoto(kycReady);
  const profile = useKycCardProfile(kycReady);
  const verified = phase === "success";
  const busy = phase === "scanning" || phase === "verifying";

  const dob = formatDob(profile?.dob ?? null);
  const address = [profile?.address, profile?.city, profile?.state, profile?.pincode]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="relative w-full max-w-[480px] overflow-hidden rounded-2xl border bg-white shadow-[0_10px_28px_rgba(11,42,154,0.08)]"
      style={{ borderColor: "rgba(11,42,154,0.12)" }}
    >
      <div aria-hidden className="h-1" style={{ background: TRICOLOR }} />

      <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2.5">
          <CardEmblem />
          <span className="text-sm font-extrabold tracking-wide text-red-600">AADHAAR</span>
        </div>
        {verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
            <Check size={11} strokeWidth={3} />
            Verified today
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Not verified today
          </span>
        )}
      </div>
      <div aria-hidden className="mx-4 h-px" style={{ background: "rgba(11,42,154,0.12)" }} />

      {kycReady ? (
        <>
          <div className="flex gap-4 px-4 py-3.5">
            <div
              className="relative h-[92px] w-[76px] shrink-0 overflow-hidden rounded-lg border"
              style={{ borderColor: "rgba(11,42,154,0.15)", background: B.badgeGrad }}
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="KYC photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                  {initials(name)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-gray-800">
              <p className="truncate text-base font-bold text-gray-900">{name}</p>
              {dob ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold">
                  <CalendarDays size={12} className="text-gray-500" />
                  DOB: {dob}
                </p>
              ) : null}
              {profile?.fatherName ? (
                <p className="mt-1 truncate text-[11px] text-gray-600">
                  {relationPrefix(profile.gender)} {profile.fatherName}
                </p>
              ) : null}
              {address ? <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">{address}</p> : null}
            </div>
          </div>

          <div aria-hidden className="mx-4 border-t border-dashed" style={{ borderColor: "rgba(11,42,154,0.18)" }} />
          <div className="px-4 pb-3 pt-2.5 text-center">
            <p className="text-lg font-bold tabular-nums tracking-[0.22em] text-gray-900">
              XXXX XXXX {aadhaarLastFour ?? "····"}
            </p>
            <div aria-hidden className="mx-auto mt-1.5 h-0.5 w-2/3 rounded-full bg-red-500/70" />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center px-6 py-7 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100">
            <Fingerprint size={20} className="text-gray-500" />
          </span>
          <p className="mt-3 text-sm font-bold text-gray-800">Aadhaar not found in your KYC</p>
          <p className="mt-0.5 text-xs text-gray-500">Add your Aadhaar details to complete daily verification.</p>
        </div>
      )}

      {verified ? (
        <div className="pointer-events-none absolute right-4 top-14 -rotate-12">
          <div className="dv-stamp flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-[3px] border-green-500/70 bg-white/80 text-green-600">
            <Check size={16} strokeWidth={3} />
            <span className="text-[10px] font-extrabold tracking-[0.1em]">VERIFIED</span>
            <span className="text-[7px] font-bold tracking-[0.2em]">TODAY</span>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="dv-fade-up absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 px-6 backdrop-blur-[2px]">
          <span className="dv-ring flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Fingerprint size={26} style={{ color: B.blueLight }} />
          </span>
          <p className="mt-2.5 text-sm font-bold" style={{ color: B.blue }}>
            {phase === "scanning" ? "Place your finger on the device…" : "Checking with UIDAI…"}
          </p>
          <div className="mt-2 w-full max-w-48">
            <p className="mb-1 text-[10px] font-medium text-gray-500">
              {quality != null ? `Quality ${quality}%` : "Capturing fingerprint"}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
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
        </div>
      ) : null}
    </div>
  );
}

/* ── Right: compact action column ──────────────────────────────────── */

function DeviceStatus({
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
  return (
    <div
      className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border bg-white px-3 py-2"
      style={{ borderColor: B.border }}
    >
      {status === "ready" ? (
        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
          <span className="truncate">{label} connected</span>
        </span>
      ) : status === "looking" ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
          <Loader2 size={12} className="animate-spin" />
          Looking for device…
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
          <AlertTriangle size={12} />
          No Device Connected
        </span>
      )}
      <button
        type="button"
        onClick={onRetry}
        disabled={locked}
        className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline disabled:opacity-50"
      >
        <RotateCw size={12} />
        Re-scan
      </button>
      <button
        type="button"
        onClick={onChange}
        disabled={locked}
        className="text-xs font-bold text-blue-700 hover:underline disabled:opacity-50"
      >
        Change
      </button>
    </div>
  );
}

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
  onboardingPending = false,
  onCompleteOnboarding,
  title = "Daily Merchant Authentication (2FA)",
  stepLabel,
  scanLabel = "Capture Merchant Fingerprint",
  successToast,
  captureOptions,
  submit,
}: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [phase, setPhase] = useState<Phase>(verifiedToday ? "success" : "idle");
  const [consent, setConsent] = useState(verifiedToday);
  const [consentOpen, setConsentOpen] = useState(false);
  const [quality, setQuality] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(lastVerifiedAt ?? null);

  const busy = phase === "scanning" || phase === "verifying";
  const done = phase === "success";
  const canScan = kycReady && !onboardingPending && consent && rdStatus === "ready" && !busy && !done;

  const blockedHint = !consent
    ? "Accept Aadhaar consent to continue."
    : rdStatus === "missing"
      ? "Connect the RD device and tap Re-scan."
      : rdStatus === "looking"
        ? "Waiting for the RD device…"
        : null;

  async function scan() {
    if (!canScan) {
      if (blockedHint) toast.error(blockedHint);
      return;
    }
    setError(null);
    setQuality(null);
    setPhase("scanning");
    try {
      const biometricPayload = await captureFingerprintWeb(captureOptions);
      setQuality(readQualityScore(biometricPayload));
      setPhase("verifying");
      const verifiedAt = submit ? await submit(biometricPayload) : await submitAgentAuth(biometricPayload);
      setLastAt(verifiedAt || new Date().toISOString());
      setPhase("success");
      toast.success(successToast ?? `${service} unlocked for today`);
    } catch (err) {
      setError(extractApiError(err, "Fingerprint could not be verified with your Aadhaar."));
      setPhase("failed");
      onRetryDevice();
    }
  }

  const consentText = `I, ${user?.name?.trim() || "the account holder"}, allow ${brand.name} to use my Aadhaar number and fingerprint to authenticate me with UIDAI for today's ${service} session. My fingerprint is encrypted on the RD device and is not stored by ${brand.name}. This consent is valid until 11:59 PM today.`;

  const subtitle = !kycReady
    ? "Add your Aadhaar in KYC to start daily verification."
    : onboardingPending
      ? "Finish AEPS agent onboarding first — daily verification runs on your AEPS agent ID."
      : done
        ? "You're verified for today. Valid till 11:59 PM."
        : `Daily biometric authentication is required before ${service} transactions.`;

  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm sm:p-6" style={{ borderColor: B.border }}>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,480px)_minmax(0,1fr)] md:gap-0">
        <div className="flex justify-center md:justify-start md:border-r md:pr-6" style={{ borderColor: B.border }}>
          <AadhaarCard phase={phase} quality={quality} kycReady={kycReady} aadhaarLastFour={aadhaarLastFour} />
        </div>

        <div className="flex min-w-0 flex-col items-center text-center md:pl-6">
          <span
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-full",
              done ? "bg-green-50 text-green-600" : "bg-blue-50",
              !done && !busy && "dv-ring",
            )}
            style={done ? undefined : { color: B.blue }}
          >
            {done ? <Check size={22} strokeWidth={3} /> : <Fingerprint size={22} />}
          </span>
          {stepLabel ? (
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: B.blueLight }}>
              {stepLabel}
            </p>
          ) : null}
          <h2 className="mt-1.5 text-lg font-bold text-gray-900">{title}</h2>
          <p className={clsx("mt-0.5 text-xs", done ? "font-semibold text-green-700" : "text-gray-500")}>{subtitle}</p>

          {kycReady && !onboardingPending && !done ? (
            <>
              <div className="mt-3">
                <DeviceStatus
                  status={rdStatus}
                  label={deviceLabel}
                  locked={busy}
                  onRetry={onRetryDevice}
                  onChange={onChangeDevice}
                />
              </div>

              <div className="mt-3 w-full max-w-md text-left">
                <label className={clsx("flex items-start gap-2.5", busy ? "cursor-default" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
                  />
                  <span className="text-xs text-gray-700">
                    I accept Aadhaar consent for today&apos;s {service} access.{" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setConsentOpen((v) => !v);
                      }}
                      aria-expanded={consentOpen}
                      className="inline-flex items-center gap-0.5 font-bold text-blue-700"
                    >
                      Read
                      <ChevronDown size={12} className={clsx("transition-transform", consentOpen && "rotate-180")} />
                    </button>
                  </span>
                </label>
                {consentOpen ? (
                  <p
                    className="dv-fade-up ml-6 mt-1.5 rounded-lg p-2.5 text-[11px] leading-relaxed text-gray-600"
                    style={{ background: "#F7F9FF" }}
                  >
                    {consentText}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {error && phase === "failed" ? (
            <div
              className="dv-fade-up mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left"
              role="alert"
            >
              <p className="text-xs font-bold text-red-800">{error}</p>
              <p className="text-[11px] text-red-700/80">{failureHint(error)}</p>
            </div>
          ) : null}

          <div className="mt-4 w-full">
            {!kycReady ? (
              <PrimaryButton type="button" variant="primary" className="w-full" onClick={() => router.push("/settings?tab=kyc")}>
                Complete KYC
              </PrimaryButton>
            ) : onboardingPending ? (
              <PrimaryButton type="button" variant="primary" className="w-full" onClick={onCompleteOnboarding}>
                Complete AEPS onboarding
              </PrimaryButton>
            ) : done ? (
              <PrimaryButton type="button" variant="primary" className="w-full" onClick={onVerified}>
                {continueLabel}
              </PrimaryButton>
            ) : (
              <button
                type="button"
                onClick={() => void scan()}
                disabled={!canScan}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-bold text-white shadow-[0_10px_24px_rgba(11,42,154,0.22)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                style={{ background: SCAN_GRAD }}
              >
                {busy ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    {phase === "scanning" ? "Scanning…" : "Checking with UIDAI…"}
                  </>
                ) : (
                  <>
                    {phase === "failed" ? <RotateCw size={17} /> : <Fingerprint size={17} />}
                    {phase === "failed" ? "Try again" : scanLabel}
                  </>
                )}
              </button>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-600" />
              256-bit encrypted
            </span>
            {lastVerifiedAt !== undefined && kycReady ? <span>Last verified: {describeVerifiedAt(lastAt)}</span> : null}
            {!done && kycReady && !onboardingPending ? <span>Face verification: Android app</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}
