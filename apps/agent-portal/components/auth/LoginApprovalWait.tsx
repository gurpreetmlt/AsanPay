"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldX, Smartphone, TimerOff } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";

export interface LoginApprovalChallenge {
  approvalRequired: true;
  approvalId: string;
  matchNumber: number;
  pollToken: string;
  expiresAt: string;
  expiresInSeconds: number;
}

type PollData =
  | { status: "pending"; expiresInSeconds: number }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; user: AuthUser };

const POLL_MS = 3000;

function secondsUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

/** Password login waiting for a tap in the AsanPay app on the agent's trusted phone. */
export function LoginApprovalWait({
  challenge,
  onApproved,
  onRetry,
  onUseOtp,
  onCancel,
}: {
  challenge: LoginApprovalChallenge;
  onApproved: (user: AuthUser) => void;
  onRetry: () => void;
  onUseOtp: () => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"waiting" | "denied" | "expired">("waiting");
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(challenge.expiresAt));
  const inFlight = useRef(false);
  const done = useRef(false);
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  const poll = useCallback(async () => {
    if (inFlight.current || done.current) return;
    inFlight.current = true;
    try {
      const { data } = await api.post<ApiResponse<PollData>>(
        `/auth/login-approval/${challenge.approvalId}/poll`,
        { pollToken: challenge.pollToken },
      );
      if (!data.success) return;
      const result = data.data;
      if (result.status === "approved") {
        done.current = true;
        onApprovedRef.current(result.user);
      } else if (result.status === "denied") {
        done.current = true;
        setPhase("denied");
      } else if (result.status === "expired") {
        done.current = true;
        setPhase("expired");
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 404 / 409 / 410: the request is gone or already used — a new sign-in is needed.
      if (status === 404 || status === 409 || status === 410) {
        done.current = true;
        setPhase("expired");
      }
    } finally {
      inFlight.current = false;
    }
  }, [challenge.approvalId, challenge.pollToken]);

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const id = setInterval(() => {
      const left = secondsUntil(challenge.expiresAt);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        void poll().then(() => {
          if (!done.current) {
            done.current = true;
            setPhase("expired");
          }
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [challenge.expiresAt, phase, poll]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (phase !== "waiting") {
    const denied = phase === "denied";
    return (
      <div className="mb-6 space-y-4">
        <div
          className="flex items-start gap-3 rounded-2xl border px-4 py-4"
          style={{ borderColor: denied ? "#FECACA" : "#FDE68A", background: denied ? "#FEF2F2" : "#FFFBEB" }}
        >
          <div
            className="confirm-modal-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: denied ? "#FEE2E2" : "#FEF3C7" }}
          >
            {denied ? <ShieldX size={22} color="#DC2626" /> : <TimerOff size={22} color="#D97706" />}
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: denied ? "#B91C1C" : "#92400E" }}>
              {denied ? "Login denied on your phone" : "Approval request expired"}
            </div>
            <div className="mt-0.5 text-sm" style={{ color: B.muted }}>
              {denied
                ? "This browser was not signed in. If it wasn't you, change your password now."
                : "No one approved this login within 2 minutes. Send a new request or sign in with OTP."}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PrimaryButton variant="primary" showArrow={false} onClick={onRetry}>
            {denied ? "Try again" : "Resend request"}
          </PrimaryButton>
          <PrimaryButton variant="secondary" showArrow={false} onClick={onUseOtp}>
            Use OTP instead
          </PrimaryButton>
        </div>
        <button type="button" className="w-full text-xs font-medium" style={{ color: B.muted }} onClick={onCancel}>
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-2xl border px-4 py-5 text-center" style={{ borderColor: B.border, background: "#F7F9FF" }}>
        <div
          className="confirm-modal-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${B.blue}14` }}
        >
          <Smartphone size={22} style={{ color: B.blue }} />
        </div>
        <div className="text-base font-bold" style={{ color: B.blue }}>
          Approve this login on your AsanPay app
        </div>
        <div className="mx-auto mt-1 max-w-[340px] text-sm" style={{ color: B.muted }}>
          We sent a request to your phone. Open it and tap the number below, then Approve.
        </div>
        <div
          className="mx-auto mt-4 flex h-24 w-32 items-center justify-center rounded-2xl border-2 text-5xl font-extrabold tabular-nums"
          style={{ borderColor: B.blue, color: B.blue, background: "#fff" }}
          aria-label={`Match number ${challenge.matchNumber}`}
        >
          {challenge.matchNumber}
        </div>
        <div className="mt-3 text-sm font-semibold tabular-nums" style={{ color: secondsLeft <= 20 ? "#DC2626" : B.muted }}>
          Expires in {mm}:{ss}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PrimaryButton variant="secondary" showArrow={false} onClick={onRetry}>
          Resend request
        </PrimaryButton>
        <PrimaryButton variant="secondary" showArrow={false} onClick={onUseOtp}>
          Use OTP instead
        </PrimaryButton>
      </div>
      <button type="button" className="w-full text-xs font-semibold" style={{ color: "#DC2626" }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
