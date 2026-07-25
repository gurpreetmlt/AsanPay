"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, Fingerprint, Lock, Shield } from "lucide-react";
import type { ApiResponse, AuthUser } from "@adhikaripay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";
import { enableBiometricLogin, isWebAuthnAvailable } from "@/lib/webauthn";

export default function SetPinPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [offerBio, setOfferBio] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const firstSet = user?.hasTxnPin !== true;

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pin.length !== 4 || pin !== confirm) {
      toast.error("PINs must match (exactly 4 digits)");
      return;
    }
    if (!password.trim()) {
      toast.error("Login password required to set PIN");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/txn-pin", {
        pin: String(pin),
        password: password.trim(),
      });
      if (!data.success) throw new Error(data.message);
      setUser(data.data.user);
      toast.success("PIN set successfully");
      if (isWebAuthnAvailable() && refreshToken && refreshToken !== "cookie" && user) setOfferBio(true);
      else router.replace("/dashboard");
    } catch (err) {
      toast.error(extractApiError(err, "Failed to set PIN"));
    } finally {
      setLoading(false);
    }
  }

  async function enableBio() {
    if (!user || !refreshToken || refreshToken === "cookie") {
      toast.error("Biometric setup unavailable in secure web session mode");
      router.replace("/dashboard");
      return;
    }
    try {
      await enableBiometricLogin({
        userId: user.id,
        userName: user.mobile,
        userLabel: user.name,
        refreshToken,
      });
      toast.success("Fingerprint / Face ID enabled for this browser");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Biometric setup failed");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-6 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-white" style={{ background: B.badgeGrad }}>
          <Shield size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            {firstSet ? "Set your PIN" : "Change PIN"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            4-digit PIN for wallet transfers. Avoid 1234 / 0000 / repeats. Login password confirm karein.
          </p>
        </div>

        {!offerBio ? (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
                Login password
              </label>
              <div className="flex items-center gap-2 rounded-xl border px-3 py-3" style={{ borderColor: B.border }}>
                <Lock size={15} style={{ color: B.muted }} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Account login password"
                  className="w-full text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="shrink-0"
                >
                  {showPassword ? (
                    <EyeOff size={15} style={{ color: B.muted }} />
                  ) : (
                    <Eye size={15} style={{ color: B.muted }} />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
                New PIN
              </label>
              <input
                required
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[0.4em] outline-none"
                style={{ borderColor: B.border, color: B.blue }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase" style={{ color: B.muted }}>
                Confirm PIN
              </label>
              <input
                required
                inputMode="numeric"
                maxLength={4}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-full rounded-xl border px-4 py-3 text-center text-xl tracking-[0.4em] outline-none"
                style={{ borderColor: B.border, color: B.blue }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: B.walletGrad }}
            >
              {loading ? "Saving…" : "Save PIN"}
            </button>
          </form>
        ) : (
          <div className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
            <div className="flex items-center gap-3">
              <Fingerprint size={28} style={{ color: B.blue }} />
              <div>
                <div className="font-bold" style={{ color: B.blue }}>
                  Enable biometric login?
                </div>
                <div className="text-sm" style={{ color: B.muted }}>
                  Touch ID / Face ID / Windows Hello on this device
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={enableBio}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white"
              style={{ background: B.badgeGrad }}
            >
              Enable fingerprint
            </button>
            <button type="button" onClick={() => router.replace("/dashboard")} className="w-full text-sm font-medium" style={{ color: B.muted }}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
