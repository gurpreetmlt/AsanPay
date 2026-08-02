"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type Props = {
  email: string;
  onChange: (value: string) => void;
  required?: boolean;
  label?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
};

/**
 * Email input + Verify button + 6-digit OTP modal.
 * Uses POST /auth/email/otp/request and /auth/email/otp/verify; refreshes AuthUser on success.
 */
export function EmailVerifyField({
  email,
  onChange,
  required,
  label = "Email",
  inputClassName = "w-full rounded-2xl border-2 bg-white px-4 py-3 text-sm outline-none",
  inputStyle = { borderColor: B.border, color: B.blue },
}: Props) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [modalOpen, setModalOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const normalized = email.trim().toLowerCase();
  const verified =
    Boolean(user?.emailVerifiedAt) &&
    (user?.email ?? "").toLowerCase() === normalized &&
    normalized.length > 0;

  useEffect(() => {
    if (verified) {
      setEmailError(null);
      setEmailChecking(false);
      return;
    }
    const value = email.trim();
    if (!value) {
      setEmailError(null);
      setEmailChecking(false);
      return;
    }
    if (!isValidEmail(value)) {
      setEmailError("Enter a valid email address");
      setEmailChecking(false);
      return;
    }
    if (!accessToken) {
      setEmailError(null);
      return;
    }
    let cancelled = false;
    setEmailChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<
          ApiResponse<{ available: boolean; message?: string }>
        >("/auth/email/check", { params: { email: value.toLowerCase() } });
        if (cancelled) return;
        if (!data.success) throw new Error(data.message);
        if (data.data.available === false) {
          setEmailError(
            data.data.message || "This email is already registered. Use a different email.",
          );
        } else {
          setEmailError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = extractApiError(err, "");
        if (/already registered|already in use|EMAIL_TAKEN/i.test(msg)) {
          setEmailError(msg);
        }
      } finally {
        if (!cancelled) setEmailChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, accessToken, verified]);

  function requestOtp() {
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (emailError) {
      toast.error(emailError);
      return;
    }

    flushSync(() => {
      setOtp("");
      setModalOpen(true);
      setSending(true);
    });

    void (async () => {
      try {
        const { data } = await api.post<ApiResponse<{ message: string; expiresInSeconds: number }>>(
          "/auth/email/otp/request",
          { email: normalized },
        );
        if (!data.success) throw new Error(data.message);
        toast.success(data.message ?? "Verification code sent");
      } catch (err) {
        setModalOpen(false);
        toast.error(extractApiError(err, "Could not send verification code"));
      } finally {
        setSending(false);
      }
    })();
  }

  async function confirmOtp() {
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const { data } = await api.post<ApiResponse<{ email: string; emailVerifiedAt: string }>>(
        "/auth/email/otp/verify",
        { otp },
      );
      if (!data.success) throw new Error(data.message);
      onChange(data.data.email);

      const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      if (me.data.success) {
        setUser(me.data.data.user);
      } else if (user) {
        setUser({
          ...user,
          email: data.data.email,
          emailVerifiedAt: data.data.emailVerifiedAt,
        });
      }

      setModalOpen(false);
      setOtp("");
      toast.success("Email verified");
    } catch (err) {
      toast.error(extractApiError(err, "Verification failed"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
            {label}
            {required ? " *" : ""}
          </span>
          {verified ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: `${B.green}18`, color: B.green }}
            >
              Verified
            </span>
          ) : normalized && isValidEmail(email) && !emailError ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "#FEF3C7", color: "#B45309" }}
            >
              Unverified
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            required={required}
            value={email}
            onChange={(e) => onChange(e.target.value)}
            placeholder="email@example.com"
            className={`min-w-0 flex-1 ${inputClassName}`}
            style={{
              ...inputStyle,
              borderColor: emailError ? "#DC2626" : inputStyle.borderColor,
            }}
            autoComplete="email"
          />
          <button
            type="button"
            disabled={sending || verified || !isValidEmail(email) || Boolean(emailError) || emailChecking}
            onClick={() => requestOtp()}
            className="flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: verified ? B.green : B.badgeGrad }}
          >
            {verified ? "Verified" : sending ? "Sending…" : "Verify"}
          </button>
        </div>
        {emailChecking && !emailError ? (
          <p className="mt-1 text-xs" style={{ color: B.muted }}>
            Checking email…
          </p>
        ) : null}
        {emailError ? (
          <p className="mt-1 text-xs font-semibold" style={{ color: "#DC2626" }}>
            {emailError}
          </p>
        ) : null}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border bg-white p-5 shadow-xl"
            style={{ borderColor: B.border }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-otp-title"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="email-otp-title" className="text-lg font-bold" style={{ color: B.blue }}>
                  Verify email
                </h3>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  {sending ? (
                    <>
                      Sending a 6-digit code to{" "}
                      <span className="font-semibold" style={{ color: B.blue }}>
                        {normalized}
                      </span>
                      …
                    </>
                  ) : (
                    <>
                      Enter the 6-digit code sent to{" "}
                      <span className="font-semibold" style={{ color: B.blue }}>
                        {normalized}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1"
                aria-label="Close"
              >
                <X size={18} style={{ color: B.muted }} />
              </button>
            </div>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="mb-4 w-full rounded-xl border px-4 py-3 text-center font-mono text-xl tracking-[0.35em] outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => requestOtp()}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue }}
              >
                {sending ? "Sending…" : "Resend"}
              </button>
              <button
                type="button"
                disabled={verifying || otp.length !== 6}
                onClick={() => void confirmOtp()}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: B.badgeGrad }}
              >
                {verifying ? "Verifying…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
