"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, Eye, EyeOff, Shield, ShieldCheck } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B, brand } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { SECURITY_PAGE, markTotpSetupRequired, onlyDigits } from "@/lib/adminTotp";
import { ThemeTabs } from "@/components/theme/ThemeTabs";

interface SessionData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  adminTotpSetupRequired?: boolean;
}

interface TotpChallengeData {
  totpRequired: true;
  challengeToken: string;
  expiresInSeconds: number;
}

type LoginResponseData = SessionData | TotpChallengeData;

function errMsg(err: unknown, fallback: string) {
  const ax = err as {
    code?: string;
    message?: string;
    response?: { data?: { message?: string } };
  };
  if (ax.response?.data?.message) return ax.response.data.message;
  if (ax.code === "ERR_NETWORK" || ax.message === "Network Error") {
    return "Backend not reachable — start API on :4000 then try again";
  }
  return fallback;
}

function errCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } }).response?.data?.code;
}

const inputStyle = {
  borderColor: "var(--admin-border)",
  background: "var(--admin-bg)",
  color: "var(--admin-text)",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) router.replace("/dashboard");
  }, [accessToken, router]);

  function finishSession(data: SessionData) {
    if (data.user.role !== "admin") {
      toast.error("Admin access only");
      return;
    }
    const mustSetUp = Boolean(data.adminTotpSetupRequired);
    markTotpSetupRequired(mustSetUp);
    setAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
    toast.success(`Welcome, ${data.user.name}`);
    router.replace(mustSetUp ? SECURITY_PAGE : "/dashboard");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/login", {
        username: username.trim(),
        password,
        portal: "admin",
      });
      if (!data.success) throw new Error(data.message);
      if ("totpRequired" in data.data) {
        setChallengeToken(data.data.challengeToken);
        setCode("");
        setCodeError(null);
        return;
      }
      finishSession(data.data);
    } catch (err) {
      toast.error(errMsg(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    if (code.length !== 6) {
      setCodeError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setLoading(true);
    setCodeError(null);
    try {
      const { data } = await api.post<ApiResponse<SessionData>>("/auth/admin/totp/verify", {
        challengeToken,
        code,
      });
      if (!data.success) throw new Error(data.message);
      finishSession(data.data);
    } catch (err) {
      const message = errMsg(err, "Incorrect 6-digit code. Check your authenticator app and try again.");
      const c = errCode(err);
      if (c === "ADMIN_TOTP_CHALLENGE_EXPIRED" || c === "ADMIN_LOCKED") {
        backToPassword();
        toast.error(message);
        return;
      }
      setCodeError(message);
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  function backToPassword() {
    setChallengeToken(null);
    setCode("");
    setCodeError(null);
    setPassword("");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4" style={{ background: "var(--admin-bg)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 20% 0%, ${B.blueLight}18, transparent), radial-gradient(ellipse 60% 40% at 90% 100%, ${B.green}14, transparent)`,
        }}
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeTabs />
      </div>

      <div
        className="relative w-full max-w-md rounded-2xl border p-8 shadow-xl backdrop-blur-xl"
        style={{
          borderColor: "var(--admin-border)",
          background: "color-mix(in srgb, var(--admin-card) 92%, transparent)",
        }}
      >
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white"
            style={{ background: B.badgeGrad }}
          >
            {challengeToken ? <ShieldCheck size={26} /> : <Shield size={26} />}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--admin-text)" }}>
            {challengeToken ? "Two-factor check" : `${brand.name} Admin`}
          </h1>
          {challengeToken ? (
            <p className="mt-2 text-sm" style={{ color: "var(--admin-muted)" }}>
              Open Google Authenticator or Microsoft Authenticator and enter the 6-digit code for {brand.name}.
            </p>
          ) : (
            <div
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-muted)" }}
            >
              <Shield size={12} />
              Restricted to platform administrators
            </div>
          )}
        </div>

        {challengeToken ? (
          <form onSubmit={onVerify} className="space-y-4" noValidate>
            <div>
              <label htmlFor="totp-code" className="mb-1.5 block text-sm" style={{ color: "var(--admin-muted)" }}>
                6-digit code
              </label>
              <input
                id="totp-code"
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(onlyDigits(e.target.value));
                  setCodeError(null);
                }}
                placeholder="123456"
                aria-invalid={Boolean(codeError)}
                aria-describedby="totp-code-help"
                className="w-full rounded-xl border px-4 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none"
                style={{ ...inputStyle, borderColor: codeError ? B.danger : "var(--admin-border)" }}
              />
              <p
                id="totp-code-help"
                className="mt-1.5 text-xs"
                style={{ color: codeError ? B.danger : "var(--admin-muted)" }}
              >
                {codeError ?? "The code changes every 30 seconds."}
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="admin-btn-primary w-full rounded-xl py-3.5 text-sm font-bold disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={backToPassword}
              className="mx-auto flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: "var(--admin-muted)" }}
            >
              <ArrowLeft size={14} />
              Back to password
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--admin-muted)" }}>
                Username
              </label>
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = B.blueLight;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-border)";
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm" style={{ color: "var(--admin-muted)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  required
                  autoComplete="current-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border px-4 py-3 pr-12 text-sm outline-none"
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = B.blueLight;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--admin-border)";
                  }}
                />
                <button
                  type="button"
                  className="icon-tooltip absolute right-3 top-1/2 z-10 -translate-y-1/2 p-1"
                  style={{ color: "var(--admin-muted)" }}
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  data-tooltip={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.badgeGrad }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
