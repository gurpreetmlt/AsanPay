"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AsanPayLogo } from "@/components/brand/Logo";
import { EmailVerifyField } from "@/components/EmailVerifyField";
import { SignupStepper, SIGNUP_STEPS } from "@/components/signup/SignupStepper";
import {
  LocationPermissionModal,
  TermsAcceptModal,
  requestBrowserLocation,
} from "@/components/signup/SignupLocationTerms";
import api from "@/lib/api";
import { formatAadhaar, stripAadhaar } from "@/lib/aadhaar";
import { B } from "@/lib/brand";
import { lookupIndianIfsc } from "@/lib/ifsc";
import { extractApiError } from "@/lib/onboarding";
import { lookupIndianPincode } from "@/lib/pincode";
import {
  clearSignupDraft,
  EMPTY_SIGNUP_DRAFT,
  loadSignupDraft,
  saveSignupDraft,
  type SignupDraft,
  type SignupFileMeta,
  type SignupRole,
} from "@/lib/signupDraft";
import { useAuthStore } from "@/lib/store";

type SponsorRole = "admin" | "master_distributor" | "distributor";

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

const ROLE_OPTIONS: { value: SignupRole; label: string }[] = [
  { value: "retailer", label: "Retailer" },
  { value: "distributor", label: "Distributor" },
  { value: "master_distributor", label: "Super Distributor" },
];

const SPONSOR_ROLE: Record<SignupRole, SponsorRole> = {
  master_distributor: "admin",
  distributor: "master_distributor",
  retailer: "distributor",
};

