"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { AsanPayLockup } from "@/components/brand/Logo";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { extractApiError } from "@/lib/onboarding";

function passwordRuleError(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(value)) return "Password must contain a letter";
  if (!/\d/.test(value)) return "Password must contain a number";
  return null;
}

/** First login with the emailed temporary password — the agent must choose their own. */
export default function SetPasswordPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    // The stored user can be stale (KYC approved after this browser logged in) — ask the API.
    void fetchApi<AuthUser>("/auth/me")
      .then((me) => {
        setUser(me);
        if (!me.mustChangePassword) router.replace("/dashboard");
        else setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [hydrated, accessToken, router, setUser]);

  const ruleError = password ? passwordRuleError(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !passwordRuleError(password) && confirm === password && !loading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = passwordRuleError(password);
    if (err) {
      toast.error(err);
      return;
    }
    if (confirm !== password) {
      toast.error("Confirm password does not match the new password");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<{ user: AuthUser }>>("/auth/password/initial", {
        newPassword: password,
      });
      if (!data.success) throw new Error(data.message);
      setUser(data.data.user);
      toast.success("Password set. Use it next time you log in.");
      router.replace("/dashboard");
    } catch (error) {
      toast.error(extractApiError(error, "Could not save the new password. Try again."));
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    logout();
    router.replace("/login");
  }

  if (!hydrated || !accessToken || !checked) return null;

  const inputWrap = "flex items-center gap-2 rounded-xl border px-3 py-3";
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-5 py-10" style={{ background: B.bg }}>
      <div className="login-panel-animate w-full max-w-[460px] space-y-6">
        <div className="flex justify-center">
          <AsanPayLockup />
        </div>
        <form
          onSubmit={submit}
          className="space-y-5 rounded-3xl border bg-white p-6 sm:p-8"
          style={{ borderColor: B.border, boxShadow: "0 12px 40px rgba(11,42,154,0.08)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="confirm-modal-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: "#EEF2FF", color: B.blue }}
            >
              <KeyRound size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: B.blue }}>
                Set your password
              </h1>
              <p className="mt-1 text-sm" style={{ color: B.muted }}>
                {user?.name ? `Welcome, ${user.name}. ` : ""}You logged in with a temporary password. Choose your own
                to continue.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
              New password
            </label>
            <div className={inputWrap} style={{ borderColor: ruleError ? "#DC2626" : B.border }}>
              <Lock size={15} style={{ color: B.muted }} />
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="e.g. Test1234"
                className="w-full text-sm outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="shrink-0"
              >
                {show ? <EyeOff size={16} style={{ color: B.muted }} /> : <Eye size={16} style={{ color: B.muted }} />}
              </button>
            </div>
            <p className="mt-1 text-xs" style={{ color: ruleError ? "#DC2626" : B.muted }}>
              {ruleError ?? "Min 8 characters · include a letter and a number (e.g. Test1234)"}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
              Confirm password
            </label>
            <div className={inputWrap} style={{ borderColor: mismatch ? "#DC2626" : B.border }}>
              <Lock size={15} style={{ color: B.muted }} />
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type the new password again"
                className="w-full text-sm outline-none"
              />
            </div>
            {mismatch ? (
              <p className="mt-1 text-xs" style={{ color: "#DC2626" }}>
                Confirm password does not match the new password
              </p>
            ) : null}
          </div>

          <PrimaryButton type="submit" variant="primary" loading={loading} disabled={!canSubmit}>
            Save password
          </PrimaryButton>
          <button
            type="button"
            onClick={signOut}
            className="w-full text-sm font-medium"
            style={{ color: B.muted }}
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
