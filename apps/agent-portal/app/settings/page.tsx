"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "react-hot-toast";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { EmailVerifyField } from "@/components/EmailVerifyField";
import { BiometricDevices } from "@/components/settings/BiometricDevices";
import { DeviceRepairRequests } from "@/components/settings/DeviceRepairRequests";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import api from "@/lib/api";
import { SignupStepper, SIGNUP_STEPS } from "@/components/signup/SignupStepper";
import { extractApiError, needsSignupKycCompletion } from "@/lib/onboarding";
import { loadSignupDraft } from "@/lib/signupDraft";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { enableBiometricLogin, isWebAuthnAvailable } from "@/lib/webauthn";

const SECTIONS = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "security", icon: Lock, label: "Security" },
  { id: "notify", icon: Bell, label: "Notifications" },
  { id: "kyc", icon: Shield, label: "KYC & Limits" },
  { id: "devices", icon: Smartphone, label: "Devices" },
];

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
  const [showPin, setShowPin] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [marketingBusy, setMarketingBusy] = useState(false);
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
    if (tab && SECTIONS.some((s) => s.id === tab)) setActive(tab);
  }, []);

  useEffect(() => {
    if (!user) return;
    const phone = (user.mobile || "").replace(/\D/g, "").slice(0, 10);
    const draft = (user.id && loadSignupDraft(user.id)) || (phone ? loadSignupDraft(phone) : null);
    const idx = draft?.stepIndex ?? 2;
    setSignupStepIndex(Math.max(2, Math.min(idx, SIGNUP_STEPS.length - 1)));
  }, [user, active]);

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
                  className="flex w-full items-center justify-between border-b px-4 py-3.5 text-left transition-all"
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
                  <ChevronRight size={13} style={{ color: B.muted }} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            {active === "profile" && (
              <div className="space-y-5 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                  Profile Information
                </h2>
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
                    <button type="button" className="mt-1 text-xs font-semibold" style={{ color: B.green }}>
                      Change Photo
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Full Name", value: name, type: "text" },
                    { label: "Mobile", value: mobile, type: "tel" },
                    { label: "UID", value: uid, type: "text", readOnly: true },
                    { label: "Role", value: role.label, type: "text", readOnly: true },
                    {
                      label: "Account Status",
                      value: user?.isActive ? "Active" : "Inactive",
                      type: "text",
                      readOnly: true,
                    },
                  ].map((f) => (
                    <div key={f.label}>
                      <label
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                        style={{ color: B.muted }}
                      >
                        {f.label}
                      </label>
                      <input
                        type={f.type}
                        defaultValue={f.value}
                        readOnly={"readOnly" in f ? f.readOnly : false}
                        className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none"
                        style={{ borderColor: B.border, background: B.bg, color: B.blue }}
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <EmailVerifyField
                      email={email}
                      onChange={setEmail}
                      inputClassName="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none"
                      inputStyle={{ borderColor: B.border, background: B.bg, color: B.blue }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
                  style={{ background: B.badgeGrad }}
                >
                  Save Changes
                </button>
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
                    {["Current Password", "New Password", "Confirm Password"].map((f) => (
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
                    <button
                      type="button"
                      className="rounded-xl px-5 py-2 text-sm font-semibold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      Update Password
                    </button>
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
                    <button
                      type="button"
                      onClick={() => router.push("/onboarding/pin")}
                      className="rounded-xl px-5 py-2 text-sm font-semibold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      {user?.hasTxnPin ? "Manage PIN" : "Set PIN"}
                    </button>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                    <div className="mb-1 text-sm font-semibold" style={{ color: B.blue }}>
                      Biometric login
                    </div>
                    <div className="mb-3 text-xs" style={{ color: B.muted }}>
                      Use Touch ID / Windows Hello to refresh your session on this device
                    </div>
                    <button
                      type="button"
                      disabled={bioLoading || !isWebAuthnAvailable()}
                      onClick={() => void handleEnableBiometric()}
                      className="rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ background: B.walletGrad }}
                    >
                      {bioLoading ? "Enabling…" : "Enable biometric"}
                    </button>
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

            {active === "kyc" && (
              <div className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
                <h2 className="text-lg font-bold" style={{ color: B.blue }}>
                  KYC & Transaction Limits
                </h2>

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
                        return (
                          <li
                            key={step.id}
                            className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                            style={{
                              borderColor: current ? B.blue : B.border,
                              background: current ? `${B.blue}08` : "#fff",
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
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      onClick={() => router.push("/signup?from=settings")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white"
                      style={{ background: B.badgeGrad }}
                    >
                      {user?.kycStatus === "rejected" ? "Resubmit KYC" : "Continue KYC"}
                      <ArrowRight size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: user?.kycStatus === "verified" ? B.green : "#FDBA74",
                        background: user?.kycStatus === "verified" ? `${B.green}08` : "#FFF7ED",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl"
                          style={{
                            background: user?.kycStatus === "verified" ? "#D1FAE5" : "#FFEDD5",
                          }}
                        >
                          <Check
                            size={18}
                            style={{
                              color: user?.kycStatus === "verified" ? "#059669" : "#EA580C",
                            }}
                          />
                        </div>
                        <div>
                          <div
                            className="text-sm font-bold"
                            style={{
                              color: user?.kycStatus === "verified" ? B.green : "#C2410C",
                            }}
                          >
                            {user?.kycStatus === "verified" ? "KYC Verified" : "KYC under review"}
                          </div>
                          <div className="text-xs" style={{ color: B.muted }}>
                            Status: {user?.kycStatus ?? "unknown"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {user?.role === "retailer" && user.hasInstantpayOutlet !== true ? (
                      <button
                        type="button"
                        onClick={() => router.push("/onboarding/outlet")}
                        className="flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all hover:shadow-md"
                        style={{ borderColor: B.blueLight, background: `${B.blue}06` }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{ background: B.badgeGrad }}
                          >
                            <FileText size={18} className="text-white" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold" style={{ color: B.blue }}>
                              Register outlet
                            </div>
                            <div className="text-xs" style={{ color: B.muted }}>
                              InstantPay Min-KYC — name, PAN, Aadhaar, shop geo
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={16} style={{ color: B.blueLight }} />
                      </button>
                    ) : null}

                    {user?.role === "retailer" && user.hasInstantpayOutlet === true ? (
                      <button
                        type="button"
                        onClick={() => router.push("/onboarding/bio-kyc")}
                        className="flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all hover:shadow-md"
                        style={{ borderColor: B.blueLight, background: `${B.blue}06` }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl"
                            style={{ background: B.badgeGrad }}
                          >
                            <Shield size={18} className="text-white" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold" style={{ color: B.blue }}>
                              Biometric KYC
                            </div>
                            <div className="text-xs" style={{ color: B.muted }}>
                              Fingerprint eKYC for AePS / DMT rails
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={16} style={{ color: B.blueLight }} />
                      </button>
                    ) : null}

                    <div className="space-y-3">
                      {[
                        { label: "Daily Transaction Limit", value: "₹2,00,000", used: "₹1,82,400", pct: 91 },
                        { label: "Monthly Transaction Limit", value: "₹50,00,000", used: "₹8,40,000", pct: 17 },
                        { label: "Max Single Transaction", value: "₹50,000", used: "₹25,000", pct: 50 },
                      ].map((l) => (
                        <div key={l.label} className="rounded-xl border p-4" style={{ borderColor: B.border }}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold" style={{ color: B.blue }}>
                              {l.label}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: B.muted }}>
                              {l.used} / {l.value}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${l.pct}%`,
                                background: l.pct > 80 ? "#DC2626" : B.green,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
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
          </div>
        </div>
      </div>
    </AppShell>
  );
}