const UPLINE_LABEL: Record<Exclude<SignupRole, "master_distributor">, string> = {
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
      {children}
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

function fileMeta(file: File): SignupFileMeta {
  return { name: file.name, mime: file.type, size: file.size };
}

function FileUpload({
  label,
  meta,
  previewUrl,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
  onPick,
  onClear,
  error,
}: {
  label: string;
  meta: SignupFileMeta | null;
  previewUrl?: string | null;
  accept?: string;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <label
        className="flex cursor-pointer flex-col gap-2 rounded-2xl border-2 border-dashed px-4 py-4 transition"
        style={{
          borderColor: error ? "#DC2626" : meta ? B.green : B.border,
          background: error ? "#FEF2F2" : B.bg,
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
          <img src={previewUrl} alt="" className="max-h-28 rounded-xl object-contain" />
        ) : null}
        <span className="text-sm font-semibold" style={{ color: error ? "#DC2626" : B.blue }}>
          {meta ? meta.name : "Tap to upload PAN card"}
        </span>
        <span className="text-xs" style={{ color: B.muted }}>
          JPG, PNG, WEBP, HEIC or PDF · max 2 MB
        </span>
      </label>
      {error && !meta ? (
        <p className="mt-1 text-xs font-semibold" style={{ color: "#DC2626" }}>
          PAN card image is required
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

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState<SignupDraft>(EMPTY_SIGNUP_DRAFT);
  const [phase, setPhase] = useState<"steps" | "otp">("steps");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sponsor, setSponsor] = useState<SponsorInfo | null>(null);
  const [sponsorStatus, setSponsorStatus] = useState<"idle" | "loading" | "ok" | "empty" | "error">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [ifscBusy, setIfscBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [bizPinBusy, setBizPinBusy] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [stepErrorKey, setStepErrorKey] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const stepIndex = draft.stepIndex;
  const needsUpline = draft.role !== "master_distributor";
  const sponsorRole = SPONSOR_ROLE[draft.role];
  const storageKey = draft.accountCreated && user?.id ? user.id : draft.mobile.replace(/\D/g, "") || "anon";
  const hasLocation = Boolean(draft.latitude && draft.longitude);

  function patch(p: Partial<SignupDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function ensureLocation() {
    setLocationBusy(true);
    setLocationError(null);
    try {
      const coords = await requestBrowserLocation();
      patch({ latitude: coords.latitude, longitude: coords.longitude });
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
    const key = user?.id || "";
    const existing =
      (key && loadSignupDraft(key)) ||
      (typeof window !== "undefined"
        ? (() => {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k?.startsWith("asanpay:signup-draft:") && k !== "asanpay:signup-draft:anon") {
                try {
                  return JSON.parse(localStorage.getItem(k) || "") as SignupDraft;
                } catch {
                  return null;
                }
              }
            }
            return null;
          })()
        : null);
    if (existing) {
      setDraft(existing);
      if (existing.accountCreated && existing.stepIndex < 2) patch({ stepIndex: 2 });
    } else if (user?.id && user.hasKycDocs) {
      router.replace("/dashboard");
      return;
    }
    setDraftReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!draftReady) return;
    saveSignupDraft(storageKey, draft);
  }, [draft, draftReady, storageKey]);

  useEffect(() => {
    if (!draftReady || stepIndex !== 0 || phase !== "steps") return;
    if (draft.latitude && draft.longitude) {
      setShowLocationModal(false);
      return;
    }
    setShowLocationModal(true);
    void ensureLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady, stepIndex, phase]);

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
        patch({ district: place.city || draft.district, state: place.state || draft.state });
      })
      .finally(() => {
        if (!cancelled) setPinBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pincode]);

  useEffect(() => {
    const pin = draft.businessPincode;
    if (pin.length !== 6) return;
    let cancelled = false;
    setBizPinBusy(true);
    void lookupIndianPincode(pin)
      .then((place) => {
        if (cancelled || !place) return;
        patch({
          businessDistrict: place.city || draft.businessDistrict,
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

  useEffect(() => {
    const ifsc = draft.ifsc;
    if (ifsc.length !== 11 || !draft.accountCreated) return;
    let cancelled = false;
    setIfscBusy(true);
    void lookupIndianIfsc(ifsc)
      .then((place) => {
        if (cancelled || !place) return;
        patch({ bankName: place.bank || draft.bankName, bankBranch: place.branch || draft.bankBranch });
      })
      .finally(() => {
        if (!cancelled) setIfscBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ifsc, draft.accountCreated]);

  function pickFile(
    key: keyof Pick<
      SignupDraft,
      "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque" | "shopPhoto"
    >,
    file: File,
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
    patch({ [key]: fileMeta(file) });
    setStepErrorKey(null);
    if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) {
      const url = URL.createObjectURL(file);
      setPreviews((p) => {
        if (p[key]) URL.revokeObjectURL(p[key]);
        return { ...p, [key]: url };
      });
    }
    toast.success(`${file.name} selected`);
  }

  function clearFile(
    key: keyof Pick<
      SignupDraft,
      "panImage" | "aadhaarFront" | "aadhaarBack" | "cancelledCheque" | "shopPhoto"
    >,
  ) {
    patch({ [key]: null });
    setPreviews((p) => {
      if (p[key]) URL.revokeObjectURL(p[key]);
      const next = { ...p };
      delete next[key];
      return next;
    });
  }

  function validateStep(): string | null {
    if (stepIndex === 0) {
      if (!draft.latitude || !draft.longitude) return "Allow location access before continuing";
      if (draft.mobile.replace(/\D/g, "").length !== 10) return "Enter a valid 10-digit mobile";
      if (!draft.termsAccepted) return "Please accept Terms and Conditions";
    }
    if (stepIndex === 1) {
      if (draft.name.trim().length < 2) return "Full name is required";
      if (!draft.password || draft.password.length < 8) return "Password must be at least 8 characters";
      if (needsUpline && !sponsor) return "Enter a valid upline mobile number";
    }
    if (stepIndex === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(draft.pan)) return "Enter a valid PAN";
      if (!draft.gender) return "Select gender";
      if (!draft.dob) return "Date of birth is required";
      if (!draft.fatherName.trim()) return "Father name is required";
      if (!draft.panImage) return "Upload PAN card image";
    }
    if (stepIndex === 3) {
      if (draft.aadhaar.replace(/\D/g, "").length !== 12) return "Enter a valid 12-digit Aadhaar";
      if (!draft.aadhaarFront) return "Upload Aadhaar front";
      if (!draft.aadhaarBack) return "Upload Aadhaar back";
    }
    if (stepIndex === 4) {
      if (!draft.email.trim()) return "Email is required";
      if (!user?.emailVerifiedAt || (user.email ?? "").toLowerCase() !== draft.email.trim().toLowerCase()) {
        return "Verify your email before continuing";
      }
      if (!draft.address.trim()) return "Address is required";
      if (draft.pincode.length !== 6) return "Enter a valid pincode";
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
    }
    if (stepIndex === 6) {
      if (draft.ifsc.length !== 11) return "Enter a valid IFSC";
      if (!draft.bankName.trim()) return "Bank name is required";
      if (!draft.accountNumber.trim()) return "Account number is required";
      if (draft.accountNumber !== draft.accountNumberConfirm) return "Account numbers do not match";
      if (!draft.accountName.trim()) return "Account holder name is required";
      if (!draft.cancelledCheque) return "Upload cancelled cheque";
    }
    if (stepIndex === 7) {
      if (!draft.shopPhoto) return "Upload shop photo";
    }
    if (stepIndex === 8) {
      if (!draft.agreementAccepted) return "Please accept the agent agreement";
    }
    return null;
  }

  async function requestOtp() {
    setLoading(true);
    try {
      if (!draft.latitude || !draft.longitude) {
        toast.error("Allow location access before continuing");
        setShowLocationModal(true);
        return;
      }
      const { data } = await api.post<ApiResponse<{ otp?: string; message: string }>>("/auth/signup/request", {
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        role: draft.role,
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...(sponsor ? { sponsorUid: sponsor.uid } : {}),
      });
      if (!data.success) throw new Error(data.message);
      setDevOtp(data.data.otp ?? null);
      setPhase("otp");
      toast.success(data.data.otp ? `Dev OTP: ${data.data.otp}` : "OTP sent");
    } catch (err) {
      toast.error(extractApiError(err, "Signup OTP failed"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!otp) return;
    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<SessionData | { pendingApproval: true; user: AuthUser; message: string }>
      >("/auth/signup/verify", {
        name: draft.name.trim(),
        mobile: draft.mobile.replace(/\D/g, "").slice(0, 10),
        otp,
        role: draft.role,
        portal: "agent",
        latitude: draft.latitude,
        longitude: draft.longitude,
        ...(sponsor ? { sponsorUid: sponsor.uid } : {}),
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
      const nextDraft = { ...draft, accountCreated: true, stepIndex: 2 };
      setDraft(nextDraft);
      saveSignupDraft(session.user.id, nextDraft);
      clearSignupDraft(draft.mobile.replace(/\D/g, ""));
      setPhase("steps");
      setOtp("");
      toast.success("Account created — continue onboarding");
    } catch (err) {
      toast.error(extractApiError(err, "Signup failed"));
    } finally {
      setLoading(false);
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
        city: draft.district.trim(),
        pincode: draft.pincode,
        bankAccountName: draft.accountName.trim(),
        bankAccountNumber: draft.accountNumber,
        bankIfsc: draft.ifsc.toUpperCase(),
        bankName: draft.bankName.trim(),
        cancelledChequeFileName: draft.cancelledCheque?.name,
        gender: draft.gender,
        fatherName: draft.fatherName.trim(),
        dob: draft.dob,
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
        shopPhotoFileName: draft.shopPhoto?.name,
        latitude: draft.latitude || undefined,
        longitude: draft.longitude || undefined,
      });
      if (!data.success) throw new Error(data.message);
      useAuthStore.getState().setUser(data.data.user);
      clearSignupDraft(user?.id || storageKey);
      toast.success("Onboarding submitted — awaiting approval");
      router.replace("/dashboard");
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
      else if (err.toLowerCase().includes("shop photo")) setStepErrorKey("shopPhoto");
      else setStepErrorKey(null);
      return;
    }
    setStepErrorKey(null);
    if (stepIndex === 1) {
      void requestOtp();
      return;
    }
    if (stepIndex === 8) {
      void finalSubmit();
      return;
    }
    patch({ stepIndex: Math.min(stepIndex + 1, 8) });
  }

  function back() {
    if (phase === "otp") {
      setPhase("steps");
      return;
    }
    if (stepIndex === 0) {
      router.push("/login");
      return;
    }
    if (stepIndex === 2 && draft.accountCreated) {
      toast("Account already created — continue KYC steps");
      return;
    }
    patch({ stepIndex: Math.max(stepIndex - 1, 0) });
  }

  if (!draftReady) return null;

  const subtitle = phase === "otp" ? "Mobile OTP" : SIGNUP_STEPS[stepIndex]?.label ?? "Sign Up";

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: B.bg }}>
      <div className="mx-auto w-full max-w-lg rounded-3xl border bg-white p-5 shadow-xl sm:p-8" style={{ borderColor: B.border }}>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={back}
            className="flex h-10 w-10 items-center justify-center rounded-xl border"
            style={{ borderColor: B.border, color: B.blue }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <AsanPayLogo width={140} />
            <h1 className="mt-2 text-xl font-bold" style={{ color: B.blue }}>
              Sign Up
            </h1>
            <p className="text-sm" style={{ color: B.muted }}>
              {subtitle}
            </p>
          </div>
        </div>

        <SignupStepper currentIndex={phase === "otp" ? 1 : stepIndex} />

        {phase === "otp" ? (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-sm" style={{ color: B.muted }}>
              Enter the 6-digit OTP sent to +91 {draft.mobile.replace(/\D/g, "").slice(0, 10)}
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
              />
            </Field>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              {loading ? "Verifying…" : "Verify & Continue"}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {stepIndex === 0 && (
              <>
                {!hasLocation ? (
                  <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    Location must be allowed before you enter your mobile number.
                  </p>
                ) : (
                  <p className="rounded-xl px-3 py-2 text-xs" style={{ background: `${B.green}12`, color: B.greenDark }}>
                    Location captured · Lat {Number(draft.latitude).toFixed(5)}, Lng {Number(draft.longitude).toFixed(5)}
                  </p>
                )}
                <Field label="Mobile Number *">
                  <input
                    value={draft.mobile}
                    onChange={(e) => patch({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className={inputCls}
                    style={{
                      ...inputStyle,
                      opacity: hasLocation ? 1 : 0.55,
                    }}
                    inputMode="numeric"
                    placeholder="10-digit mobile"
                    disabled={!hasLocation}
                  />
                </Field>
                <p className="text-xs" style={{ color: B.muted }}>
                  *Enter number which is linked to your Aadhaar.
                </p>
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
                  />
                  <span>
                    I agree to the{" "}
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
                      Terms and Conditions
                    </button>
                  </span>
                </label>
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
                  >
                    {ROLE_OPTIONS.map((r) => (
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
                      onChange={(e) => patch({ sponsorMobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                      className={inputCls}
                      style={inputStyle}
                      inputMode="numeric"
                    />
                    {sponsorStatus === "ok" && sponsor ? (
                      <p className="mt-1 text-xs font-semibold" style={{ color: B.green }}>
                        <CheckCircle2 size={12} className="mr-1 inline" />
                        {sponsor.name}
                      </p>
                    ) : null}
                    {sponsorStatus === "empty" || sponsorStatus === "error" ? (
                      <p className="mt-1 text-xs" style={{ color: "#B45309" }}>
                        Upline not found
                      </p>
                    ) : null}
                  </Field>
                ) : null}
                <Field label="Password *">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={draft.password}
                      onChange={(e) => patch({ password: e.target.value })}
                      className={`${inputCls} pr-12`}
                      style={inputStyle}
                      placeholder="Min 8 characters, include a letter"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1"
                      style={{ color: B.muted }}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
              </>
            )}

            {stepIndex === 2 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Step 3 of 9 · PAN Verification
                </p>
                <Field label="PAN Number *">
                  <input
                    value={draft.pan}
                    onChange={(e) => patch({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                    placeholder="ABCDE1234F"
                  />
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
                  <input
                    type="date"
                    value={draft.dob}
                    onChange={(e) => patch({ dob: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
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
                  label="PAN Card Image *"
                  meta={draft.panImage}
                  previewUrl={previews.panImage}
                  onPick={(f) => pickFile("panImage", f)}
                  onClear={() => clearFile("panImage")}
                  error={stepErrorKey === "panImage"}
                />
              </>
            )}

            {stepIndex === 3 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Step 4 of 9 · Aadhaar Verification
                </p>
                <Field label="Aadhaar Number *">
                  <input
                    value={formatAadhaar(draft.aadhaar)}
                    onChange={(e) => patch({ aadhaar: stripAadhaar(e.target.value) })}
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                    inputMode="numeric"
                    placeholder="1234 1234 1234"
                  />
                </Field>
                <p className="text-xs" style={{ color: B.muted }}>
                  Enter the Aadhaar linked to your mobile number. Upload clear front and back images.
                </p>
                <FileUpload
                  label="Aadhaar Front *"
                  meta={draft.aadhaarFront}
                  previewUrl={previews.aadhaarFront}
                  onPick={(f) => pickFile("aadhaarFront", f)}
                  onClear={() => clearFile("aadhaarFront")}
                  error={stepErrorKey === "aadhaarFront"}
                />
                <FileUpload
                  label="Aadhaar Back *"
                  meta={draft.aadhaarBack}
                  previewUrl={previews.aadhaarBack}
                  onPick={(f) => pickFile("aadhaarBack", f)}
                  onClear={() => clearFile("aadhaarBack")}
                  error={stepErrorKey === "aadhaarBack"}
                />
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
                  <input
                    value={draft.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Residential address"
                  />
                </Field>
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
                <div className="grid grid-cols-2 gap-3">
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
                <Field label="Business Address *">
                  <input
                    value={draft.businessAddress}
                    onChange={(e) => patch({ businessAddress: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
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
                <div className="grid grid-cols-2 gap-3">
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
                <Field label="IFSC *">
                  <input
                    value={draft.ifsc}
                    onChange={(e) =>
                      patch({ ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })
                    }
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                    placeholder="e.g. HDFC0001209"
                  />
                  <p className="mt-1 text-xs" style={{ color: B.muted }}>
                    {draft.ifsc.length}/11 {ifscBusy ? "· Looking up…" : ""}
                  </p>
                </Field>
                <Field label="Bank Name *">
                  <input
                    value={draft.bankName}
                    onChange={(e) => patch({ bankName: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Branch">
                  <input
                    value={draft.bankBranch}
                    onChange={(e) => patch({ bankBranch: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Account Number *">
                  <input
                    value={draft.accountNumber}
                    onChange={(e) => patch({ accountNumber: e.target.value.replace(/\D/g, "").slice(0, 30) })}
                    className={inputCls}
                    style={inputStyle}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Confirm Account Number *">
                  <input
                    value={draft.accountNumberConfirm}
                    onChange={(e) =>
                      patch({ accountNumberConfirm: e.target.value.replace(/\D/g, "").slice(0, 30) })
                    }
                    className={inputCls}
                    style={inputStyle}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Account Holder Name *">
                  <input
                    value={draft.accountName}
                    onChange={(e) => patch({ accountName: e.target.value })}
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
                <FileUpload
                  label="Cancelled Cheque *"
                  meta={draft.cancelledCheque}
                  previewUrl={previews.cancelledCheque}
                  onPick={(f) => pickFile("cancelledCheque", f)}
                  onClear={() => clearFile("cancelledCheque")}
                  error={stepErrorKey === "cancelledCheque"}
                />
              </>
            )}

            {stepIndex === 7 && (
              <FileUpload
                label="Shop Photo *"
                meta={draft.shopPhoto}
                previewUrl={previews.shopPhoto}
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onPick={(f) => pickFile("shopPhoto", f)}
                onClear={() => clearFile("shopPhoto")}
                error={stepErrorKey === "shopPhoto"}
              />
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

            <button
              type="button"
              onClick={next}
              disabled={loading}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              {loading ? "Please wait…" : stepIndex === 8 ? "Submit" : stepIndex === 1 ? "Send OTP" : "Submit"}
            </button>

            {stepIndex === 0 ? (
              <p className="text-center text-sm" style={{ color: B.muted }}>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold" style={{ color: B.blue }}>
                  Login
                </Link>
              </p>
            ) : null}
          </div>
        )}
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
