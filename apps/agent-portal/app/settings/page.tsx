"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Lock,
  Bell,
  Shield,
  Smartphone,
  ChevronRight,
  Check,
  Eye,
  EyeOff,
  ArrowRight,
  FileText,
  Info,
  Landmark,
  LifeBuoy,
} from "lucide-react";
import { toast } from "react-hot-toast";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { KycOnboardingBanner } from "@/components/dashboard/KycOnboardingBanner";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmailVerifyField } from "@/components/EmailVerifyField";
import { BiometricDevices } from "@/components/settings/BiometricDevices";
import { DeviceRepairRequests } from "@/components/settings/DeviceRepairRequests";
import { SettlementBanksPanel } from "@/components/settlements/SettlementBanksPanel";
import { FaqSection } from "@/components/support/FaqSection";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import api from "@/lib/api";
import { SignupStepper, SIGNUP_STEPS } from "@/components/signup/SignupStepper";
import { extractApiError, needsSignupKycCompletion } from "@/lib/onboarding";
import { getSignupResumeStep, loadSignupDraft } from "@/lib/signupDraft";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { enableBiometricLogin, isWebAuthnAvailable } from "@/lib/webauthn";

const SECTIONS = [
  { id: "profile", icon: User, label: "Profile & KYC" },
  { id: "security", icon: Lock, label: "Security" },
  { id: "banks", icon: Landmark, label: "Settlement banks" },
  { id: "notify", icon: Bell, label: "Notifications" },
  { id: "devices", icon: Smartphone, label: "Devices" },
  { id: "legal", icon: LifeBuoy, label: "Legal and Help" },
];

function formatKycDate(value: string | null | undefined): string {
  if (!value || !String(value).trim()) return "—";
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

function VerifiedPill() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `${B.green}18`, color: B.green }}
    >
      <Check size={10} strokeWidth={3} />
      Verified
    </span>
  );
}

