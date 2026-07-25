"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import clsx from "clsx";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import api from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";

interface LoginResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

const RESEND_COOLDOWN_SECONDS = 30;

function extractErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [method, setMethod] = useState<"password" | "otp">("password");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function completeLogin(data: LoginResponseData) {
    if (data.user.role === "retailer") {
      toast.error("This portal is for Master Distributors and Distributors only");
      return;
    }
    setAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
    toast.success(`Welcome back, ${data.user.name}`);
    router.replace("/dashboard");
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/login", { mobile, password });
      if (!data.success) throw new Error(data.message);
      completeLogin(data.data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ message: string; otp?: string; expiresInSeconds: number }>>(
        "/auth/otp/request",
        { mobile },
      );
      if (!data.success) throw new Error(data.message);
      setOtpSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (data.data.otp) {
        // No SMS provider wired yet — dev/test builds echo the OTP back so the flow is usable
        // end-to-end. Shown on screen and auto-filled, same as legacy retail prototype's dev-mode OTP.
        toast.success(`Dev OTP: ${data.data.otp}`, { duration: 15000 });
        setDevOtp(data.data.otp);
        setOtp(data.data.otp);
      } else {
        toast.success("OTP sent to your registered mobile number");
        setDevOtp(null);
        setTimeout(() => otpInputRef.current?.focus(), 0);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<LoginResponseData>>("/auth/otp/verify", {
        mobile,
        otp,
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);
      completeLogin(data.data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "OTP verification failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="bg-gradient-to-r from-[#c8102e] to-brand-600 bg-clip-text text-2xl font-bold text-transparent">
            AsanPay
          </h1>
          <p className="mt-1 text-sm text-gray-500">Partner Login</p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-lg bg-surface p-1 text-sm font-medium">
          {(["password", "otp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setOtpSent(false);
                setOtp("");
                setDevOtp(null);
              }}
              className={clsx(
                "rounded-md py-1.5 transition",
                method === m ? "bg-white text-brand-600 shadow-sm" : "text-gray-500 hover:text-gray-700",
              )}
            >
              {m === "password" ? "Password" : "Sign-in Code"}
            </button>
          ))}
        </div>

        {method === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="mobile" className="mb-1 block text-sm font-medium text-gray-700">
                Mobile Number
              </label>
              <input
                id="mobile"
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                placeholder="9876543210"
                className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={otpSent ? handleVerifyOtp : (e) => e.preventDefault()} className="space-y-4">
            <div>
              <label htmlFor="otp-mobile" className="mb-1 block text-sm font-medium text-gray-700">
                Mobile Number
              </label>
              <input
                id="otp-mobile"
                type="tel"
                required
                disabled={otpSent}
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                placeholder="9876543210"
                className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-surface disabled:text-gray-500"
              />
            </div>

            {devOtp && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-700">
                Dev mode — no SMS sent. Your code is <span className="font-bold tracking-wider">{devOtp}</span>
              </p>
            )}

            {otpSent && (
              <div>
                <label htmlFor="otp" className="mb-1 block text-sm font-medium text-gray-700">
                  6-Digit Code
                </label>
                <input
                  ref={otpInputRef}
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}

            {!otpSent ? (
              <button
                type="button"
                disabled={loading || mobile.length !== 10}
                onClick={handleSendOtp}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {loading ? "Verifying..." : "Verify & Sign In"}
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || loading}
                  onClick={handleSendOtp}
                  className="w-full text-center text-xs font-medium text-brand-600 disabled:text-gray-400"
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
