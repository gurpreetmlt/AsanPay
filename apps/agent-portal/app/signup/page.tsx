"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import {
  PAN_FORMAT_ERROR,
  SIGNUP_POLICY_VERSION,
  kycDocCheckBlocksStep,
  kycDocCheckLabel,
  kycDocCheckToUi,
  type ApiResponse,
  type AuthUser,
  type KycDocCheckResult,
  type KycDocCheckSlot,
  type KycDocCheckUi,
} from "@asanpay/shared-types";
import { AsanPayLockup } from "@/components/brand/Logo";
import { EmailVerifyField } from "@/components/EmailVerifyField";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { LabelText } from "@/components/ui/RequiredMark";
import { DateField } from "@/components/ui/DateField";
import { SignupStepper, SIGNUP_STEPS } from "@/components/signup/SignupStepper";
import {
  LocationPermissionModal,
  TermsAcceptModal,
  requestBrowserLocation,
  reverseGeocodeAddress,
  reverseGeocodeDetails,
} from "@/components/signup/SignupLocationTerms";
import api, { AADHAAR_OTP_TIMEOUT_MS } from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import { B } from "@/lib/brand";
import { extractApiError, needsSignupKycCompletion } from "@/lib/onboarding";
import { lookupIndianPincode } from "@/lib/pincode";
import {
  IfscBankDetailsFields,
} from "@/components/banking/IfscBankDetailsFields";
import {
  clearSignupDraft,
  EMPTY_SIGNUP_DRAFT,
  getSignupResumeStep,
  loadSignupDraft,
  saveSignupDraft,
  type SignupDraft,
  type SignupFileMeta,
  type SignupRole,
} from "@/lib/signupDraft";
import { useAuthStore } from "@/lib/store";

type SponsorRole = "admin" | "super_distributor" | "distributor";

interface SessionData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface SponsorInfo {
  uid: string;
  name: string;
  mobile: string;
  role: SponsorRole;
}

interface InviteInfo {
  role: "distributor" | "retailer";
  name: string;
  mobile: string;
  email: string;
  expiresAt: string;
  sponsor: SponsorInfo;
}

const ROLE_OPTIONS: { value: SignupRole; label: string }[] = [
  { value: "retailer", label: "Retailer" },
  { value: "direct_retailer", label: "Direct Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "super_distributor", label: "Super Distributor" },
];

function isPartnerRole(role: SignupRole): boolean {
  return role === "distributor" || role === "super_distributor";
}

const SPONSOR_ROLE: Record<Exclude<SignupRole, "direct_retailer">, SponsorRole> = {
  super_distributor: "admin",
  distributor: "super_distributor",
  retailer: "distributor",
};

const UPLINE_LABEL: Record<"distributor" | "retailer", string> = {
  distributor: "Super Distributor mobile no.",
  retailer: "Distributor mobile no.",
};

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Private Limited", "Other"];
const BUSINESS_CATEGORIES = ["Mobile Handsets", "Kirana", "Electronics", "Pharmacy", "Other"];
const TURNOVERS = ["Below 1L", "1L-5L", "5L-10L", "10L+"];
const BUSINESS_PROOFS = ["Shop License", "GST Certificate", "Udyam", "Rent Agreement", "Other"];

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
      {typeof children === "string" ? <LabelText label={children} /> : children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm outline-none";
const inputStyle = { borderColor: B.border, color: B.blue } as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image"));
    };
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

async function fileMeta(
  file: File,
  geo?: { latitude: string; longitude: string },
): Promise<SignupFileMeta> {
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  let dataUrl: string | undefined;
  if (isImage) {
    try {
      const raw = await readFileAsDataUrl(file);
      // Keep under backend Zod max (~2MB string)
      if (raw.length <= 1_900_000) dataUrl = raw;
    } catch {
      dataUrl = undefined;
    }
  }
  return {
    name: file.name,
    mime: file.type,
    size: file.size,
    dataUrl,
    ...(geo
      ? {
          latitude: geo.latitude,
          longitude: geo.longitude,
          capturedAt: new Date().toISOString(),
        }
      : {}),
  };
}

function FileUpload({
  label,
  meta,
  previewUrl,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
  emptyHint = "Tap to upload",
  onPick,
  onClear,
  error,
  compact,
  check,
}: {
  label: string;
  meta: SignupFileMeta | null;
  previewUrl?: string | null;
  accept?: string;
  emptyHint?: string;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: boolean;
  /** Tighter box for 2-up grids */
  compact?: boolean;
  /** KYC photo check result shown under the box */
  check?: KycDocCheckUi;
}) {
  const checkFailed = check?.state === "fail";
  const checkColor =
    check?.state === "fail"
      ? "#DC2626"
      : check?.state === "flag"
        ? "#B45309"
        : check?.state === "pass"
          ? "#15803D"
          : B.muted;
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <label
        className={`flex cursor-pointer flex-col rounded-2xl border-2 border-dashed transition ${
          compact ? "min-h-[5.5rem] gap-1 px-3 py-3" : "min-h-[6.5rem] gap-2 px-4 py-4"
        }`}
        style={{
          borderColor: error || checkFailed ? "#DC2626" : meta ? B.green : B.border,
          background: error || checkFailed ? "#FEF2F2" : B.bg,
        }}
      >
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className={`rounded-xl object-contain ${compact ? "max-h-20" : "max-h-28"}`}
          />
        ) : null}
        <span className={`font-semibold ${compact ? "text-xs" : "text-sm"}`} style={{ color: error ? "#DC2626" : B.blue }}>
          {meta ? meta.name : emptyHint}
        </span>
        <span className="text-[11px] leading-snug" style={{ color: B.muted }}>
          {compact ? "JPG / PNG / PDF · 2 MB" : "JPG, PNG, WEBP, HEIC or PDF · max 2 MB"}
        </span>
      </label>
      {error && !meta && !check ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "#DC2626" }}>
          {label.replace(/\s*\*.*$/, "")} is required
        </p>
      ) : null}
      {check ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: checkColor }} role="status" aria-live="polite">
          {kycDocCheckLabel(check)}
        </p>
      ) : null}
      {meta ? (
        <button type="button" className="mt-1 text-xs font-semibold underline" style={{ color: B.muted }} onClick={onClear}>
          Remove
        </button>
      ) : null}
    </div>
  );
}

