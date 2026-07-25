"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, Shield } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { ThemeTabs } from "@/components/theme/ThemeTabs";

interface LoginResponseData {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

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

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (accessToken) router.replace("/dashboard");
  }, [accessToken, router]);

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
      if (data.data.user.role !== "admin") {
        toast.error("Admin access only");
        return;
      }
      setAuth(data.data.user, {
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      });
      toast.success(`Welcome, ${data.data.user.name}`);
      router.replace("/dashboard");
    } catch (err) {
      toast.error(errMsg(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4" style={{ background: "var(--admin-bg)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 20% 0%, ${B.blue}18, transparent), radial-gradient(ellipse 60% 40% at 90% 100%, ${B.green}14, transparent)`,
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
            <Shield size={26} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--admin-text)" }}>
            AsanPay Admin
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--admin-muted)" }}>
            Platform control only · Not for Super Dist / Dist / Retailer
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--admin-muted)" }}>
            Use provisioned admin credentials. No default password is displayed in UI.
          </p>
        </div>

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
              style={{
                borderColor: "var(--admin-border)",
                background: "var(--admin-bg)",
                color: "var(--admin-text)",
              }}
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
                style={{
                  borderColor: "var(--admin-border)",
                  background: "var(--admin-bg)",
                  color: "var(--admin-text)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = B.blueLight;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-border)";
                }}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--admin-muted)" }}
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Hide password" : "Show password"}
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
      </div>
    </div>
  );
}
