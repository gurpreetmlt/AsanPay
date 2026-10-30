"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
} from "lucide-react";
import { POLICY_VERSION, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { AsanPayLockup } from "@/components/brand/Logo";
import { LoginPolicyConsent } from "@/components/auth/LoginPolicyConsent";
import { PromoSlider } from "@/components/promos/PromoSlider";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { extractApiError, nextOnboardingPath } from "@/lib/onboarding";
import { authenticateBiometric, clearBiometricStore, getBiometricStore } from "@/lib/webauthn";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { clearRememberedLogin, getRememberedLogin, setRememberedLogin, type RememberedLogin } from "@/lib/rememberedLogin";
import { forgetPolicyAccepted, hasAcceptedCurrentPolicy, rememberPolicyAccepted } from "@/lib/policyConsent";

const POLICY_PAYLOAD = { acceptedPolicyVersion: POLICY_VERSION, policyChannel: "web" } as const;

function isPolicyRequiredError(err: unknown): boolean {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code === "POLICY_ACCEPTANCE_REQUIRED";
}

interface LoginResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

type OtpStep = "mobile" | "otp" | "pin";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [method, setMethod] = useState<"otp" | "password">("otp");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [otpStep, setOtpStep] = useState<OtpStep>("mobile");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<"mobile" | "otp">("mobile");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const [pending, setPending] = useState<LoginResponseData | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mpin, setMpin] = useState("");
  const [mpinFails, setMpinFails] = useState(0);
  const [remembered, setRemembered] = useState<RememberedLogin | null>(null);
  // Show the fast MPIN "welcome back" unlock when this browser has a remembered agent.
  const [unlockMode, setUnlockMode] = useState(false);
  // Gate first paint until the localStorage check below runs, so the page never flashes the
  // full OTP form for a moment before flipping to Welcome-back (or vice versa) right after logout.
  const [checkedRemembered, setCheckedRemembered] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const lastOtpSentKey = useRef<string | null>(null);

  useEffect(() => {
    const saved = getRememberedLogin();
    if (saved) {
      setRemembered(saved);
      setUnlockMode(true);
    }
    setPolicyAccepted(hasAcceptedCurrentPolicy());
    setCheckedRemembered(true);
  }, []);

  function onPolicyRequired() {
    forgetPolicyAccepted();
    setPolicyAccepted(false);
  }

  // lastOtpSentKey cleared when mobile shortened — used to avoid stale resend state.
  useEffect(() => {
    if (mobile.length < 10) lastOtpSentKey.current = null;
  }, [mobile]);

  function finishLogin(data: LoginResponseData) {
    setAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
    // Remember this agent so next time (on this trusted browser) we can offer MPIN, not OTP.
    setRememberedLogin({ mobile: data.user.mobile, name: data.user.name });
    rememberPolicyAccepted();
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
    if (!remembered || mpin.length !== 4 || !policyAccepted) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/mpin/login", {
        mobile: remembered.mobile,
        mpin,
        portal: "agent",
        deviceId: getDeviceId(),
        ...POLICY_PAYLOAD,
      });
      if (!data.success) throw new Error(data.message);
      setMpinFails(0);
      finishLogin(data.data);
    } catch (err) {
      if (isPolicyRequiredError(err)) {
        onPolicyRequired();
        toast.error(extractApiError(err, "Accept the Terms & Conditions and Privacy Policy to continue"));
        return;
      }
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
            ? "MPIN not set — please login with OTP or password first"
            : "Verify with OTP or password on this browser — then MPIN will work",
        );
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      // Server/DB faults are not "wrong MPIN" — don't append the forgot-PIN hint.
      if (status === 500 || code === "DB_SCHEMA_OUTDATED" || /internal server error|out of date/i.test(message)) {
        toast.error(
          code === "DB_SCHEMA_OUTDATED" || /out of date/i.test(message)
            ? "Server DB update pending — please login with OTP"
            : "Server error on MPIN — please login with OTP or password",
        );
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      const nextFails = mpinFails + 1;
      setMpinFails(nextFails);
      setMpin("");
      if (nextFails >= 2) {
        toast.error("MPIN didn't match — please login with OTP");
        leaveWelcomeBackForOtp(remembered.mobile);
        return;
      }
      toast.error(`${extractApiError(err, "Incorrect MPIN")} — forgot it? Use OTP instead`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || !password || !policyAccepted) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/login", {
        mobile,
        password,
        portal: "agent",
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
        ...POLICY_PAYLOAD,
      });
      if (!data.success) throw new Error(data.message);
      finishLogin(data.data);
    } catch (err) {
      if (isPolicyRequiredError(err)) onPolicyRequired();
      toast.error(extractApiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    if (e) lastOtpSentKey.current = null;
    if (!mobile || mobile.length !== 10) {
      toast.error("Enter a valid 10-digit mobile");
      return;
    }
    if (!policyAccepted) {
      toast.error("Tick the box to accept the Terms & Conditions and Privacy Policy");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ otp?: string; message: string }>>("/auth/otp/request", {
        mobile,
        portal: "agent",
      });
      if (!data.success) throw new Error(data.message);
      lastOtpSentKey.current = mobile;
      setOtpStep("otp");
      setOtp("");
      setResendIn(30);
      setDevOtp(data.data.otp ?? null);
      toast.success(
        data.data.otp
          ? `Dev OTP: ${data.data.otp}`
          : data.data.message || data.message || "OTP has been sent on WhatsApp",
      );
    } catch (err) {
      lastOtpSentKey.current = mobile;
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || otp.length !== 6 || !policyAccepted) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/otp/verify", {
        mobile,
        otp,
        portal: "agent",
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
        ...POLICY_PAYLOAD,
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
      if (isPolicyRequiredError(err)) onPolicyRequired();
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
      // The session cookie was already set server-side when /auth/otp/verify ran — no bearer
      // token needed here, the proxy authenticates this request from the cookie.
      await api.post("/auth/txn-pin/verify", { pin });
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
        toast.error("OTP se pehle login karke Settings → Enable biometric");
        return;
      }
      await authenticateBiometric();
      // The session already lives in this browser's httpOnly cookies from the last real login —
      // biometrics is just a local unlock gate. /auth/me confirms + refreshes it (proxy
      // silently re-issues the access cookie from the refresh cookie on a 401).
      try {
        const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
        if (!me.data.success) throw new Error(me.data.message);
        finishLogin({ user: me.data.data.user, accessToken: "cookie", refreshToken: "cookie" });
      } catch {
        // No valid session cookie left (expired refresh cookie, cleared cookies, etc.) —
        // biometric unlock has nothing to unlock; fall back to a full login.
        clearBiometricStore();
        toast.error("Session expired — please log in again");
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
    setForgotMode(false);
    setForgotStep("mobile");
    setNewPassword("");
    setConfirmPassword("");
  }

  function openForgotPassword() {
    setForgotMode(true);
    setForgotStep("mobile");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setDevOtp(null);
    setResendIn(0);
  }

  function closeForgotPassword() {
    setForgotMode(false);
    setForgotStep("mobile");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setDevOtp(null);
    setMethod("password");
  }

  async function requestForgotOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!mobile || mobile.length !== 10) {
      toast.error("Enter a valid 10-digit mobile");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ otp?: string; message: string }>>(
        "/auth/password/forgot/request",
        { mobile, portal: "agent" },
      );
      if (!data.success) throw new Error(data.message);
      setForgotStep("otp");
      setOtp("");
      setResendIn(30);
      setDevOtp(data.data.otp ?? null);
      toast.success(
        data.data.otp
          ? `Dev OTP: ${data.data.otp}`
          : data.data.message || data.message || "OTP has been sent on WhatsApp",
      );
    } catch (err) {
      toast.error(extractApiError(err, "OTP request failed"));
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotReset(e?: FormEvent) {
    e?.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword)) {
      toast.error("Password must contain a letter");
      return;
    }
    if (!/\d/.test(newPassword)) {
      toast.error("Password must contain a number");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ message: string }>>("/auth/password/forgot/reset", {
        mobile,
        otp,
        newPassword,
        portal: "agent",
      });
      if (!data.success) throw new Error(data.message);
      toast.success(data.data.message || data.message || "Password updated. Sign in with your new password.");
      setPassword("");
      closeForgotPassword();
    } catch (err) {
      toast.error(extractApiError(err, "Password reset failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!checkedRemembered) return null;

  return (
    <div className="flex min-h-screen w-full font-sans">
      {/* 1. Promo slider — gap from body + blue→green gradient border */}
      <div
        className="relative hidden min-h-screen min-w-0 flex-1 p-5 lg:flex lg:flex-col"
        style={{ background: B.bg, minWidth: 0 }}
      >
        <div
          className="relative min-h-0 flex-1 rounded-2xl p-[3px] shadow-md"
          style={{
            background: `linear-gradient(135deg, ${B.blue} 0%, ${B.blueLight} 42%, ${B.green} 100%)`,
          }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[13px] bg-[#0B2A9A]">
            <PromoSlider
              placement="login"
              fill
              intervalMs={6000}
              className="h-full min-h-full w-full rounded-none shadow-none"
            />
          </div>
        </div>
      </div>

      {/* 2. Login — a bit wider */}
      <div
        className="flex min-h-screen w-full flex-shrink-0 items-center justify-center px-5 py-8 sm:px-8 lg:w-[560px] xl:w-[600px]"
        style={{ background: "#fff" }}
      >
        <div className="login-panel-animate w-full max-w-[480px]">
          <div className="mb-7">
            <AsanPayLockup width={250} light={false} animate showTagline />
          </div>

          {forgotMode ? (
            <>
              <h2 className="mb-1 text-2xl font-bold" style={{ color: B.blue }}>
                Reset password
              </h2>
              <p className="mb-7 text-sm" style={{ color: B.muted }}>
                We will send a 6-digit OTP to verify your mobile, then you set a new password.
              </p>
              {forgotStep === "mobile" ? (
                <form onSubmit={requestForgotOtp} className="mb-6 space-y-4">
                  <MobileField mobile={mobile} setMobile={setMobile} />
                  <SubmitBtn loading={loading} label="Send OTP" />
                  <button
                    type="button"
                    className="w-full text-xs font-medium"
                    style={{ color: B.muted }}
                    onClick={closeForgotPassword}
                  >
                    Back to login
                  </button>
                </form>
              ) : (
                <form onSubmit={submitForgotReset} className="mb-6 space-y-4">
                  {devOtp ? (
                    <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: `${B.green}15`, color: B.greenDark }}>
                      Dev OTP: {devOtp}
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      6-digit OTP
                    </label>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="w-full rounded-2xl border-2 bg-white px-4 py-3 text-center text-lg tracking-[0.35em] outline-none"
                      style={{ borderColor: B.border, color: B.blue }}
                      placeholder="••••••"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      New password
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border-2 bg-white px-4 py-3" style={{ borderColor: B.border }}>
                      <Lock size={15} style={{ color: B.muted }} />
                      <input
                        type={showNewPass ? "text" : "password"}
                        required
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none"
                        style={{ color: B.blue }}
                      />
                      <button type="button" onClick={() => setShowNewPass(!showNewPass)} aria-label={showNewPass ? "Hide password" : "Show password"}>
                        {showNewPass ? <EyeOff size={15} style={{ color: B.muted }} /> : <Eye size={15} style={{ color: B.muted }} />}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs" style={{ color: B.muted }}>
                      Min 8 characters · include a letter and a number (e.g. Test1234)
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
                      Confirm password
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border-2 bg-white px-4 py-3" style={{ borderColor: B.border }}>
                      <Lock size={15} style={{ color: B.muted }} />
                      <input
                        type={showNewPass ? "text" : "password"}
                        required
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="flex-1 bg-transparent text-sm outline-none"
                        style={{ color: B.blue }}
                      />
                    </div>
                  </div>
                  <SubmitBtn loading={loading} label="Update password" />
                  <button
                    type="button"
                    className="w-full text-xs font-medium"
                    style={{ color: B.muted }}
                    disabled={loading || resendIn > 0}
                    onClick={() => void requestForgotOtp()}
                  >
                    {resendIn > 0 ? `Resend OTP in 0:${String(resendIn).padStart(2, "0")}` : "Resend OTP"}
                  </button>
                  <button
                    type="button"
                    className="w-full text-xs font-medium"
                    style={{ color: B.muted }}
                    onClick={closeForgotPassword}
                  >
                    Back to login
                  </button>
                </form>
              )}
            </>
          ) : unlockMode && remembered ? (
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
              <div className="mb-4">
                <LoginPolicyConsent checked={policyAccepted} onChange={setPolicyAccepted} />
              </div>
              <SubmitBtn loading={loading} label="Unlock with MPIN" disabled={!policyAccepted} />
              {getBiometricStore() ? (
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  showArrow={false}
                  disabled={loading || !policyAccepted}
                  onClick={handleBiometric}
                  className="mt-3 gap-2"
                >
                  <Fingerprint size={18} style={{ color: B.blue }} />
                  Use Fingerprint / Face instead
                </PrimaryButton>
              ) : null}
              <button
                type="button"
                className="mt-4 w-full text-xs font-medium"
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
                className="mt-2 w-full text-xs font-medium"
                style={{ color: B.muted }}
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
            Preferred: <strong style={{ color: B.blue }}>OTP</strong> — fast & secure
          </p>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: B.secondary }}>
            {(
              [
                { id: "otp" as const, label: "OTP" },
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
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="icon-tooltip"
                    aria-label={showPass ? "Hide password" : "Show password"}
                    data-tooltip={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? <EyeOff size={15} style={{ color: B.muted }} /> : <Eye size={15} style={{ color: B.muted }} />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: B.blue }}
                onClick={openForgotPassword}
              >
                Forgot password?
              </button>
              <LoginPolicyConsent checked={policyAccepted} onChange={setPolicyAccepted} />
              <SubmitBtn loading={loading} label="Login" disabled={!policyAccepted} />
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
                    Enter your PIN
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
              <SubmitBtn loading={loading} label="Unlock with PIN" />
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
                    <p className="mt-2 text-center text-xs" style={{ color: B.muted }}>
                      OTP is sent on WhatsApp. Not received? Tap Resend OTP or use Password login.
                    </p>
                  </div>
                </>
              )}
              <LoginPolicyConsent checked={policyAccepted} onChange={setPolicyAccepted} />
              <SubmitBtn
                loading={loading}
                disabled={!policyAccepted || (otpStep === "mobile" && mobile.length !== 10)}
                label={otpStep === "otp" ? "Verify OTP" : "Continue"}
              />
              {otpStep === "mobile" && mobile.length < 10 ? (
                <p className="text-center text-xs" style={{ color: B.muted }}>
                  Enter 10-digit mobile, then tap Continue to send OTP
                </p>
              ) : null}
              {otpStep === "otp" && (
                <div className="flex items-center justify-between text-sm font-medium">
                  <button
                    type="button"
                    className="cursor-pointer"
                    style={{ color: B.muted }}
                    onClick={() => {
                      setOtpStep("mobile");
                      setOtp("");
                      setDevOtp(null);
                      setResendIn(0);
                      lastOtpSentKey.current = null;
                    }}
                  >
                    Change mobile
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer font-semibold disabled:cursor-not-allowed"
                    style={{ color: resendIn > 0 || loading ? B.muted : B.green }}
                    disabled={resendIn > 0 || loading}
                    onClick={() => {
                      lastOtpSentKey.current = null;
                      void requestOtp();
                    }}
                  >
                    {resendIn > 0 ? `Resend OTP in 0:${String(resendIn).padStart(2, "0")}` : "Resend OTP"}
                  </button>
                </div>
              )}
            </form>
          )}

          <PrimaryButton
            type="button"
            variant="secondary"
            showArrow={false}
            disabled={loading || !policyAccepted}
            onClick={handleBiometric}
            className="mb-4 gap-2"
          >
            <Fingerprint size={20} style={{ color: B.blue }} />
            Biometric Login
          </PrimaryButton>
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

function SubmitBtn({ loading, label, disabled }: { loading: boolean; label: string; disabled?: boolean }) {
  return (
    <PrimaryButton type="submit" loading={loading} disabled={disabled} loopGlow>
      {label}
    </PrimaryButton>
  );
}
