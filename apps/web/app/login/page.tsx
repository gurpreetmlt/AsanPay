"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  Crown,
  Network,
  Store,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Fingerprint,
  Shield,
  Check,
  KeyRound,
} from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AsanPayLogo } from "@/components/brand/Logo";
import api from "@/lib/api";
import { B, ROLES, type Role } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { extractApiError, nextOnboardingPath } from "@/lib/onboarding";
import { authenticateBiometric, getBiometricStore } from "@/lib/webauthn";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { clearRememberedLogin, getRememberedLogin, setRememberedLogin, type RememberedLogin } from "@/lib/rememberedLogin";

interface LoginResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

type OtpStep = "mobile" | "otp" | "pin";

const ROLE_ICONS = { super: Crown, distributor: Network, retailer: Store } as const;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [role, setRole] = useState<Role>(ROLES[0]);
  const [method, setMethod] = useState<"otp" | "password">("otp");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("mobile");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [pending, setPending] = useState<LoginResponseData | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mpin, setMpin] = useState("");
  const [mpinFails, setMpinFails] = useState(0);
  const [remembered, setRemembered] = useState<RememberedLogin | null>(null);
  // Show the fast MPIN "welcome back" unlock when this browser has a remembered agent.
  const [unlockMode, setUnlockMode] = useState(false);

  useEffect(() => {
    const saved = getRememberedLogin();
    if (saved) {
      setRemembered(saved);
      setUnlockMode(true);
    }
  }, []);

  function finishLogin(data: LoginResponseData) {
    setAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
    // Remember this agent so next time (on this trusted browser) we can offer MPIN, not OTP.
    setRememberedLogin({ mobile: data.user.mobile, name: data.user.name });
    toast.success(`Welcome back, ${data.user.name}`);
    router.replace(nextOnboardingPath(data.user) ?? "/dashboard");
  }

  function switchToFullLogin() {
    clearRememberedLogin();
    setRemembered(null);
    setUnlockMode(false);
    setMpin("");
    setMobile("");
    setOtp("");
    setOtpStep("mobile");
    setDevOtp(null);
  }

  function leaveWelcomeBackForOtp(mobileHint: string) {
    setMobile(mobileHint);
    setMpin("");
    setMpinFails(0);
    setUnlockMode(false);
    setMethod("otp");
    setOtpStep("mobile");
    setDevOtp(null);
  }

  async function unlockWithMpin(e?: FormEvent) {
    e?.preventDefault();
    if (!remembered || mpin.length !== 4) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/mpin/login", {
        mobile: remembered.mobile,
        mpin,
        portal: "agent",
        deviceId: getDeviceId(),
      });
      if (!data.success) throw new Error(data.message);
      setMpinFails(0);
      finishLogin(data.data);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const body = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
      const code = body?.code;
      const message = body?.message ?? (err instanceof Error ? err.message : "");
      // Trust window expired / never trusted / MPIN not set → leave welcome-back, force OTP.
      // Also match message text in case a proxy strips `code`.
      const needsOtp =
        code === "DEVICE_NOT_TRUSTED" ||
        code === "MPIN_NOT_SET" ||
        /session expired|not trusted|mpin is not set|verify with otp|24h/i.test(message);
      if (needsOtp) {
        toast.error(
          code === "MPIN_NOT_SET" || /not set/i.test(message)
            ? "MPIN set nahi hai — pehle OTP ya password se login karein"
            : "Is browser pe OTP ya password se verify karein — phir MPIN chalega",
        );
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      // Server/DB faults are not "wrong MPIN" — don't append the forgot-PIN hint.
      if (status === 500 || code === "DB_SCHEMA_OUTDATED" || /internal server error|out of date/i.test(message)) {
        toast.error(
          code === "DB_SCHEMA_OUTDATED" || /out of date/i.test(message)
            ? "Server DB update pending — OTP se login karein"
            : "Server error on MPIN — OTP ya password se login karein",
        );
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      const nextFails = mpinFails + 1;
      setMpinFails(nextFails);
      setMpin("");
      if (nextFails >= 2) {
        toast.error("MPIN match nahi hua — OTP se login karein");
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      toast.error(`${extractApiError(err, "Incorrect MPIN")} — bhool gaye ho to Use OTP instead`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || !password) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/login", {
        mobile,
        password,
        portal: "agent",
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);
      finishLogin(data.data);
    } catch (err) {
      toast.error(extractApiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || mobile.length !== 10) {
      toast.error("Enter a valid 10-digit mobile");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ otp?: string; message: string }>>("/auth/otp/request", {
        mobile,
        portal: "agent",
      });
      if (!data.success) throw new Error(data.message);
      setOtpStep("otp");
      setDevOtp(data.data.otp ?? null);
      toast.success(data.data.otp ? `Dev OTP: ${data.data.otp}` : "OTP sent");
    } catch (err) {
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || otp.length !== 6) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/otp/verify", {
        mobile,
        otp,
        portal: "agent",
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);

      if (data.data.user.hasTxnPin === true) {
        setPending(data.data);
        setOtpStep("pin");
        toast.success("OTP verified — enter your PIN");
      } else {
        // No PIN yet → session + force set-PIN / KYC via onboarding
        finishLogin(data.data);
      }
    } catch (err) {
      toast.error(extractApiError(err, "Incorrect OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyPin(e?: FormEvent) {
    e?.preventDefault();
    if (!pending || pin.length !== 4) return;
    setLoading(true);
    try {
      await api.post(
        "/auth/txn-pin/verify",
        { pin },
        { headers: { Authorization: `Bearer ${pending.accessToken}` } },
      );
      finishLogin(pending);
    } catch (err) {
      toast.error(extractApiError(err, "Incorrect PIN"));
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    setLoading(true);
    try {
      if (!getBiometricStore()) {
        toast.error("OTP + PIN se pehle login karke Settings → Enable biometric");
        return;
      }
      const bio = await authenticateBiometric();
      const { data } = await api.post<ApiResponse<{ accessToken: string; refreshToken: string }>>("/auth/refresh", {
        refreshToken: bio.refreshToken,
      });
      if (!data.success) throw new Error(data.message);
      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me", {
        headers: { Authorization: `Bearer ${data.data.accessToken}` },
      });
      if (me.data.success) {
        finishLogin({
          user: me.data.data.user,
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken,
        });
      }
    } catch (err) {
      toast.error(extractApiError(err, err instanceof Error ? err.message : "Biometric login failed"));
    } finally {
      setLoading(false);
    }
  }

  function switchMethod(next: "otp" | "password") {
    setMethod(next);
    setOtpStep("mobile");
    setPending(null);
    setOtp("");
    setPin("");
    setDevOtp(null);
  }

  return (
    <div className="flex min-h-screen w-full font-sans">
      <div
        className="relative hidden w-[460px] flex-shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex"
        style={{ background: role.gradient }}
      >
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white opacity-10" />
        <div className="absolute -left-20 top-1/2 h-56 w-56 rounded-full bg-white opacity-10" />
        <div className="relative z-10">
          <AsanPayLogo width={230} variant="light" />
        </div>
        <div className="relative z-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5">
            {(() => {
              const Icon = ROLE_ICONS[role.id];
              return <Icon size={13} className="text-white" />;
            })()}
            <span className="text-xs font-semibold text-white">{role.label} Portal</span>
          </div>
          <h1 className="mb-4 font-bold text-white" style={{ fontSize: "2.2rem", lineHeight: 1.18 }}>
            Har Kadam
            <br />
            Tarakki Ki Or
          </h1>
          <p className="mb-8 text-sm leading-relaxed text-white/70">
            Easy login: mobile OTP verify karein, phir apna 4-digit PIN. Password optional hai.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <Shield size={13} className="text-white/40" />
          <span className="text-xs text-white/40">OTP · PIN · Biometric</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-8 lg:p-12" style={{ background: B.bg }}>
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <AsanPayLogo width={190} />
          </div>

          {unlockMode && remembered ? (
            <form onSubmit={unlockWithMpin}>
              <h2 className="mb-1 text-2xl font-bold" style={{ color: B.blue }}>
                Welcome back, {remembered.name.split(" ")[0]}
              </h2>
              <p className="mb-7 text-sm" style={{ color: B.muted }}>
                Enter your <strong style={{ color: B.blue }}>4-digit MPIN</strong> for +91 {remembered.mobile}
              </p>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                Login MPIN
              </label>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={4}
                value={mpin}
                onChange={(e) => setMpin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="mb-4 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-center text-2xl tracking-[0.5em] outline-none"
                style={{ borderColor: B.border, color: B.blue }}
                placeholder="••••"
              />
              <SubmitBtn loading={loading} label="Unlock with MPIN" color={role.color} gradient={role.gradient} />
              <button
                type="button"
                className="mt-4 w-full text-sm font-medium"
                style={{ color: B.muted }}
                onClick={() => {
                  setMobile(remembered.mobile);
                  setUnlockMode(false);
                  void requestOtp();
                }}
              >
                Use OTP instead
              </button>
              <button
                type="button"
                className="mt-2 w-full text-sm font-semibold"
                style={{ color: role.color }}
                onClick={switchToFullLogin}
              >
                Not you? Use a different number
              </button>
            </form>
          ) : (
          <>
          <h2 className="mb-1 text-2xl font-bold" style={{ color: B.blue }}>
            Sign in to your account
          </h2>
          <p className="mb-7 text-sm" style={{ color: B.muted }}>
            Preferred: <strong style={{ color: B.blue }}>OTP + PIN</strong> — fast & secure
          </p>

          <div className="mb-6 grid grid-cols-3 gap-2">
            {ROLES.map((r) => {
              const Icon = ROLE_ICONS[r.id];
              const active = role.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    // Fresh login on manual role switch — don't carry the previous role's number.
                    if (r.id !== role.id) {
                      setMobile("");
                      setOtpStep("mobile");
                      setOtp("");
                      setDevOtp(null);
                    }
                    setRole(r);
                  }}
                  className="relative flex flex-col items-center gap-2 rounded-2xl border-2 p-3.5"
                  style={{
                    borderColor: active ? r.color : B.border,
                    background: active ? `${r.color}0E` : "#fff",
                  }}
                >
                  {active && (
                    <div
                      className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full"
                      style={{ background: r.color }}
                    >
                      <Check size={9} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: active ? r.gradient : `${r.color}15` }}
                  >
                    <Icon size={18} style={{ color: active ? "#fff" : r.color }} />
                  </div>
                  <span className="text-center text-xs font-semibold" style={{ color: active ? r.color : B.muted }}>
                    {r.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: B.secondary }}>
            {(
              [
                { id: "otp" as const, label: "OTP + PIN" },
                { id: "password" as const, label: "Password" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMethod(m.id)}
                className="rounded-xl py-2 text-sm font-semibold"
                style={{
                  background: method === m.id ? "#fff" : "transparent",
                  color: method === m.id ? B.blue : B.muted,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === "password" ? (
            <form onSubmit={handlePasswordLogin} className="mb-6 space-y-4">
              <MobileField mobile={mobile} setMobile={setMobile} />
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                  Password
                </label>
                <div className="flex items-center gap-2 rounded-2xl border-2 bg-white px-4 py-3" style={{ borderColor: B.border }}>
                  <Lock size={15} style={{ color: B.muted }} />
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: B.blue }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={15} style={{ color: B.muted }} /> : <Eye size={15} style={{ color: B.muted }} />}
                  </button>
                </div>
              </div>
              <p className="text-xs" style={{ color: B.muted }}>
                Tip: OTP + PIN easier hai — password bhool gaye ho to wahan se login karo.
              </p>
              <SubmitBtn loading={loading} label={`Login as ${role.label}`} color={role.color} gradient={role.gradient} />
            </form>
          ) : otpStep === "pin" && pending ? (
            <form onSubmit={verifyPin} className="mb-6 space-y-4">
              <div
                className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: B.border, background: `${B.green}10` }}
              >
                <KeyRound size={18} style={{ color: B.green, marginTop: 2 }} />
                <div>
                  <div className="text-sm font-bold" style={{ color: B.blue }}>
                    Enter transaction PIN
                  </div>
                  <div className="text-xs" style={{ color: B.muted }}>
                    OTP verified for {pending.user.mobile}. PIN unlocks your session.
                  </div>
                </div>
              </div>
              <input
                required
                autoFocus
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-center text-2xl tracking-[0.5em] outline-none"
                style={{ borderColor: B.border, color: B.blue }}
                placeholder="••••"
              />
              <SubmitBtn loading={loading} label="Unlock with PIN" color={role.color} gradient={role.gradient} />
              <button
                type="button"
                className="w-full text-sm font-medium"
                style={{ color: B.muted }}
                onClick={() => {
                  setPending(null);
                  setPin("");
                  setOtpStep("mobile");
                  setOtp("");
                }}
              >
                Back to OTP
              </button>
            </form>
          ) : (
            <form onSubmit={otpStep === "otp" ? verifyOtp : requestOtp} className="mb-6 space-y-4">
              <MobileField mobile={mobile} setMobile={setMobile} disabled={otpStep === "otp"} />
              {otpStep === "otp" && (
                <>
                  {devOtp && (
                    <div
                      className="rounded-xl px-3 py-2 text-xs font-semibold"
                      style={{ background: `${B.green}18`, color: B.greenDark }}
                    >
                      Dev OTP: {devOtp}
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      6-digit OTP
                    </label>
                    <input
                      required
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-lg tracking-[0.4em] outline-none"
                      style={{ borderColor: B.border, color: B.blue }}
                      placeholder="••••••"
                    />
                  </div>
                </>
              )}
              <SubmitBtn
                loading={loading}
                label={otpStep === "otp" ? "Verify OTP" : "Send OTP"}
                color={role.color}
                gradient={role.gradient}
              />
              {otpStep === "otp" && (
                <button
                  type="button"
                  className="w-full text-sm font-medium"
                  style={{ color: B.muted }}
                  onClick={() => {
                    setOtpStep("mobile");
                    setOtp("");
                    setDevOtp(null);
                  }}
                >
                  Change mobile
                </button>
              )}
            </form>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={handleBiometric}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white py-3 disabled:opacity-60"
            style={{ borderColor: B.border }}
          >
            <Fingerprint size={20} style={{ color: role.color }} />
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Biometric Login
            </span>
          </button>

          <p className="text-center text-xs" style={{ color: B.muted }}>
            New agent?{" "}
            <Link href="/signup" className="font-semibold" style={{ color: role.color }}>
              Sign up with OTP
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileField({
  mobile,
  setMobile,
  disabled,
}: {
  mobile: string;
  setMobile: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
        Mobile Number
      </label>
      <div
        className="flex items-center gap-2 rounded-2xl border-2 bg-white px-4 py-3"
        style={{ borderColor: B.border, opacity: disabled ? 0.7 : 1 }}
      >
        <Phone size={15} style={{ color: B.muted }} />
        <span className="mr-1 border-r pr-2 text-sm font-semibold" style={{ color: B.muted, borderColor: B.border }}>
          +91
        </span>
        <input
          type="tel"
          maxLength={10}
          required
          disabled={disabled}
          placeholder="10-digit mobile number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          className="flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          style={{ color: B.blue }}
        />
      </div>
    </div>
  );
}

function SubmitBtn({
  loading,
  label,
  color,
  gradient,
}: {
  loading: boolean;
  label: string;
  color: string;
  gradient: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white"
      style={{ background: gradient, boxShadow: `0 8px 24px ${color}40`, opacity: loading ? 0.8 : 1 }}
    >
      {loading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <>
          {label} <ArrowRight size={16} />
        </>
      )}
    </button>
  );
}