function ProfileReadField({
  label,
  value,
  badge,
  wide,
}: {
  label: string;
  value: string;
  badge?: ReactNode;
  /** Span full row in a grid */
  wide?: boolean;
}) {
  const empty = !value || value === "—";
  return (
    <div
      className={`min-w-0 rounded-lg border px-3 py-2 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}
      style={{ borderColor: B.border, background: "#fff" }}
    >
      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </span>
        {badge}
      </div>
      <div
        className="text-[13px] font-bold leading-snug break-words"
        style={{ color: empty ? B.muted : B.blue }}
        title={value}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="w-full rounded-xl border p-3" style={{ borderColor: B.border, background: B.bg }}>
      <h3
        className="mb-2 border-b pb-1.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: B.muted, borderColor: B.border }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative h-6 w-11 rounded-full transition-colors"
      style={{ background: on ? B.green : "#D1D5DB" }}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const role = roleFromUserRole(user?.role);
  const [active, setActive] = useState("profile");
  const [signupStepIndex, setSignupStepIndex] = useState(2);
  const [kycProfile, setKycProfile] = useState<{
    uid: string;
    mobile: string;
    fullName: string | null;
    email: string | null;
    dob: string | null;
    anniversaryDate: string | null;
    gender: string | null;
    fatherName: string | null;
    address: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    pincode: string | null;
    aadhaarMasked: string | null;
    panMasked: string | null;
    bankAccountName: string | null;
    bankAccountMasked: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    bankBranch: string | null;
    businessName: string | null;
    businessType: string | null;
    submittedAt: string | null;
  } | null>(null);
  const [kycProfileLoading, setKycProfileLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [notifs, setNotifs] = useState({
    sms: true,
    push: true,
    txn: true,
    commission: false,
  });

  useEffect(() => {
    setEmail(user?.email ?? "");
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    // Legacy ?tab=kyc → Profile & KYC
    if (tab === "kyc") {
      setActive("profile");
      return;
    }
    if (tab && SECTIONS.some((s) => s.id === tab)) setActive(tab);
  }, []);

  useEffect(() => {
    if (!user) return;
    const phone = (user.mobile || "").replace(/\D/g, "").slice(0, 10);
    const draft = (user.id && loadSignupDraft(user.id)) || (phone ? loadSignupDraft(phone) : null);
    const idx = draft ? getSignupResumeStep(draft, 2) : 2;
    setSignupStepIndex(Math.max(2, Math.min(idx, SIGNUP_STEPS.length - 1)));
  }, [user, active]);

  useEffect(() => {
    if (active !== "profile" || !accessToken || !user || needsSignupKycCompletion(user)) {
      return;
    }
    let cancelled = false;
    setKycProfileLoading(true);
    void (async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{
            profile: NonNullable<typeof kycProfile> & {
              kycStatus: string;
              hasKycDocs: boolean;
            };
          }>
        >("/kyc/me");
        if (cancelled) return;
        if (!data.success) throw new Error(data.message);
        setKycProfile(data.data.profile);
      } catch (err) {
        if (!cancelled) {
          toast.error(extractApiError(err, "Could not load KYC details"));
          setKycProfile(null);
        }
      } finally {
        if (!cancelled) setKycProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, accessToken, user]);

  async function toggleMarketingOptIn() {
    if (!user || marketingBusy) return;
    const next = !user.emailMarketingOptIn;
    setMarketingBusy(true);
    try {
      const { data } = await api.patch<ApiResponse<{ user: AuthUser }>>("/auth/email/preferences", {
        emailMarketingOptIn: next,
      });
      if (!data.success) throw new Error(data.message);
      setUser(data.data.user);
      toast.success(next ? "Product updates enabled" : "Product updates disabled");
    } catch (err) {
      toast.error(extractApiError(err, "Could not update email preference"));
    } finally {
      setMarketingBusy(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }
    setPasswordBusy(true);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      toast.success("Password changed — please log in again");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // The backend revokes every session (including this one) on a password change — the
      // cookie is already dead server-side, so send the user straight back to login.
      useAuthStore.getState().logout();
      router.replace("/login");
    } catch (err) {
      toast.error(extractApiError(err, "Could not change password"));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleEnableBiometric() {
    if (!user) return;
    if (!isWebAuthnAvailable()) {
      toast.error("Biometric login not supported on this browser");
      return;
    }
    setBioLoading(true);
    try {
      await enableBiometricLogin({
        userId: user.id,
        userName: user.mobile,
        userLabel: user.name,
      });
      toast.success("Biometric login enabled");
    } catch (err) {
      toast.error(extractApiError(err, err instanceof Error ? err.message : "Biometric setup failed"));
    } finally {
      setBioLoading(false);
    }
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  const name = user?.name ?? "";
  const mobile = user?.mobile ?? "";
  const uid = user?.uid ?? "";
  const av = initials(name || "AG");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Settings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Manage your account preferences
          </p>
        </div>

        <div className="flex gap-5">
          <div className="w-56 flex-shrink-0">
            <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  data-active={active === s.id}
                  className="settings-menu-item group flex w-full items-center justify-between border-b px-4 py-3.5 text-left"
                  style={{
                    borderColor: B.border,
                    background: active === s.id ? `${B.blue}0A` : "transparent",
                    borderLeft: active === s.id ? `3px solid ${B.blue}` : "3px solid transparent",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <s.icon size={16} style={{ color: active === s.id ? B.blue : B.muted }} />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: active === s.id ? B.blue : B.muted }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <ChevronRight
                    size={13}
                    className="transition-transform duration-200 group-hover:translate-x-1"
                    style={{ color: B.muted }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div key={active} className="panel-fade-in flex-1">
            {active === "profile" && (
              <div className="space-y-5">
                <div className="space-y-5 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                      Profile & KYC
                    </h2>
                    {!needsSignupKycCompletion(user) &&
                    (kycProfile?.panMasked || kycProfile?.aadhaarMasked || kycProfileLoading) ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: user?.kycStatus === "verified" ? "#DCFCE7" : "#FFEDD5",
                          color: user?.kycStatus === "verified" ? "#166534" : "#C2410C",
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                        {user?.kycStatus === "verified" ? "Verified" : "Under review"}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      {av}
                    </div>
                    <div>
                      <div className="font-bold" style={{ color: B.blue }}>
                        {name}
                      </div>
                      <div className="text-sm" style={{ color: B.muted }}>
                        {role.label} · ID: {uid}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs" style={{ color: B.muted }}>
                    KYC details cannot be edited here. Contact support to update verified identity.
                  </p>

                  {needsSignupKycCompletion(user) ||
                  (user?.hasKycDocs && user.kycStatus !== "verified" && user.kycStatus !== "rejected") ? (
                    <KycOnboardingBanner />
                  ) : null}

                  {needsSignupKycCompletion(user) ? (
                    <>
                      <p className="text-sm" style={{ color: B.muted }}>
                        Same steps as signup. Incomplete steps stay grey — fill them before continuing.
                      </p>
                      <SignupStepper currentIndex={signupStepIndex} />
                      <ul className="space-y-2">
                        {SIGNUP_STEPS.map((step, i) => {
                          const done = i < signupStepIndex;
                          const current = i === signupStepIndex;
                          const reachable = i <= signupStepIndex;
                          return (
                            <li key={step.id}>
                              <button
                                type="button"
                                disabled={!reachable}
                                onClick={() =>
                                  router.push(`/signup?from=settings&step=${i}`)
                                }
                                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:cursor-default"
                                style={{
                                  borderColor: current ? B.blue : B.border,
                                  background: current ? `${B.blue}08` : "#fff",
                                  opacity: reachable ? 1 : 0.7,
                                }}
                              >
                              <span
                                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                                style={{
                                  background: done ? B.green : current ? B.blue : B.secondary,
                                  color: done || current ? "#fff" : B.muted,
                                }}
                              >
                                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                              </span>
                              <span
                                className="text-sm font-semibold"
                                style={{ color: done ? B.greenDark : current ? B.blue : B.muted }}
                              >
                                {step.label}
                              </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <PrimaryButton
                        type="button"
                        variant="primary"
                        onClick={() =>
                          router.push(`/signup?from=settings&step=${signupStepIndex}`)
                        }
                      >
                        {user?.kycStatus === "rejected" ? "Resubmit KYC" : "Continue KYC"}
                      </PrimaryButton>
                    </>
                  ) : (
                    <div className="w-full space-y-3">
                      <ProfileSection title="Contact">
                        <div className="grid w-full gap-2 sm:grid-cols-2">
                          <ProfileReadField label="Mobile" value={mobile || "—"} badge={<VerifiedPill />} />
                          {user?.emailVerifiedAt &&
                          (user.email ?? "").toLowerCase() === email.trim().toLowerCase() &&
                          email.trim() ? (
                            <ProfileReadField label="Email" value={email} badge={<VerifiedPill />} />
                          ) : (
                            <div className="min-w-0 sm:col-span-2">
                              <EmailVerifyField
                                email={email}
                                onChange={setEmail}
                                inputClassName="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none"
                                inputStyle={{ borderColor: B.border, background: B.bg, color: B.blue }}
                              />
                            </div>
                          )}
                        </div>
                      </ProfileSection>

                      {kycProfileLoading ? (
                        <ProfileSection title="Account & identity">
                          <p className="text-sm" style={{ color: B.muted }}>
                            Loading KYC details…
                          </p>
                        </ProfileSection>
                      ) : (
                        <>
                          <ProfileSection title="Account">
                            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <ProfileReadField label="Full name" value={name || "—"} />
                              <ProfileReadField label="UID" value={uid || "—"} />
                              <ProfileReadField label="Role" value={role.label} />
                              <ProfileReadField
                                label="Account status"
                                value={user?.isActive ? "Active" : "Inactive"}
                              />
                            </div>
                          </ProfileSection>

                          <ProfileSection title="Identity">
                            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              <ProfileReadField label="PAN No." value={kycProfile?.panMasked || "—"} />
                              <ProfileReadField
                                label="Aadhaar No."
                                value={kycProfile?.aadhaarMasked || "—"}
                              />
                              <ProfileReadField label="DOB" value={formatKycDate(kycProfile?.dob)} />
                              <ProfileReadField
                                label="Anniversary"
                                value={formatKycDate(kycProfile?.anniversaryDate)}
                              />
                              <ProfileReadField label="Gender" value={kycProfile?.gender || "—"} />
                              <ProfileReadField
                                label="Father name"
                                value={kycProfile?.fatherName || "—"}
                              />
                              <ProfileReadField
                                wide
                                label="Address"
                                value={
                                  [
                                    kycProfile?.address,
                                    kycProfile?.city || kycProfile?.district,
                                    kycProfile?.state,
                                    kycProfile?.pincode,
                                  ]
                                    .filter(Boolean)
                                    .join(", ") || "—"
                                }
                              />
                            </div>
                          </ProfileSection>

                          <ProfileSection title="Business">
                            <div className="grid w-full gap-2 sm:grid-cols-2">
                              <ProfileReadField
                                label="Business name"
                                value={kycProfile?.businessName || "—"}
                              />
                              <ProfileReadField
                                label="Business type"
                                value={kycProfile?.businessType || "—"}
                              />
                            </div>
                          </ProfileSection>

                          <ProfileSection title="Bank">
                            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              <ProfileReadField label="Bank" value={kycProfile?.bankName || "—"} />
                              <ProfileReadField label="Branch" value={kycProfile?.bankBranch || "—"} />
                              <ProfileReadField label="IFSC" value={kycProfile?.bankIfsc || "—"} />
                              <ProfileReadField
                                label="Account holder"
                                value={kycProfile?.bankAccountName || "—"}
                              />
                              <ProfileReadField
                                label="Account"
                                value={kycProfile?.bankAccountMasked || "—"}
                              />
                            </div>
                          </ProfileSection>
                        </>
                      )}

                      {user?.role === "retailer" && user.hasNobleAgent !== true ? (
                        <button
                          type="button"
                          onClick={() => router.push("/onboarding/noble")}
                          className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5"
                          style={{ borderColor: B.border, background: `${B.blue}06` }}
                        >
                          <div className="flex items-center gap-2.5">
                            <FileText size={16} style={{ color: B.blue }} />
                            <div className="text-left">
                              <div className="text-sm font-bold" style={{ color: B.blue }}>
                                AEPS agent onboarding
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                One-time setup for AEPS services
                              </div>
                            </div>
                          </div>
                          <ArrowRight size={14} style={{ color: B.blueLight }} />
                        </button>
                      ) : null}

                      {user?.role === "retailer" && user.hasInstantpayOutlet !== true ? (
                        <button
                          type="button"
                          onClick={() => router.push("/onboarding/outlet")}
                          className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5"
                          style={{ borderColor: B.border, background: `${B.blue}06` }}
                        >
                          <div className="flex items-center gap-2.5">
                            <FileText size={16} style={{ color: B.blue }} />
                            <div className="text-left">
                              <div className="text-sm font-bold" style={{ color: B.blue }}>
                                Register outlet
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                InstantPay Min-KYC
                              </div>
                            </div>
                          </div>
                          <ArrowRight size={14} style={{ color: B.blueLight }} />
                        </button>
                      ) : null}

                      {user?.role === "retailer" && user.hasInstantpayOutlet === true ? (
                        <button
                          type="button"
                          onClick={() => router.push("/onboarding/bio-kyc")}
                          className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5"
                          style={{ borderColor: B.border, background: `${B.blue}06` }}
                        >
                          <div className="flex items-center gap-2.5">
                            <Shield size={16} style={{ color: B.blue }} />
                            <div className="text-left">
                              <div className="text-sm font-bold" style={{ color: B.blue }}>
                                Biometric KYC
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                Fingerprint eKYC for AePS / DMT
                              </div>
                            </div>
                          </div>
                          <ArrowRight size={14} style={{ color: B.blueLight }} />
                        </button>
                      ) : null}

                      <div>
                        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                          Transaction limits
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[
                            { label: "Daily limit", value: "₹2,00,000", used: "₹1,82,400", pct: 91 },
                            { label: "Monthly limit", value: "₹50,00,000", used: "₹8,40,000", pct: 17 },
                            { label: "Max single", value: "₹50,000", used: "₹25,000", pct: 50 },
                          ].map((l) => (
                            <div
                              key={l.label}
                              className="rounded-xl border px-3.5 py-3"
                              style={{ borderColor: B.border }}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-sm font-semibold" style={{ color: B.muted }}>
                                  {l.label}
                                </span>
                                <span className="text-xs font-bold tabular-nums" style={{ color: B.blue }}>
                                  {l.pct}%
                                </span>
                              </div>
                              <div className="mt-1.5 text-sm font-bold tabular-nums" style={{ color: B.blue }}>
                                {l.used}
                              </div>
                              <div className="text-xs" style={{ color: B.muted }}>
                                of {l.value}
                              </div>
                              <div className="mt-2 h-2.5 rounded-full bg-gray-100">
                                <div
                                  className="h-2.5 rounded-full"
                                  style={{
                                    width: `${l.pct}%`,
                                    background: l.pct > 80 ? "#DC2626" : B.green,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {active === "security" && (
              <div className="space-y-5 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                  Security Settings
                </h2>
                <div className="space-y-4">
                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-3 text-sm font-semibold" style={{ color: B.blue }}>
                      Change Password
                    </div>
                    {(
                      [
                        ["Current Password", currentPassword, setCurrentPassword],
                        ["New Password", newPassword, setNewPassword],
                        ["Confirm Password", confirmPassword, setConfirmPassword],
                      ] as const
                    ).map(([f, value, setValue]) => (
                      <div key={f} className="mb-3">
                        <label className="mb-1 block text-xs font-semibold" style={{ color: B.muted }}>
                          {f}
                        </label>
                        <div
                          className="flex items-center gap-2 rounded-xl border px-4 py-2.5"
                          style={{ borderColor: B.border, background: B.bg }}
                        >
                          <Lock size={14} style={{ color: B.muted }} />
                          <input
                            type={showPin ? "text" : "password"}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="••••••••"
                            className="flex-1 bg-transparent text-sm outline-none"
                            style={{ color: B.blue }}
                          />
                          <button type="button" onClick={() => setShowPin(!showPin)}>
                            {showPin ? (
                              <EyeOff size={14} style={{ color: B.muted }} />
                            ) : (
                              <Eye size={14} style={{ color: B.muted }} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                    <PrimaryButton
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={
                        passwordBusy ||
                        !currentPassword.trim() ||
                        newPassword.length < 8 ||
                        confirmPassword !== newPassword
                      }
                      loading={passwordBusy}
                      onClick={() => void handleChangePassword()}
                      className="!w-auto"
                    >
                      Update Password
                    </PrimaryButton>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-1 text-sm font-semibold" style={{ color: B.blue }}>
                      Telegram OTP
                    </div>
                    <p className="mb-3 text-xs" style={{ color: B.muted }}>
                      {user?.telegramLinked
                        ? "Linked — login OTPs are sent to your Telegram."
                        : "Link Telegram to receive login OTPs until SMS is enabled."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!user?.telegramLinked ? (
                        <PrimaryButton
                          type="button"
                          variant="success"
                          size="sm"
                          loading={telegramBusy}
                          disabled={telegramBusy}
                          className="!w-auto"
                          onClick={() => {
                            void (async () => {
                              setTelegramBusy(true);
                              try {
                                const { data } = await api.post<
                                  ApiResponse<{ deepLink: string; expiresInSeconds: number }>
                                >("/auth/telegram/link");
                                if (!data.success || !data.data?.deepLink) {
                                  throw new Error(data.message || "Could not create Telegram link");
                                }
                                window.open(data.data.deepLink, "_blank", "noopener,noreferrer");
                                toast.success("Open Telegram and tap Start. Then refresh this page.");
                              } catch (err) {
                                toast.error(extractApiError(err, "Could not start Telegram link"));
                              } finally {
                                setTelegramBusy(false);
                              }
                            })();
                          }}
                        >
                          Link Telegram
                        </PrimaryButton>
                      ) : (
                        <PrimaryButton
                          type="button"
                          variant="destructive"
                          size="sm"
                          loading={telegramBusy}
                          disabled={telegramBusy}
                          className="!w-auto"
                          onClick={() => {
                            void (async () => {
                              setTelegramBusy(true);
                              try {
                                const { data } = await api.delete<ApiResponse<{ user: AuthUser }>>(
                                  "/auth/telegram/link",
                                );
                                if (!data.success || !data.data?.user) {
                                  throw new Error(data.message || "Could not unlink");
                                }
                                useAuthStore.getState().setUser(data.data.user);
                                toast.success("Telegram unlinked");
                              } catch (err) {
                                toast.error(extractApiError(err, "Could not unlink Telegram"));
                              } finally {
                                setTelegramBusy(false);
                              }
                            })();
                          }}
                        >
                          Unlink Telegram
                        </PrimaryButton>
                      )}
                      <PrimaryButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="!w-auto"
                        onClick={() => {
                          void (async () => {
                            try {
                              const { data } = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
                              if (data.success && data.data?.user) {
                                useAuthStore.setState({ user: data.data.user });
                                toast.success(
                                  data.data.user.telegramLinked ? "Telegram linked" : "Not linked yet",
                                );
                              }
                            } catch (err) {
                              toast.error(extractApiError(err, "Could not refresh status"));
                            }
                          })();
                        }}
                      >
                        Refresh status
                      </PrimaryButton>
                    </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-1 text-sm font-semibold" style={{ color: B.blue }}>
                      Transaction PIN
                    </div>
                    <div className="mb-3 text-xs" style={{ color: B.muted }}>
                      {user?.hasTxnPin
                        ? "PIN is set — update or reset from onboarding"
                        : "Set a PIN required for balance transfers"}
                    </div>
                    <PrimaryButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => router.push("/onboarding/pin")}
                      className="!w-auto"
                    >
                      {user?.hasTxnPin ? "Manage PIN" : "Set PIN"}
                    </PrimaryButton>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-1 text-sm font-semibold" style={{ color: B.blue }}>
                      Biometric login
                    </div>
                    <div className="mb-3 text-xs" style={{ color: B.muted }}>
                      Use Touch ID / Windows Hello to refresh your session on this device
                    </div>
                    <PrimaryButton
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={bioLoading || !isWebAuthnAvailable()}
                      loading={bioLoading}
                      onClick={() => void handleEnableBiometric()}
                      className="!w-auto"
                    >
                      Enable biometric
                    </PrimaryButton>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-1 text-sm font-semibold" style={{ color: B.blue }}>
                      Two-Factor Authentication
                    </div>
                    <div className="mb-3 text-xs" style={{ color: B.muted }}>
                      Add extra security with OTP on every login
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: B.blue }}>
                        Enable 2FA via SMS
                      </span>
                      <Toggle on={true} onToggle={() => {}} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {active === "banks" && (
              <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <SettlementBanksPanel />
              </div>
            )}

            {active === "notify" && (
              <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <h2 className="mb-5 text-lg font-bold" style={{ color: B.blue }}>
                  Notification Preferences
                </h2>
                <div className="space-y-4">
                  <div
                    className="flex items-center justify-between rounded-xl border p-4"
                    style={{ borderColor: B.border }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: B.blue }}>
                        Product updates
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: B.muted }}>
                        Rare AsanPay announcements (opt-in). Statements and security alerts always send to a verified email.
                      </div>
                    </div>
                    <Toggle
                      on={Boolean(user?.emailMarketingOptIn)}
                      onToggle={() => void toggleMarketingOptIn()}
                    />
                  </div>
                  {[
                    { key: "sms" as const, label: "SMS Alerts", sub: "Transaction confirmations via SMS" },
                    { key: "push" as const, label: "Push Notifications", sub: "Instant alerts on mobile app" },
                    { key: "txn" as const, label: "Transaction Alerts", sub: "Notify on every debit/credit" },
                    {
                      key: "commission" as const,
                      label: "Commission Updates",
                      sub: "Alert when commission is credited",
                    },
                  ].map((n) => (
                    <div
                      key={n.key}
                      className="flex items-center justify-between rounded-xl border p-4"
                      style={{ borderColor: B.border }}
                    >
                      <div>
                        <div className="text-sm font-semibold" style={{ color: B.blue }}>
                          {n.label}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: B.muted }}>
                          {n.sub}
                        </div>
                      </div>
                      <Toggle
                        on={notifs[n.key]}
                        onToggle={() => setNotifs((p) => ({ ...p, [n.key]: !p[n.key] }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {active === "devices" && (
              <div className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                  Logged-in Devices
                </h2>
                {[
                  { name: "Chrome · macOS", os: "Web", location: "Local", last: "Active now", current: true },
                  { name: "Chrome · Windows", os: "Windows 11", location: "Office", last: "2 hours ago", current: false },
                  { name: "Android App", os: "Android 14", location: "Mobile", last: "1 day ago", current: false },
                ].map((d) => (
                  <div
                    key={d.name}
                    className="flex items-center justify-between rounded-xl border p-4"
                    style={{ borderColor: B.border }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ background: B.secondary }}
                      >
                        <Smartphone size={18} style={{ color: B.blue }} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: B.blue }}>
                          {d.name}
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {d.os} · {d.location}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: d.current ? B.green : B.muted }}>
                          {d.last}
                        </div>
                      </div>
                    </div>
                    {!d.current && (
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50"
                        style={{ borderColor: "#DC262630", color: "#DC2626" }}
                      >
                        Remove
                      </button>
                    )}
                    {d.current && (
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{ background: `${B.green}15`, color: B.green }}
                      >
                        This Device
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {active === "devices" && (
              <div className="space-y-4">
                <BiometricDevices />
                <DeviceRepairRequests />
              </div>
            )}

            {active === "legal" && (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                  <h2 className="mb-4 text-lg font-bold" style={{ color: B.blue }}>
                    Legal and Help
                  </h2>
                  <div className="divide-y divide-[var(--agent-border)]" style={{ borderColor: B.border }}>
                    <Link href="/privacy" className="flex items-center gap-3 py-3.5">
                      <Shield size={18} style={{ color: B.blue }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold" style={{ color: B.blue }}>
                          Privacy policy
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          Learn how we protect your data
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: B.muted }} />
                    </Link>
                    <a
                      href="https://asanpay.in/about"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 py-3.5"
                    >
                      <Info size={18} style={{ color: B.blue }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold" style={{ color: B.blue }}>
                          About us
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          Learn about AsanPay
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: B.muted }} />
                    </a>
                    <Link href="/support" className="flex items-center gap-3 py-3.5">
                      <LifeBuoy size={18} style={{ color: B.blue }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold" style={{ color: B.blue }}>
                          Help & support
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          Talk to your upline or raise a ticket
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: B.muted }} />
                    </Link>
                  </div>
                </div>
                <FaqSection />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