function LivePhotoCapture({
  label,
  facing,
  meta,
  previewUrl,
  busy,
  onPick,
  onClear,
  error,
}: {
  label: string;
  facing: "user" | "environment";
  meta: SignupFileMeta | null;
  previewUrl?: string | null;
  busy?: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: boolean;
}) {
  const inputId = `live-photo-${facing}-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const facingLabel = facing === "user" ? "Front camera" : "Rear camera";

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Force facing mode — React/browsers often ignore capture="user" otherwise.
    el.setAttribute("capture", facing);
  }, [facing]);

  useEffect(() => {
    return () => stopStream();
  }, []);

  useEffect(() => {
    if (!camOpen || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [camOpen]);

  async function openLiveCamera() {
    if (busy || camBusy) return;
    setCamError(null);
    setCamBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        inputRef.current?.click();
        return;
      }
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { exact: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }).catch(() =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }),
      );
      streamRef.current = stream;
      setCamOpen(true);
    } catch {
      setCamError(`Could not open ${facingLabel.toLowerCase()}. Falling back to device picker.`);
      inputRef.current?.click();
    } finally {
      setCamBusy(false);
    }
  }

  function closeLiveCamera() {
    stopStream();
    setCamOpen(false);
  }

  function snapPhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCamError("Camera not ready — wait a moment and try again");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror selfie so it matches what the user sees
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCamError("Could not capture photo");
          return;
        }
        const file = new File(
          [blob],
          facing === "user" ? "personal-live.jpg" : "shop-live.jpg",
          { type: "image/jpeg" },
        );
        closeLiveCamera();
        onPick(file);
      },
      "image/jpeg",
      0.85,
    );
  }

  return (
    <div>
      <Label>{label}</Label>
      <div
        className="flex flex-col gap-2 rounded-2xl border-2 border-dashed px-4 py-4"
        style={{
          borderColor: error ? "#DC2626" : meta ? B.green : B.border,
          background: error ? "#FEF2F2" : B.bg,
        }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="max-h-36 rounded-xl object-contain" />
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          capture={facing}
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy || camBusy}
          onClick={() => void openLiveCamera()}
          className="cursor-pointer text-left text-sm font-semibold"
          style={{ color: error ? "#DC2626" : B.blue, opacity: busy || camBusy ? 0.6 : 1 }}
        >
          {busy || camBusy
            ? busy
              ? "Getting location…"
              : "Opening camera…"
            : meta
              ? "Retake live photo"
              : "Open camera — live capture"}
        </button>
        <span className="text-xs" style={{ color: B.muted }}>
          {facingLabel} · geotagged with latitude &amp; longitude · max 2 MB
        </span>
        {camError ? (
          <span className="text-xs font-semibold" style={{ color: "#B45309" }}>
            {camError}
          </span>
        ) : null}
        {meta?.latitude && meta?.longitude ? (
          <span className="text-xs font-semibold" style={{ color: B.green }}>
            Geo: {Number(meta.latitude).toFixed(5)}, {Number(meta.longitude).toFixed(5)}
          </span>
        ) : null}
      </div>
      {error && (!meta || !meta.latitude || !meta.longitude) ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "#DC2626" }}>
          Live capture with location is required
        </p>
      ) : null}
      {meta ? (
        <button type="button" className="mt-1 text-xs font-semibold underline" style={{ color: B.muted }} onClick={onClear}>
          Remove
        </button>
      ) : null}

      {camOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={facingLabel}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border bg-white shadow-xl"
            style={{ borderColor: B.border }}
          >
            <div className="px-4 py-3">
              <p className="text-sm font-bold" style={{ color: B.blue }}>
                {label.replace(/\s*\*.*$/, "")} · {facingLabel}
              </p>
            </div>
            <div className="bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-[60vh] w-full object-cover"
                style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
              />
            </div>
            <div className="flex gap-3 p-4">
              <PrimaryButton
                type="button"
                variant="destructive"
                showArrow={false}
                onClick={closeLiveCamera}
                className="!w-auto flex-1"
              >
                Cancel
              </PrimaryButton>
              <PrimaryButton type="button" onClick={snapPhoto} className="!w-auto flex-[2]">
                Capture photo
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center" style={{ background: B.bg }}>
          <p className="text-sm font-semibold" style={{ color: B.muted }}>
            Loading…
          </p>
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const inviteToken = (searchParams.get("invite") || "").trim();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState<SignupDraft>(EMPTY_SIGNUP_DRAFT);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sponsor, setSponsor] = useState<SponsorInfo | null>(null);
  const [sponsorStatus, setSponsorStatus] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [pinBusy, setPinBusy] = useState(false);
  const [bizPinBusy, setBizPinBusy] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [stepErrorKey, setStepErrorKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [mobileChecking, setMobileChecking] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [addressFetchBusy, setAddressFetchBusy] = useState(false);
  const [photoCaptureBusy, setPhotoCaptureBusy] = useState(false);
  const [aadhaarOtp, setAadhaarOtp] = useState("");
  const [aadhaarOtpBusy, setAadhaarOtpBusy] = useState<"send" | "verify" | null>(null);
  const [panVerifyBusy, setPanVerifyBusy] = useState(false);
  const [panVerifyFailed, setPanVerifyFailed] = useState(false);
  const panAutoAttemptRef = useRef("");
  const [docChecks, setDocChecks] = useState<Partial<Record<KycDocCheckSlot, KycDocCheckUi>>>({});
  /** Latest check per field — stale responses (photo re-picked / removed) are ignored. */
  const docCheckSeqRef = useRef<Partial<Record<KycDocCheckSlot, number>>>({});

  const stepIndex = draft.stepIndex;
  const needsUpline = draft.role !== "super_distributor" && draft.role !== "direct_retailer";
  const sponsorRole =
    draft.role === "direct_retailer" ? "admin" : SPONSOR_ROLE[draft.role as Exclude<SignupRole, "direct_retailer">];
  const storageKey =
    user?.id && (draft.accountCreated || Boolean(accessToken))
      ? user.id
      : draft.mobile.replace(/\D/g, "") || "anon";
  const hasLocation = Boolean(draft.latitude && draft.longitude);
  const loggedInContinue = Boolean(user?.id && accessToken);
  const canEditIdentity = !loggedInContinue || needsSignupKycCompletion(user);

  function patch(p: Partial<SignupDraft>) {
    setDraft((d) => {
      const next = { ...d, ...p };
      const prevMax = Math.max(d.maxStepReached ?? 0, d.stepIndex ?? 0);
      next.maxStepReached = Math.max(prevMax, next.maxStepReached ?? 0, next.stepIndex ?? 0);
      return next;
    });
  }

  async function ensureLocation() {
    setLocationBusy(true);
    setLocationError(null);
    try {
      const coords = await requestBrowserLocation();
      patch({ latitude: coords.latitude, longitude: coords.longitude });
      const label = await reverseGeocodeAddress(Number(coords.latitude), Number(coords.longitude));
      setLocationLabel(label);
      setShowLocationModal(false);
      return true;
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : "Location access denied");
      setShowLocationModal(true);
      return false;
    } finally {
      setLocationBusy(false);
    }
  }

  useEffect(() => {
    const phone = (user?.mobile || "").replace(/\D/g, "").slice(0, 10);
    const byUser = user?.id ? loadSignupDraft(user.id) : null;
    const byPhone = phone ? loadSignupDraft(phone) : null;

    // Never scan random localStorage drafts — that pulled half-typed numbers from other sessions.
    let existing: SignupDraft | null = byUser || byPhone;
    if (existing && phone) {
      const draftPhone = existing.mobile.replace(/\D/g, "").slice(0, 10);
      // Drop draft if it belongs to a different number than the logged-in account.
      if (draftPhone && draftPhone.length === 10 && draftPhone !== phone && !byUser) {
        existing = null;
      }
    }

    if (user?.id) {
      if (user.kycStatus === "verified") {
        router.replace("/dashboard");
        return;
      }
      // Under review — stay on dashboard (rejected may resubmit).
      if (user.hasKycDocs && user.kycStatus !== "rejected") {
        router.replace("/dashboard");
        return;
      }

      const base = existing ? { ...EMPTY_SIGNUP_DRAFT, ...existing } : { ...EMPTY_SIGNUP_DRAFT };
      const stepQ = Number(stepParam);
      const requested =
        Number.isFinite(stepQ) && stepQ >= 0 && stepQ <= 8 ? Math.floor(stepQ) : null;
      const resumeAt = getSignupResumeStep(base, 2);
      const next: SignupDraft = {
        ...base,
        mobile: phone || base.mobile.replace(/\D/g, "").slice(0, 10),
        accountCreated: true,
        signupToken: "",
        name: base.name.trim() || user.name || "",
        // Never change role on Continue KYC — keep the existing account role.
        role: (user.role as SignupRole) || base.role,
        maxStepReached: Math.max(resumeAt, requested ?? 0),
        // Logged-in resume: deep-link ?step= or furthest step reached.
        stepIndex: requested ?? resumeAt,
      };
      setDraft(next);
      if (phone) clearSignupDraft("anon");
      setDraftReady(true);
      return;
    }

    const q = (searchParams.get("role") || "").trim();

    if (existing) {
      if (!existing.accountCreated && isPartnerRole(existing.role)) {
        existing.role = "retailer";
      }
      setDraft(existing);
      if (existing.accountCreated && existing.stepIndex < 2) {
        setDraft({ ...existing, stepIndex: 2 });
      } else if (existing.signupToken && existing.stepIndex < 1 && !existing.accountCreated) {
        setDraft({ ...existing, stepIndex: 1 });
      }
    } else {
      const fromLogin: SignupRole | null = q === "retailer" || q === "direct_retailer" ? q : null;
      if (fromLogin) {
        setDraft({ ...EMPTY_SIGNUP_DRAFT, role: fromLogin });
      }
    }
    setDraftReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.mobile]);

  // Settings / stepper deep-link: jump to ?step= without resetting the whole draft.
  useEffect(() => {
    if (!draftReady || !loggedInContinue || stepParam == null) return;
    const stepQ = Number(stepParam);
    if (!Number.isFinite(stepQ) || stepQ < 0 || stepQ > 8) return;
    const s = Math.floor(stepQ);
    setDraft((d) => {
      if (d.stepIndex === s) return d;
      return {
        ...d,
        stepIndex: s,
        maxStepReached: Math.max(d.maxStepReached ?? 0, s),
      };
    });
  }, [stepParam, draftReady, loggedInContinue]);

  useEffect(() => {
    if (!draftReady) return;
    saveSignupDraft(storageKey, draft);
  }, [draft, draftReady, storageKey]);

  useEffect(() => {
    if (!draftReady || !inviteToken || loggedInContinue || draft.accountCreated) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<ApiResponse<InviteInfo>>(`/invites/lookup/${encodeURIComponent(inviteToken)}`);
        if (cancelled || !data.success) return;
        const inv = data.data;
        setInvite(inv);
        setDraft((d) => ({
          ...d,
          role: inv.role,
          name: d.name.trim() ? d.name : inv.name,
          mobile: inv.mobile,
          email: d.email.trim() ? d.email : inv.email,
          sponsorMobile: inv.sponsor.mobile.replace(/\D/g, "").slice(0, 10),
        }));
      } catch (err) {
        if (!cancelled) toast.error(extractApiError(err, "This invite link is not valid. Ask your upline to send a new one."));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, inviteToken, loggedInContinue]);

  useEffect(() => {
    if (!draftReady || !loggedInContinue || !needsUpline) return;
    if (draft.sponsorUid && draft.sponsorMobile) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{
            upline: { uid: string; name: string; mobile: string; role: string } | null;
          }>
        >("/auth/upline");
        if (cancelled || !data.success || !data.data.upline) return;
        const u = data.data.upline;
        patch({
          sponsorUid: u.uid,
          sponsorName: u.name,
          sponsorMobile: u.mobile.replace(/\D/g, "").slice(0, 10),
        });
        setSponsor({
          uid: u.uid,
          name: u.name,
          mobile: u.mobile,
          role: u.role as SponsorRole,
        });
        setSponsorStatus("ok");
      } catch {
        /* optional display */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, loggedInContinue, needsUpline, user?.id]);

  useEffect(() => {
    if (!draftReady || stepIndex !== 0) return;
    if (draft.latitude && draft.longitude) {
      setShowLocationModal(false);
      return;
    }
    setShowLocationModal(true);
    void ensureLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, stepIndex]);

  useEffect(() => {
    if (!draftReady || stepIndex !== 0 || otpSent) return;
    const phone = draft.mobile.replace(/\D/g, "").slice(0, 10);
    if (phone.length !== 10) {
      setMobileError(null);
      setMobileChecking(false);
      return;
    }
    // Own number while logged in (Continue KYC) is never "taken".
    if (loggedInContinue) {
      const mine = (user?.mobile || "").replace(/\D/g, "").slice(0, 10);
      if (phone === mine) {
        setMobileError(null);
        setMobileChecking(false);
        return;
      }
    }
    let cancelled = false;
    setMobileChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ available: boolean; message?: string; code?: string }>
        >("/auth/signup/mobile-check", { params: { mobile: phone } });
        if (cancelled) return;
        if (!data.success) throw new Error(data.message);
        if (data.data.available === false) {
          setMobileError(
            data.data.message || "This mobile number is already registered. Please log in instead.",
          );
        } else {
          setMobileError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = extractApiError(err, "");
        if (/already registered/i.test(msg)) {
          setMobileError(msg);
        } else if (/too many requests/i.test(msg)) {
          setMobileError("Too many checks — wait a moment, then continue typing");
        }
        // Network / unknown: keep quiet; Send OTP still re-validates.
      } finally {
        if (!cancelled) setMobileChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.mobile, draftReady, stepIndex, otpSent, loggedInContinue, user?.mobile]);

  useEffect(() => {
    if (!draft.latitude || !draft.longitude || locationLabel) return;
    let cancelled = false;
    void reverseGeocodeAddress(Number(draft.latitude), Number(draft.longitude)).then((label) => {
      if (!cancelled && label) setLocationLabel(label);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.latitude, draft.longitude, locationLabel]);

  useEffect(() => {
    if (!needsUpline) {
      setSponsor(null);
      setSponsorStatus("idle");
      return;
    }
    const phone = draft.sponsorMobile.replace(/\D/g, "").slice(0, 10);
    setSponsor(null);
    if (phone.length !== 10) {
      setSponsorStatus("idle");
      return;
    }
    let cancelled = false;
    setSponsorStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<ApiResponse<{ items: SponsorInfo[] }>>("/auth/sponsor/search", {
          params: { mobile: phone, role: sponsorRole },
        });
        if (cancelled) return;
        if (!data.success) throw new Error(data.message);
        const match = (data.data.items ?? []).find((i) => i.mobile === phone) ?? data.data.items?.[0];
        if (!match) {
          setSponsorStatus("empty");
          return;
        }
        setSponsor(match);
        patch({ sponsorUid: match.uid, sponsorName: match.name });
        setSponsorStatus("ok");
      } catch {
        if (!cancelled) setSponsorStatus("error");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.sponsorMobile, draft.role, needsUpline, sponsorRole]);

  useEffect(() => {
    const pin = draft.pincode;
    if (pin.length !== 6) return;
    let cancelled = false;
    setPinBusy(true);
    void lookupIndianPincode(pin)
      .then((place) => {
        if (cancelled || !place) return;
        patch({
          city: place.city || draft.city,
          district: place.district || draft.district,
          state: place.state || draft.state,
        });
      })
      .finally(() => {
        if (!cancelled) setPinBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pincode]);

  // Prefill business address from residential when opening Business step (if empty).
  useEffect(() => {
    if (stepIndex !== 5) return;
    setDraft((d) => {
      if (d.businessAddress.trim() || !d.address.trim()) return d;
      return {
        ...d,
        businessAddress: d.address.trim(),
        businessPincode: d.pincode || d.businessPincode,
        businessCity: d.city.trim() || d.businessCity,
        businessDistrict: d.district.trim() || d.businessDistrict,
        businessState: d.state.trim() || d.businessState,
      };
    });
  }, [stepIndex]);

  useEffect(() => {
    const pin = draft.businessPincode;
    if (pin.length !== 6) return;
    let cancelled = false;
    setBizPinBusy(true);
    void lookupIndianPincode(pin)
      .then((place) => {
        if (cancelled || !place) return;
        patch({
          businessCity: place.city || draft.businessCity,
          businessDistrict: place.district || draft.businessDistrict,
          businessState: place.state || draft.businessState,
        });
      })
      .finally(() => {
        if (!cancelled) setBizPinBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.businessPincode]);

  async function pickFile(
    key: keyof Pick<
      SignupDraft,
      "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque" | "shopPhoto" | "personalPhoto"
    >,
    file: File,
    geo?: { latitude: string; longitude: string },
  ) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mimeOk = /^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/i.test(file.type);
    const extOk = ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext);
    // Some mobile browsers send an empty MIME type — fall back to extension.
    if (!(mimeOk || (!file.type && extOk))) {
      toast.error("Upload JPG, PNG, WEBP, HEIC, or PDF only");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2 MB");
      return;
    }
    const meta = await fileMeta(file, geo);
    patch({ [key]: meta });
    setStepErrorKey(null);
    if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) {
      const url = URL.createObjectURL(file);
      setPreviews((p) => {
        if (p[key]) URL.revokeObjectURL(p[key]);
        return { ...p, [key]: url };
      });
    }
    if (isDocCheckSlot(key)) {
      void runDocCheck(key, meta.dataUrl);
      if (meta.dataUrl && accessToken) return;
    }
    toast.success(
      geo
        ? `${file.name} captured · ${Number(geo.latitude).toFixed(5)}, ${Number(geo.longitude).toFixed(5)}`
        : meta.dataUrl
          ? `${file.name} ready for KYC submit`
          : `${file.name} selected`,
    );
  }

  async function captureLivePhoto(
    key: "personalPhoto" | "shopPhoto",
    file: File,
  ) {
    setPhotoCaptureBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeOk = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.type);
      const extOk = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
      if (!(mimeOk || (!file.type && extOk))) {
        toast.error("Live capture must be a photo (JPG, PNG, WEBP, or HEIC)");
        return;
      }
      let geo = {
        latitude: draft.latitude,
        longitude: draft.longitude,
      };
      try {
        const coords = await requestBrowserLocation();
        geo = { latitude: coords.latitude, longitude: coords.longitude };
        patch({ latitude: coords.latitude, longitude: coords.longitude });
      } catch {
        /* fall back to signup location if already set */
      }
      if (!geo.latitude || !geo.longitude) {
        toast.error("Allow location access to geotag this photo");
        setShowLocationModal(true);
        return;
      }
      pickFile(key, file, geo);
    } finally {
      setPhotoCaptureBusy(false);
    }
  }

  function clearFile(
    key: keyof Pick<
      SignupDraft,
      "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque" | "shopPhoto" | "personalPhoto"
    >,
    opts?: { keepCheck?: boolean },
  ) {
    patch({ [key]: null });
    setPreviews((p) => {
      if (p[key]) URL.revokeObjectURL(p[key]);
      const next = { ...p };
      delete next[key];
      return next;
    });
    if (isDocCheckSlot(key) && !opts?.keepCheck) {
      docCheckSeqRef.current[key] = (docCheckSeqRef.current[key] ?? 0) + 1;
      setDocChecks((c) => {
        const next = { ...c };
        delete next[key];
        return next;
      });
    }
  }

  function isDocCheckSlot(key: string): key is KycDocCheckSlot {
    return key === "panImage" || key === "aadhaarFront" || key === "aadhaarBack";
  }

  /** Check a PAN / Aadhaar photo on the server. `fail` clears the photo; `flag` keeps it. */
  async function runDocCheck(slot: KycDocCheckSlot, dataUrl: string | undefined) {
    const seq = (docCheckSeqRef.current[slot] ?? 0) + 1;
    docCheckSeqRef.current[slot] = seq;
    if (!dataUrl || !accessToken) {
      setDocChecks((c) => {
        const next = { ...c };
        delete next[slot];
        return next;
      });
      return;
    }
    setDocChecks((c) => ({ ...c, [slot]: { state: "checking" } }));
    let result: KycDocCheckResult | null = null;
    try {
      const { data } = await api.post<ApiResponse<KycDocCheckResult>>(
        "/kyc/documents/check",
        { slot, dataUrl },
        { timeout: 20_000 },
      );
      if (data.success) result = data.data;
    } catch {
      result = null;
    }
    if (docCheckSeqRef.current[slot] !== seq) return;
    const ui = kycDocCheckToUi(slot, result);
    setDocChecks((c) => ({ ...c, [slot]: ui }));
    if (ui.state === "fail") clearFile(slot, { keepCheck: true });
  }

  function validateStep(): string | null {
    if (stepIndex === 0) {
      if (!draft.latitude || !draft.longitude) return "Allow location access before continuing";
      if (draft.mobile.replace(/\D/g, "").length !== 10) return "Enter a valid 10-digit mobile";
      if (!draft.termsAccepted) return "Please accept Terms and Conditions";
    }
    if (stepIndex === 1) {
      if (draft.name.trim().length < 2) return "Full name is required";
      // Account already exists (Continue KYC) — password / upline already set.
      if (!(draft.accountCreated || loggedInContinue)) {
        if (!draft.password || draft.password.length < 8) return "Password must be at least 8 characters";
        if (!/[A-Za-z]/.test(draft.password)) return "Password must contain a letter";
        if (!/\d/.test(draft.password)) return "Password must contain a number";
        if (needsUpline && !sponsor) {
          return "Distributor / Super Distributor not found for this mobile. Use an active upline number.";
        }
      }
    }
    if (stepIndex === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan)) return PAN_FORMAT_ERROR;
      if (!draft.panVerified) return "Verify PAN before continuing";
      if (!draft.gender) return "Select gender";
      if (!draft.dob) return "Date of birth is required";
      if (!draft.fatherName.trim()) return "Father name is required";
    }
    if (stepIndex === 3) {
      if (draft.aadhaar.replace(/\D/g, "").length !== 12) return "Enter a valid 12-digit Aadhaar";
      if (!draft.aadhaarOtpVerified) return "Verify Aadhaar OTP before continuing";
    }
    if (stepIndex === 4) {
      if (!draft.email.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return "Enter a valid email address";
      if (!user?.emailVerifiedAt || (user.email ?? "").toLowerCase() !== draft.email.trim().toLowerCase()) {
        return "Verify your email before continuing";
      }
      if (!draft.address.trim()) return "Address is required";
      if (draft.pincode.length !== 6) return "Enter a valid pincode";
      if (!draft.city.trim()) return "City is required";
      if (!draft.district.trim()) return "District is required";
      if (!draft.state.trim()) return "State is required";
    }
    if (stepIndex === 5) {
      if (!draft.businessName.trim()) return "Business name is required";
      if (!draft.businessType) return "Business type is required";
      if (!draft.businessCategory) return "Business category is required";
      if (!draft.monthlyTurnover) return "Monthly turnover is required";
      if (!draft.businessProof) return "Business proof is required";
      if (!draft.businessAddress.trim()) return "Business address is required";
      if (draft.businessPincode.length !== 6) return "Enter business pincode";
      if (!draft.businessCity.trim()) return "Business city is required";
      if (!draft.businessDistrict.trim()) return "Business district is required";
      if (!draft.businessState.trim()) return "Business state is required";
    }
    if (stepIndex === 6) {
      if (draft.ifsc.length !== 11) return "Enter a valid IFSC";
      if (!draft.bankName.trim()) return "Bank name is required";
      if (!draft.accountNumber.trim()) return "Account number is required";
      if (draft.accountNumber !== draft.accountNumberConfirm) return "Account numbers do not match";
      if (!draft.accountName.trim()) return "Account holder name is required";
    }
    if (stepIndex === 7) {
      if (!draft.personalPhoto) return "Personal photo is required — use live camera capture";
      if (!draft.personalPhoto.latitude || !draft.personalPhoto.longitude) {
        return "Personal photo must include location. Retake with location allowed.";
      }
      if (!draft.shopPhoto) return "Shop photo is required — use live camera capture";
      if (!draft.shopPhoto.latitude || !draft.shopPhoto.longitude) {
        return "Shop photo must include location. Retake with location allowed.";
      }
    }
    if (stepIndex === 8) {
      if (!draft.agreementAccepted) return "Please accept the agent agreement";
    }
    return null;
  }

  async function requestOtp() {
    setLoading(true);
    setMobileError(null);
    try {
      if (!draft.latitude || !draft.longitude) {
        toast.error("Allow location access before continuing");
        setShowLocationModal(true);
        return;
      }
      const { data } = await api.post<ApiResponse<{ otp?: string; message: string }>>("/auth/signup/request", {
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      if (!data.success) throw new Error(data.message);
      setDevOtp(data.data.otp ?? null);
      setOtpSent(true);
      setOtp("");
      patch({ signupToken: "" });
      toast.success(
        data.data.otp
          ? `Dev OTP: ${data.data.otp}`
          : data.data.message || data.message || "OTP has been sent on WhatsApp",
      );
    } catch (err) {
      const msg = extractApiError(err, "Could not send OTP");
      setMobileError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: FormEvent) {
    e?.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ signupToken: string; message: string }>>(
        "/auth/signup/verify",
        {
          mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
          otp,
          portal: "agent",
        },
      );
      if (!data.success) throw new Error(data.message);
      patch({ signupToken: data.data.signupToken, stepIndex: 1 });
      setOtpSent(false);
      setOtp("");
      setDevOtp(null);
      toast.success(data.data.message || "Mobile verified — continue");
    } catch (err) {
      toast.error(extractApiError(err, "Incorrect OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function continueKycFromRoleStep() {
    if (draft.name.trim().length < 2) {
      toast.error("Full name is required");
      return;
    }
    setLoading(true);
    try {
      if (accessToken) {
        const { data } = await api.patch<ApiResponse<{ user: AuthUser }>>("/auth/profile/pre-kyc", {
          name: draft.name.trim(),
        });
        if (!data.success) throw new Error(data.message);
        if (data.data?.user) {
          useAuthStore.getState().setUser(data.data.user);
        }
      }
      patch({
        accountCreated: true,
        signupToken: "",
        // After editing Role/Name, return to furthest KYC step (not always PAN).
        stepIndex: Math.max(2, draft.maxStepReached ?? 2),
      });
    } catch (err) {
      toast.error(extractApiError(err, "Could not save name"));
    } finally {
      setLoading(false);
    }
  }

  async function completeAccount() {
    // Already logged in / account exists — never bounce back to mobile OTP.
    if (loggedInContinue || draft.accountCreated || accessToken) {
      await continueKycFromRoleStep();
      return;
    }
    if (!draft.signupToken) {
      toast.error("Verify mobile OTP before continuing");
      patch({ stepIndex: 0 });
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<SessionData | { pendingApproval: true; user: AuthUser; message: string }>
      >("/auth/signup/complete", {
        signupToken: draft.signupToken,
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        role: draft.role,
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
        acceptedPolicyVersion: SIGNUP_POLICY_VERSION,
        policyChannel: "web",
        ...(sponsor ? { sponsorUid: sponsor.uid } : {}),
        ...(invite ? { inviteToken } : {}),
        ...(draft.password ? { password: draft.password } : {}),
      });
      if (!data.success) throw new Error(data.message);
      if ("pendingApproval" in data.data && data.data.pendingApproval) {
        toast.success(data.data.message);
        clearSignupDraft(storageKey);
        router.replace("/login");
        return;
      }
      const session = data.data as SessionData;
      setAuth(session.user, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      const nextDraft = {
        ...draft,
        accountCreated: true,
        signupToken: "",
        stepIndex: 2,
        maxStepReached: Math.max(draft.maxStepReached ?? 0, 2),
      };
      setDraft(nextDraft);
      saveSignupDraft(session.user.id, nextDraft);
      clearSignupDraft(draft.mobile.replace(/\D/g, ""));
      toast.success("Account created — continue onboarding");
    } catch (err) {
      toast.error(extractApiError(err, "Could not create account"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchAddressFromLocation(target: "home" | "business" = "home") {
    setAddressFetchBusy(true);
    try {
      let lat = draft.latitude;
      let lng = draft.longitude;
      if (!lat || !lng) {
        const coords = await requestBrowserLocation();
        lat = coords.latitude;
        lng = coords.longitude;
        patch({ latitude: lat, longitude: lng });
      }
      const details = await reverseGeocodeDetails(Number(lat), Number(lng));
      if (!details) {
        toast.error("Could not fetch address from location. Enter address manually.");
        return;
      }
      setLocationLabel(details.displayName);
      let city = details.city;
      let district = details.district;
      let state = details.state;
      if (details.pincode.length === 6) {
        const place = await lookupIndianPincode(details.pincode);
        if (place) {
          city = place.city || city;
          district = place.district || district;
          state = place.state || state;
        }
      }
      if (target === "business") {
        patch({
          businessAddress: details.addressLine || draft.businessAddress,
          businessPincode: details.pincode || draft.businessPincode,
          businessCity: city || draft.businessCity,
          businessDistrict: district || draft.businessDistrict,
          businessState: state || draft.businessState,
        });
      } else {
        patch({
          address: details.addressLine || draft.address,
          pincode: details.pincode || draft.pincode,
          city: city || draft.city,
          district: district || draft.district,
          state: state || draft.state,
        });
      }
      toast.success("Address filled from location");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Allow location to fetch address");
    } finally {
      setAddressFetchBusy(false);
    }
  }

  function useResidentialForBusiness() {
    if (!draft.address.trim()) {
      toast.error("No residential address yet. Fetch or enter it on the Details step first.");
      return;
    }
    patch({
      businessAddress: draft.address.trim(),
      businessPincode: draft.pincode,
      businessCity: draft.city.trim(),
      businessDistrict: draft.district.trim(),
      businessState: draft.state.trim(),
    });
    toast.success("Business address copied from residential");
  }

  async function verifyPan(opts?: { manual?: boolean }) {
    const pan = draft.pan.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const manual = Boolean(opts?.manual);
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      if (manual) toast.error("Enter a valid PAN (e.g. ABCDE1234F)");
      return;
    }
    if (!accessToken) {
      if (manual) toast.error("Create your account on the previous step first");
      return;
    }
    if (draft.panVerified || panVerifyBusy) return;
    setPanVerifyBusy(true);
    setPanVerifyFailed(false);
    try {
      const { data } = await api.post<
        ApiResponse<{
          verified: boolean;
          pan: string;
          fullName: string | null;
          address: string | null;
          category: string | null;
        }>
      >("/kyc/pan/verify", { panNumber: pan });
      if (!data.success) throw new Error(data.message);
      patch({
        pan: data.data.pan || pan,
        panVerified: true,
        panVerifiedName: data.data.fullName ?? "",
        ...(data.data.fullName && !draft.name.trim() ? { name: data.data.fullName } : {}),
        ...(data.data.address && !draft.address.trim() ? { address: data.data.address } : {}),
      });
      toast.success(
        data.data.fullName ? `PAN verified · ${data.data.fullName}` : "PAN verified",
      );
    } catch (err) {
      setPanVerifyFailed(true);
      toast.error(extractApiError(err, "Could not verify PAN. Check the PAN number and try again."));
    } finally {
      setPanVerifyBusy(false);
    }
  }

  // Auto-verify when 10-char PAN is complete (debounce; one attempt per PAN until edited).
  useEffect(() => {
    if (stepIndex !== 2) return;
    if (draft.panVerified || panVerifyBusy) return;
    if (!accessToken) return;
    const pan = draft.pan.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
      if (pan.length < 10) panAutoAttemptRef.current = "";
      return;
    }
    if (panAutoAttemptRef.current === pan) return;
    const timer = window.setTimeout(() => {
      panAutoAttemptRef.current = pan;
      void verifyPan({ manual: false });
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verifyPan closes over latest draft
  }, [stepIndex, draft.pan, draft.panVerified, accessToken, panVerifyBusy]);

  async function sendAadhaarOtp() {
    const digits = draft.aadhaar.replace(/\D/g, "");
    if (digits.length !== 12) {
      toast.error("Enter a valid 12-digit Aadhaar");
      return;
    }
    if (!accessToken) {
      toast.error("Create your account on the previous step first");
      return;
    }
    setAadhaarOtpBusy("send");
    try {
      const { data } = await api.post<ApiResponse<{ requestId: string; message?: string }>>(
        "/kyc/aadhaar/otp/request",
        { aadhaarNumber: digits },
        { timeout: AADHAAR_OTP_TIMEOUT_MS },
      );
      if (!data.success) throw new Error(data.message);
      patch({
        aadhaarOtpRequestId: data.data.requestId,
        aadhaarOtpVerified: false,
        aadhaarVerifiedName: "",
      });
      setAadhaarOtp("");
      toast.success(data.message || data.data.message || "OTP sent to the mobile registered with this Aadhaar");
    } catch (err) {
      toast.error(extractApiError(err, "Could not send Aadhaar OTP"));
    } finally {
      setAadhaarOtpBusy(null);
    }
  }

  async function verifyAadhaarOtp() {
    if (!draft.aadhaarOtpRequestId) {
      toast.error("Tap Send OTP first");
      return;
    }
    if (aadhaarOtp.replace(/\D/g, "").length < 4) {
      toast.error("Enter the Aadhaar OTP");
      return;
    }
    setAadhaarOtpBusy("verify");
    try {
      const { data } = await api.post<
        ApiResponse<{ verified: boolean; fullName: string | null; address: string | null }>
      >(
        "/kyc/aadhaar/otp/verify",
        {
          otp: aadhaarOtp.replace(/\D/g, ""),
          requestId: draft.aadhaarOtpRequestId,
        },
        { timeout: AADHAAR_OTP_TIMEOUT_MS },
      );
      if (!data.success) throw new Error(data.message);
      patch({
        aadhaarOtpVerified: true,
        aadhaarVerifiedName: data.data.fullName ?? "",
        ...(data.data.address && !draft.address.trim() ? { address: data.data.address } : {}),
      });
      toast.success("Aadhaar verified");
    } catch (err) {
      toast.error(extractApiError(err, "Incorrect Aadhaar OTP. Check the code and try again."));
    } finally {
      setAadhaarOtpBusy(null);
    }
  }

  async function finalSubmit() {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/kyc/submit", {
        fullName: draft.name.trim(),
        panNumber: draft.pan.toUpperCase(),
        aadhaarNumber: draft.aadhaar.replace(/\D/g, ""),
        email: draft.email.trim().toLowerCase(),
        address: draft.address.trim(),
        city: draft.city.trim(),
        pincode: draft.pincode,
        bankAccountName: draft.accountName.trim(),
        bankAccountNumber: draft.accountNumber,
        bankIfsc: draft.ifsc.toUpperCase(),
        bankName: draft.bankName.trim(),
        cancelledChequeFileName: draft.cancelledCheque?.name,
        gender: draft.gender,
        fatherName: draft.fatherName.trim(),
        dob: draft.dob,
        anniversaryDate: draft.anniversaryDate || undefined,
        district: draft.district.trim(),
        state: draft.state.trim(),
        businessName: draft.businessName.trim(),
        businessType: draft.businessType,
        businessCategory: draft.businessCategory,
        monthlyTurnover: draft.monthlyTurnover,
        businessProof: draft.businessProof,
        businessAddress: draft.businessAddress.trim(),
        businessPincode: draft.businessPincode,
        businessDistrict: draft.businessDistrict.trim(),
        businessState: draft.businessState.trim(),
        bankBranch: draft.bankBranch.trim() || undefined,
        panImageFileName: draft.panImage?.name,
        aadhaarFrontFileName: draft.aadhaarFront?.name,
        aadhaarBackFileName: draft.aadhaarBack?.name,
        personalPhotoFileName: draft.personalPhoto?.name,
        shopPhotoFileName: draft.shopPhoto?.name,
        panImageDataUrl: draft.panImage?.dataUrl,
        aadhaarFrontDataUrl: draft.aadhaarFront?.dataUrl,
        aadhaarBackDataUrl: draft.aadhaarBack?.dataUrl,
        cancelledChequeDataUrl: draft.cancelledCheque?.dataUrl,
        personalPhotoDataUrl: draft.personalPhoto?.dataUrl,
        shopPhotoDataUrl: draft.shopPhoto?.dataUrl,
        personalPhotoLatitude: draft.personalPhoto?.latitude,
        personalPhotoLongitude: draft.personalPhoto?.longitude,
        shopPhotoLatitude: draft.shopPhoto?.latitude,
        shopPhotoLongitude: draft.shopPhoto?.longitude,
        latitude: draft.shopPhoto?.latitude || draft.latitude || undefined,
        longitude: draft.shopPhoto?.longitude || draft.longitude || undefined,
      });
      if (!data.success) throw new Error(data.message);
      useAuthStore.getState().setUser(data.data.user);
      clearSignupDraft(user?.id || storageKey);
      toast.success("Onboarding submitted — awaiting approval");
      const fromSettings =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("from") === "settings";
      router.replace(fromSettings ? "/settings?tab=profile" : "/dashboard");
    } catch (err) {
      toast.error(extractApiError(err, "Submit failed"));
    } finally {
      setLoading(false);
    }
  }

  function next() {
    const err = validateStep();
    if (err) {
      toast.error(err);
      if (err.toLowerCase().includes("pan card image")) setStepErrorKey("panImage");
      else if (err.toLowerCase().includes("aadhaar front")) setStepErrorKey("aadhaarFront");
      else if (err.toLowerCase().includes("aadhaar back")) setStepErrorKey("aadhaarBack");
      else if (err.toLowerCase().includes("cheque")) setStepErrorKey("cancelledCheque");
      else if (err.toLowerCase().includes("personal photo")) setStepErrorKey("personalPhoto");
      else if (err.toLowerCase().includes("shop photo")) setStepErrorKey("shopPhoto");
      else setStepErrorKey(null);
      return;
    }
    setStepErrorKey(null);
    if (stepIndex === 0) {
      if (mobileError) {
        toast.error(mobileError);
        return;
      }
      if (loggedInContinue && canEditIdentity) {
        const phone = draft.mobile.replace(/\D/g, "").slice(0, 10);
        const current = (user?.mobile || "").replace(/\D/g, "").slice(0, 10);
        if (phone === current) {
          patch({ stepIndex: 1 });
          return;
        }
        if (!otpSent) {
          void (async () => {
            setLoading(true);
            try {
              const { data } = await api.post<ApiResponse<{ otp?: string; message?: string }>>(
                "/auth/profile/pre-kyc/mobile/otp",
                {
                  mobile: phone,
                  latitude: draft.latitude || undefined,
                  longitude: draft.longitude || undefined,
                },
              );
              if (!data.success) throw new Error(data.message);
              setOtpSent(true);
              if (data.data?.otp) setDevOtp(data.data.otp);
              toast.success(data.message || "OTP sent to the new mobile number");
            } catch (err) {
              toast.error(extractApiError(err, "Could not send OTP"));
            } finally {
              setLoading(false);
            }
          })();
          return;
        }
        void (async () => {
          setLoading(true);
          try {
            const { data } = await api.post<ApiResponse<{ user: AuthUser }>>(
              "/auth/profile/pre-kyc/mobile/confirm",
              { mobile: phone, otp },
            );
            if (!data.success) throw new Error(data.message);
            if (data.data?.user) useAuthStore.getState().setUser(data.data.user);
            setOtpSent(false);
            setOtp("");
            setDevOtp(null);
            patch({ stepIndex: 1 });
            toast.success("Mobile number updated");
          } catch (err) {
            toast.error(extractApiError(err, "Incorrect OTP"));
          } finally {
            setLoading(false);
          }
        })();
        return;
      }
      if (!otpSent) {
        void requestOtp();
        return;
      }
      void verifyOtp();
      return;
    }
    if (stepIndex === 1) {
      if (draft.accountCreated || loggedInContinue || accessToken) {
        void continueKycFromRoleStep();
        return;
      }
      void completeAccount();
      return;
    }
    if (stepIndex === 8) {
      void finalSubmit();
      return;
    }
    patch({ stepIndex: Math.min(stepIndex + 1, 8) });
  }

  function back() {
    if (stepIndex === 0 && otpSent) {
      setOtpSent(false);
      setOtp("");
      setDevOtp(null);
      return;
    }
    if (stepIndex === 0) {
      if (loggedInContinue) {
        router.push(searchParams.get("from") === "settings" ? "/settings?tab=profile" : "/dashboard");
        return;
      }
      router.push("/login");
      return;
    }
    // Until KYC is submitted, allow revisiting every prior step to edit.
    patch({ stepIndex: Math.max(stepIndex - 1, 0) });
  }

  if (!draftReady) return null;

  const subtitle = SIGNUP_STEPS[stepIndex]?.label ?? "Sign Up";
  const primaryLabel =
    loading
      ? "Please wait…"
      : stepIndex === 0
        ? otpSent
          ? "Verify OTP"
          : "Send OTP"
        : stepIndex === 1
          ? draft.accountCreated || loggedInContinue
            ? "Continue"
            : "Create account"
          : stepIndex === 8
            ? "Submit"
            : "Continue";

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-8" style={{ background: B.bg }}>
      <div
        className="mx-auto w-full max-w-2xl rounded-3xl border bg-white p-6 shadow-xl sm:p-8"
        style={{ borderColor: B.border }}
      >
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: B.border, color: B.blue }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight" style={{ color: B.blue }}>
              Sign Up
            </h1>
            <p className="text-sm leading-tight" style={{ color: B.muted }}>
              {subtitle}
            </p>
          </div>
          <div className="shrink-0">
            <AsanPayLockup width={112} light={false} animate showTagline={false} />
          </div>
        </div>

        <SignupStepper currentIndex={stepIndex} />

        <div className="space-y-4">
            {stepIndex === 0 && (
              <>
                {!hasLocation ? (
                  <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    Location must be allowed before you enter your mobile number.
                  </p>
                ) : (
                  <p className="rounded-xl px-3 py-2 text-xs" style={{ background: `${B.green}12`, color: B.greenDark }}>
                    {locationLabel
                      ? `Location captured · ${locationLabel}`
                      : "Location captured · resolving address…"}
                  </p>
                )}
                {invite ? (
                  <p className="rounded-xl px-3 py-2 text-xs" style={{ background: B.secondary, color: B.blue }}>
                    Invited by <strong>{invite.sponsor.name}</strong> to join as{" "}
                    <strong>{invite.role === "distributor" ? "Distributor" : "Retailer"}</strong>. Mobile is fixed to
                    the number in your invite.
                  </p>
                ) : null}
                <Field label="Mobile Number *">
                  <input
                    value={draft.mobile}
                    onChange={(e) => {
                      if (!canEditIdentity || invite) return;
                      patch({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10), signupToken: "" });
                      setOtpSent(false);
                      setOtp("");
                      setDevOtp(null);
                      setMobileError(null);
                    }}
                    className={inputCls}
                    style={{
                      ...inputStyle,
                      opacity: hasLocation || loggedInContinue ? 1 : 0.55,
                      borderColor: mobileError ? "#DC2626" : undefined,
                    }}
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    disabled={!hasLocation || otpSent || !canEditIdentity}
                    readOnly={!canEditIdentity || Boolean(invite)}
                  />
                </Field>
                {loggedInContinue && canEditIdentity ? (
                  <p className="text-xs" style={{ color: B.muted }}>
                    You can change mobile until KYC is submitted. Changing it requires OTP on the new number.
                  </p>
                ) : null}
                {loggedInContinue && !canEditIdentity ? (
                  <p className="text-xs" style={{ color: B.muted }}>
                    Signed-in mobile is locked after KYC submit.
                  </p>
                ) : null}
                {mobileChecking && !mobileError ? (
                  <p className="text-xs" style={{ color: B.muted }}>
                    Checking if this mobile is available…
                  </p>
                ) : null}
                {mobileError ? (
                  <p className="text-xs font-semibold" style={{ color: "#DC2626" }}>
                    {mobileError}
                  </p>
                ) : null}
                <p className="text-xs" style={{ color: B.muted }}>
                  *Enter number which is linked to your Aadhaar.
                </p>
                {otpSent ? (
                  <>
                    <p className="text-xs" style={{ color: B.muted }}>
                      Enter the 6-digit OTP. If fixed signup OTP is enabled, use that code (e.g. 242424).
                    </p>
                    {devOtp ? (
                      <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: `${B.blue}12`, color: B.blue }}>
                        Dev OTP: {devOtp}
                      </p>
                    ) : null}
                    <Field label="OTP *">
                      <input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className={`${inputCls} font-mono tracking-widest`}
                        style={inputStyle}
                        inputMode="numeric"
                        placeholder="••••••"
                        autoFocus
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => void requestOtp()}
                      className="text-xs font-semibold underline"
                      style={{ color: B.blue }}
                      disabled={loading}
                    >
                      Resend OTP
                    </button>
                  </>
                ) : null}
                <label className="flex items-start gap-2 text-sm" style={{ color: B.blue }}>
                  <input
                    type="checkbox"
                    checked={draft.termsAccepted}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (!hasLocation) {
                          setShowLocationModal(true);
                          void ensureLocation();
                          return;
                        }
                        setShowTermsModal(true);
                        return;
                      }
                      patch({ termsAccepted: false });
                    }}
                    className="mt-1"
                    disabled={otpSent}
                  />
                  <span>
                    I have read and agree to the{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      style={{ color: B.blue }}
                      onClick={() => {
                        if (!hasLocation) {
                          setShowLocationModal(true);
                          void ensureLocation();
                          return;
                        }
                        setShowTermsModal(true);
                      }}
                    >
                      Terms &amp; Conditions and Privacy Policy
                    </button>
                  </span>
                </label>
                {!otpSent ? (
                  <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: `${B.green}40`, background: `${B.green}10`, color: B.greenDark }}>
                    <p className="mb-2 font-bold">Before you begin, keep these ready:</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      <li>Business Document (any one)</li>
                      <li>Aadhaar Card (soft copy)</li>
                      <li>PAN Card (soft copy)</li>
                      <li>Photo of your Shop</li>
                    </ul>
                    <p className="mt-3 text-xs" style={{ color: B.muted }}>
                      You can start now and resume later from where you left off.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {stepIndex === 1 && (
              <>
                <Field label="Role *">
                  <select
                    value={draft.role}
                    onChange={(e) =>
                      patch({
                        role: e.target.value as SignupRole,
                        sponsorMobile: "",
                        sponsorUid: "",
                        sponsorName: "",
                      })
                    }
                    className={inputCls}
                    style={inputStyle}
                    disabled={draft.accountCreated || loggedInContinue || Boolean(invite)}
                  >
                    {ROLE_OPTIONS.filter(
                      (r) =>
                        draft.accountCreated ||
                        loggedInContinue ||
                        (invite ? r.value === invite.role : !isPartnerRole(r.value)),
                    ).map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Full Name *">
                  <input
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="As per PAN"
                  />
                </Field>
                {needsUpline ? (
                  <Field label={`${UPLINE_LABEL[draft.role as "retailer" | "distributor"]} *`}>
                    <input
                      value={draft.sponsorMobile}
                      onChange={(e) => {
                        if (draft.accountCreated || loggedInContinue || invite) return;
                        patch({
                          sponsorMobile: e.target.value.replace(/\D/g, "").slice(0, 10),
                        });
                      }}
                      className={inputCls}
                      style={inputStyle}
                      inputMode="numeric"
                      readOnly={draft.accountCreated || loggedInContinue || Boolean(invite)}
                      disabled={draft.accountCreated || loggedInContinue || Boolean(invite)}
                      placeholder="10-digit upline mobile"
                    />
                    {(sponsorStatus === "ok" && sponsor) ||
                    ((draft.accountCreated || loggedInContinue) && draft.sponsorName) ? (
                      <p className="mt-1 text-xs font-semibold" style={{ color: B.green }}>
                        <CheckCircle2 size={12} className="mr-1 inline" />
                        {sponsor?.name || draft.sponsorName}
                        {draft.sponsorUid ? ` · ${draft.sponsorUid}` : ""}
                      </p>
                    ) : null}
                    {draft.accountCreated || loggedInContinue ? (
                      <p className="mt-1 text-xs" style={{ color: B.muted }}>
                        Upline is locked after account create.
                      </p>
                    ) : null}
                    {!(draft.accountCreated || loggedInContinue) && sponsorStatus === "loading" ? (
                      <p className="mt-1 text-xs" style={{ color: B.muted }}>
                        Checking upline…
                      </p>
                    ) : null}
                    {!(draft.accountCreated || loggedInContinue) &&
                    (sponsorStatus === "empty" || sponsorStatus === "error") ? (
                      <p className="mt-1 text-xs" style={{ color: "#B91C1C" }}>
                        {draft.role === "retailer"
                          ? "No active Distributor found for this mobile. Check the number, or choose Direct Retailer if you have no Distributor."
                          : "No active Super Distributor found for this mobile. Check the number with your Super Distributor."}
                      </p>
                    ) : null}
                    {!(draft.accountCreated || loggedInContinue) &&
                    sponsorStatus === "idle" &&
                    draft.sponsorMobile.length > 0 ? (
                      <p className="mt-1 text-xs" style={{ color: B.muted }}>
                        Enter a valid 10-digit upline mobile
                      </p>
                    ) : null}
                  </Field>
                ) : draft.role === "super_distributor" || draft.role === "direct_retailer" ? (
                  <p className="rounded-xl px-3 py-2 text-xs" style={{ background: B.secondary, color: B.muted }}>
                    No upline required for this role.
                  </p>
                ) : null}
                <Field label={draft.accountCreated || loggedInContinue ? "Password" : "Password *"}>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={draft.accountCreated || loggedInContinue ? "********" : draft.password}
                      onChange={(e) => {
                        if (draft.accountCreated || loggedInContinue) return;
                        patch({ password: e.target.value });
                      }}
                      className={`${inputCls} pr-12`}
                      style={inputStyle}
                      placeholder="e.g. Test1234"
                      autoComplete="new-password"
                      readOnly={draft.accountCreated || loggedInContinue}
                      disabled={draft.accountCreated || loggedInContinue}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="icon-tooltip absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1"
                      style={{ color: B.muted }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      data-tooltip={showPassword ? "Hide password" : "Show password"}
                      disabled={draft.accountCreated || loggedInContinue}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: B.muted }}>
                    {draft.accountCreated || loggedInContinue
                      ? "Password already set for this account. Change it later from Settings → Security."
                      : "Min 8 characters · include a letter and a number (e.g. Test1234)"}
                  </p>
                </Field>
              </>
            )}

            {stepIndex === 2 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Step 3 of 9 · PAN Details
                </p>
                <p className="text-xs" style={{ color: B.muted }}>
                  Enter your 10-character PAN — verification starts automatically. Then fill personal
                  details as on the PAN.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="PAN Number *">
                    <input
                      value={draft.pan}
                      onChange={(e) => {
                        const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
                        if (next !== panAutoAttemptRef.current) panAutoAttemptRef.current = "";
                        setPanVerifyFailed(false);
                        patch({
                          pan: next,
                          ...(draft.panVerified
                            ? { panVerified: false, panVerifiedName: "" }
                            : {}),
                        });
                      }}
                      className={`${inputCls} font-mono`}
                      style={inputStyle}
                      placeholder="ABCDE1234F"
                      disabled={draft.panVerified}
                    />
                    {draft.panVerified ? (
                      <p
                        className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold leading-snug"
                        style={{ color: "#166534" }}
                      >
                        <CheckCircle2 size={12} className="shrink-0" strokeWidth={2.5} />
                        <span>
                          PAN verified
                          {draft.panVerifiedName ? ` · ${draft.panVerifiedName}` : ""}
                        </span>
                      </p>
                    ) : panVerifyBusy ? (
                      <p className="mt-1.5 text-[11px] font-medium" style={{ color: B.blue }}>
                        Verifying PAN…
                      </p>
                    ) : (
                      <div className="mt-1.5 space-y-1">
                        {draft.pan.length === 10 && !/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan) ? (
                          <p className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>
                            {PAN_FORMAT_ERROR}
                          </p>
                        ) : null}
                        {panVerifyFailed &&
                        /^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan) &&
                        accessToken ? (
                          <PrimaryButton
                            type="button"
                            variant="primary"
                            size="sm"
                            showArrow={false}
                            onClick={() => {
                              panAutoAttemptRef.current = "";
                              void verifyPan({ manual: true });
                            }}
                            className="!w-auto"
                          >
                            Retry verify
                          </PrimaryButton>
                        ) : accessToken ? (
                          <p className="text-[11px]" style={{ color: B.muted }}>
                            Verification runs when PAN is complete
                          </p>
                        ) : null}
                        {!accessToken ? (
                          <p className="text-[11px] font-semibold" style={{ color: "#C2410C" }}>
                            Create your account on the previous step first, then enter PAN.
                          </p>
                        ) : null}
                      </div>
                    )}
                  </Field>
                  <Field label="Gender *">
                    <select
                      value={draft.gender}
                      onChange={(e) => patch({ gender: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  <Field label="Date of Birth *">
                    <DateField
                      value={draft.dob}
                      fullWidth
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(v) => patch({ dob: v })}
                    />
                    <p className="mt-1 text-xs" style={{ color: B.muted }}>
                      As on PAN card
                    </p>
                  </Field>
                  <Field label="Anniversary Date">
                    <DateField
                      value={draft.anniversaryDate}
                      fullWidth
                      onChange={(v) => patch({ anniversaryDate: v })}
                    />
                    <p className="mt-1 text-xs" style={{ color: B.muted }}>
                      Optional
                    </p>
                  </Field>
                </div>
                <Field label="Father Name *">
                  <input
                    value={draft.fatherName}
                    onChange={(e) => patch({ fatherName: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="As per PAN"
                  />
                </Field>
                <FileUpload
                  label="PAN Card Image (optional)"
                  meta={draft.panImage}
                  previewUrl={previews.panImage}
                  emptyHint="Tap to upload PAN card"
                  onPick={(f) => pickFile("panImage", f)}
                  onClear={() => clearFile("panImage")}
                  error={stepErrorKey === "panImage"}
                  check={docChecks.panImage}
                />
              </>
            )}

            {stepIndex === 3 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Step 4 of 9 · Aadhaar Verification
                </p>
                <Field label="Aadhaar Number *">
                  <div className="flex items-stretch gap-2">
                    <input
                      value={formatAadhaar(draft.aadhaar)}
                      onChange={(e) => {
                        const next = stripAadhaar(e.target.value);
                        patch({
                          aadhaar: next,
                          ...(draft.aadhaarOtpVerified || draft.aadhaarOtpRequestId
                            ? {
                                aadhaarOtpRequestId: "",
                                aadhaarOtpVerified: false,
                                aadhaarVerifiedName: "",
                              }
                            : {}),
                        });
                        setAadhaarOtp("");
                      }}
                      className={`${inputCls} min-w-0 flex-1 font-mono`}
                      style={inputStyle}
                      inputMode="numeric"
                      placeholder="1234 1234 1234"
                      disabled={draft.aadhaarOtpVerified}
                    />
                    {!draft.aadhaarOtpVerified ? (
                      <PrimaryButton
                        type="button"
                        variant="primary"
                        size="sm"
                        showArrow={false}
                        loading={aadhaarOtpBusy === "send"}
                        disabled={
                          Boolean(aadhaarOtpBusy) ||
                          draft.aadhaar.replace(/\D/g, "").length !== 12 ||
                          !accessToken
                        }
                        onClick={() => void sendAadhaarOtp()}
                        className="!w-auto shrink-0 self-stretch"
                      >
                        {draft.aadhaarOtpRequestId ? "Resend OTP" : "Send OTP"}
                      </PrimaryButton>
                    ) : null}
                  </div>
                </Field>
                <p className="text-xs" style={{ color: B.muted }}>
                  OTP is sent to the mobile registered with this Aadhaar (UIDAI). Verify before continuing.
                  Front and back images are optional.
                </p>
                {draft.aadhaarOtpVerified ? (
                  <div
                    className="mb-3 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold"
                    style={{ borderColor: "#86EFAC", background: "#F0FDF4", color: "#166534" }}
                  >
                    <CheckCircle2 size={18} className="shrink-0" />
                    <span>
                      Aadhaar verified
                      {draft.aadhaarVerifiedName ? ` · ${draft.aadhaarVerifiedName}` : ""}
                    </span>
                  </div>
                ) : (
                  <div className="mb-3 space-y-3">
                    {!accessToken ? (
                      <p className="text-xs font-semibold" style={{ color: "#C2410C" }}>
                        Create your account on the previous step first, then send Aadhaar OTP.
                      </p>
                    ) : null}
                    {draft.aadhaarOtpRequestId ? (
                      <Field label="Aadhaar OTP *">
                        <div className="flex items-stretch gap-2">
                          <input
                            value={aadhaarOtp}
                            onChange={(e) => setAadhaarOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            className={`${inputCls} min-w-0 flex-1 font-mono tracking-widest`}
                            style={inputStyle}
                            inputMode="numeric"
                            placeholder="Enter OTP"
                            autoComplete="one-time-code"
                          />
                          <PrimaryButton
                            type="button"
                            variant="primary"
                            size="sm"
                            showArrow={false}
                            loading={aadhaarOtpBusy === "verify"}
                            disabled={Boolean(aadhaarOtpBusy) || aadhaarOtp.replace(/\D/g, "").length < 4}
                            onClick={() => void verifyAadhaarOtp()}
                            className="!w-auto shrink-0 self-stretch"
                          >
                            Verify
                          </PrimaryButton>
                        </div>
                      </Field>
                    ) : null}
                  </div>
                )}
                <div
                  className="mb-2 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5"
                >
                  <FileUpload
                    label="Aadhaar Front (optional)"
                    meta={draft.aadhaarFront}
                    previewUrl={previews.aadhaarFront}
                    emptyHint="Tap to upload front"
                    onPick={(f) => pickFile("aadhaarFront", f)}
                    onClear={() => clearFile("aadhaarFront")}
                    error={stepErrorKey === "aadhaarFront"}
                    check={docChecks.aadhaarFront}
                    compact
                  />
                  <FileUpload
                    label="Aadhaar Back (optional)"
                    meta={draft.aadhaarBack}
                    previewUrl={previews.aadhaarBack}
                    emptyHint="Tap to upload back"
                    onPick={(f) => pickFile("aadhaarBack", f)}
                    onClear={() => clearFile("aadhaarBack")}
                    error={stepErrorKey === "aadhaarBack"}
                    check={docChecks.aadhaarBack}
                    compact
                  />
                </div>
              </>
            )}

            {stepIndex === 4 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Step 5 of 9 · Basic Details &amp; Email Verification
                </p>
                <EmailVerifyField
                  required
                  email={draft.email}
                  onChange={(v) => patch({ email: v })}
                  inputClassName={inputCls}
                  inputStyle={inputStyle}
                />
                {!accessToken ? (
                  <p className="text-xs" style={{ color: "#B45309" }}>
                    Sign in required to verify email — complete OTP on Role step first.
                  </p>
                ) : null}
                <Field label="Address *">
                  <div className="flex gap-2">
                    <input
                      value={draft.address}
                      onChange={(e) => patch({ address: e.target.value })}
                      className={`min-w-0 flex-1 ${inputCls}`}
                      style={inputStyle}
                      placeholder="Residential address"
                    />
                    <button
                      type="button"
                      disabled={addressFetchBusy}
                      onClick={() => void fetchAddressFromLocation("home")}
                      className="flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: B.badgeGrad }}
                    >
                      {addressFetchBusy ? "Fetching…" : "Fetch"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: B.muted }}>
                    Uses your location to fill address, pincode, city, district and state.
                  </p>
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Pincode *">
                    <input
                      value={draft.pincode}
                      onChange={(e) => patch({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      className={inputCls}
                      style={inputStyle}
                      inputMode="numeric"
                      placeholder={pinBusy ? "Looking up…" : "6-digit"}
                    />
                  </Field>
                  <Field label="City *">
                    <input
                      value={draft.city}
                      onChange={(e) => patch({ city: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="District *">
                    <input
                      value={draft.district}
                      onChange={(e) => patch({ district: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="State *">
                    <input
                      value={draft.state}
                      onChange={(e) => patch({ state: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </>
            )}

            {stepIndex === 5 && (
              <>
                <Field label="Business Name *">
                  <input
                    value={draft.businessName}
                    onChange={(e) => patch({ businessName: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Business Type *">
                    <select
                      value={draft.businessType}
                      onChange={(e) => patch({ businessType: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Business Category *">
                    <select
                      value={draft.businessCategory}
                      onChange={(e) => patch({ businessCategory: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      {BUSINESS_CATEGORIES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monthly Turnover *">
                    <select
                      value={draft.monthlyTurnover}
                      onChange={(e) => patch({ monthlyTurnover: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      {TURNOVERS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Business Proof *">
                    <select
                      value={draft.businessProof}
                      onChange={(e) => patch({ businessProof: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      <option value="">Select</option>
                      {BUSINESS_PROOFS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Business Address *">
                  <div className="flex gap-2">
                    <input
                      value={draft.businessAddress}
                      onChange={(e) => patch({ businessAddress: e.target.value })}
                      className={`min-w-0 flex-1 ${inputCls}`}
                      style={inputStyle}
                      placeholder="Shop / outlet address"
                    />
                    <button
                      type="button"
                      disabled={addressFetchBusy}
                      onClick={() => void fetchAddressFromLocation("business")}
                      className="flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: B.badgeGrad }}
                    >
                      {addressFetchBusy ? "Fetching…" : "Fetch"}
                    </button>
                  </div>
                  {draft.address.trim() ? (
                    <button
                      type="button"
                      onClick={useResidentialForBusiness}
                      className="mt-2 text-left text-xs font-semibold underline"
                      style={{ color: B.blue }}
                    >
                      Use residential address
                      {draft.address.trim().length > 60
                        ? `: ${draft.address.trim().slice(0, 60)}…`
                        : `: ${draft.address.trim()}`}
                    </button>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: B.muted }}>
                      Fetch from location, or copy from residential on the Details step.
                    </p>
                  )}
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Pincode *">
                    <input
                      value={draft.businessPincode}
                      onChange={(e) =>
                        patch({ businessPincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                      }
                      className={inputCls}
                      style={inputStyle}
                      inputMode="numeric"
                      placeholder={bizPinBusy ? "Looking up…" : "6-digit"}
                    />
                  </Field>
                  <Field label="City *">
                    <input
                      value={draft.businessCity}
                      onChange={(e) => patch({ businessCity: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="District *">
                    <input
                      value={draft.businessDistrict}
                      onChange={(e) => patch({ businessDistrict: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="State *">
                    <input
                      value={draft.businessState}
                      onChange={(e) => patch({ businessState: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </>
            )}

            {stepIndex === 6 && (
              <>
                <IfscBankDetailsFields
                  value={{
                    ifsc: draft.ifsc,
                    bankName: draft.bankName,
                    branch: draft.bankBranch,
                    city: "",
                    accountNumber: draft.accountNumber,
                    holderName: draft.accountName,
                    accountNumberConfirm: draft.accountNumberConfirm,
                  }}
                  onChange={(p) => {
                    const next: Partial<SignupDraft> = {};
                    if (p.ifsc !== undefined) next.ifsc = p.ifsc;
                    if (p.bankName !== undefined) next.bankName = p.bankName;
                    if (p.branch !== undefined || p.city !== undefined) {
                      const branch = p.branch !== undefined ? p.branch : draft.bankBranch;
                      const city = p.city ?? "";
                      next.bankBranch = [branch, city].filter(Boolean).join(", ");
                    }
                    if (p.accountNumber !== undefined) next.accountNumber = p.accountNumber;
                    if (p.holderName !== undefined) next.accountName = p.holderName;
                    if (p.accountNumberConfirm !== undefined) {
                      next.accountNumberConfirm = p.accountNumberConfirm;
                    }
                    patch(next);
                  }}
                  showHolder
                  showConfirmAccount
                />
                <FileUpload
                  label="Cancelled Cheque (optional)"
                  meta={draft.cancelledCheque}
                  previewUrl={previews.cancelledCheque}
                  emptyHint="Tap to upload cancelled cheque"
                  onPick={(f) => pickFile("cancelledCheque", f)}
                  onClear={() => clearFile("cancelledCheque")}
                  error={stepErrorKey === "cancelledCheque"}
                />
              </>
            )}

            {stepIndex === 7 && (
              <div className="space-y-4">
                <p className="text-xs" style={{ color: B.muted }}>
                  Capture both photos live with the camera. Location (lat/lng) is saved with each photo.
                </p>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2"
                  style={{ gap: 20, columnGap: 20, rowGap: 16 }}
                >
                  <LivePhotoCapture
                    label="Personal Photo *"
                    facing="user"
                    meta={draft.personalPhoto}
                    previewUrl={previews.personalPhoto}
                    busy={photoCaptureBusy}
                    onPick={(f) => void captureLivePhoto("personalPhoto", f)}
                    onClear={() => clearFile("personalPhoto")}
                    error={stepErrorKey === "personalPhoto"}
                  />
                  <LivePhotoCapture
                    label="Shop Photo *"
                    facing="environment"
                    meta={draft.shopPhoto}
                    previewUrl={previews.shopPhoto}
                    busy={photoCaptureBusy}
                    onPick={(f) => void captureLivePhoto("shopPhoto", f)}
                    onClear={() => clearFile("shopPhoto")}
                    error={stepErrorKey === "shopPhoto"}
                  />
                </div>
              </div>
            )}

            {stepIndex === 8 && (
              <>
                <div className="max-h-48 overflow-y-auto rounded-2xl border p-4 text-sm" style={{ borderColor: B.border, color: B.blue }}>
                  <p className="mb-2 font-bold">Agent Agreement &amp; Pricing</p>
                  <p className="text-xs leading-relaxed" style={{ color: B.muted }}>
                    By continuing you agree to AsanPay agent terms, privacy policy, and the applicable
                    commission / pricing schedule for your role. You confirm that KYC documents are true
                    and you will comply with applicable regulations.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm" style={{ color: B.blue }}>
                  <input
                    type="checkbox"
                    checked={draft.agreementAccepted}
                    onChange={(e) => patch({ agreementAccepted: e.target.checked })}
                    className="mt-1"
                  />
                  <span>I have read and accept the Terms, Privacy Policy, Agent Agreement, and pricing.</span>
                </label>
              </>
            )}

            <div className="mt-2 flex w-full items-stretch gap-3 pt-2">
              <PrimaryButton
                type="button"
                variant="destructive"
                showArrow={false}
                onClick={back}
                disabled={loading}
                className="!w-auto min-w-[7.5rem] flex-1 sm:flex-none"
              >
                Back
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={next}
                loading={loading}
                disabled={
                  Boolean(mobileError) ||
                  (stepIndex === 0 && otpSent && otp.length !== 6) ||
                  (stepIndex === 1 &&
                    needsUpline &&
                    !(draft.accountCreated || loggedInContinue) &&
                    !(sponsorStatus === "ok" && sponsor)) ||
                  (stepIndex === 2 && kycDocCheckBlocksStep(docChecks.panImage)) ||
                  (stepIndex === 3 &&
                    (kycDocCheckBlocksStep(docChecks.aadhaarFront) ||
                      kycDocCheckBlocksStep(docChecks.aadhaarBack)))
                }
                loopGlow={stepIndex === 0}
                className="!w-auto min-w-0 flex-[2]"
              >
                {primaryLabel}
              </PrimaryButton>
            </div>

            {stepIndex === 0 ? (
              <p className="text-center text-sm" style={{ color: B.muted }}>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold" style={{ color: B.blue }}>
                  Login
                </Link>
              </p>
            ) : null}
          </div>
      </div>

      {showLocationModal && !hasLocation ? (
        <LocationPermissionModal
          error={locationError}
          busy={locationBusy}
          onAllow={() => void ensureLocation()}
          onHome={() => router.push("/")}
        />
      ) : null}

      {showTermsModal ? (
        <TermsAcceptModal
          latitude={draft.latitude}
          longitude={draft.longitude}
          onAccept={() => {
            patch({ termsAccepted: true });
            setShowTermsModal(false);
          }}
          onCancel={() => setShowTermsModal(false)}
        />
      ) : null}
    </div>
  );
}
