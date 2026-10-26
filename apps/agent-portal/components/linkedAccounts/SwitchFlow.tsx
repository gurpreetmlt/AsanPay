"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { POLICY_VERSION, type AuthUser, type LinkedAccountSummary } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { LoginPolicyConsent } from "@/components/auth/LoginPolicyConsent";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { apiErrorCode, finishSwitch, requestSwitchOtp, switchToAccount, type OtpSent } from "@/lib/linkedAccounts";
import { LaDialog } from "./LaDialog";
import { AccountFlipOverlay, type FlipFace } from "./AccountFlipOverlay";
import { AccountAvatar, DigitBoxes, InlineError, RoleChip, formatCountdown, useCountdown } from "./parts";

const RESEND_SECONDS = 30;

function toFace(a: Pick<LinkedAccountSummary, "name" | "role" | "roleLabel" | "uid" | "mobileMasked">): FlipFace {
  return { name: a.name, role: a.role, roleLabel: a.roleLabel, uid: a.uid, mobileMasked: a.mobileMasked };
}

/** MPIN (+ OTP once every 24 h) → card flip → reload into the target account. */
export function SwitchFlow({
  target,
  current,
  onClose,
}: {
  target: LinkedAccountSummary;
  current: FlipFace;
  onClose: () => void;
}) {
  const [mpin, setMpin] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(target.otpRequiredForSwitch);
  const [otpSent, setOtpSent] = useState<OtpSent | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [needsPolicy, setNeedsPolicy] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switched, setSwitched] = useState<{ user: AuthUser; message: string } | null>(null);
  const countdown = useCountdown(RESEND_SECONDS);
  const startCountdown = countdown.start;
  const autoSent = useRef(false);

  const sendOtp = useCallback(async () => {
    setSendingOtp(true);
    setError(null);
    try {
      const sent = await requestSwitchOtp(target.userId);
      setOtpSent(sent);
      setOtp(sent.otp ?? "");
      startCountdown();
    } catch (err) {
      setError(extractApiError(err, "Could not send the OTP. Try again."));
    } finally {
      setSendingOtp(false);
    }
  }, [target.userId, startCountdown]);

  useEffect(() => {
    if (needsOtp && !autoSent.current) {
      autoSent.current = true;
      void sendOtp();
    }
  }, [needsOtp, sendOtp]);

  const canSubmit =
    mpin.length === 4 && (!needsOtp || otp.length === 6) && (!needsPolicy || policyChecked) && !busy;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await switchToAccount({
        targetUserId: target.userId,
        mpin,
        ...(needsOtp ? { otp } : {}),
        ...(needsPolicy && policyChecked ? { acceptedPolicyVersion: POLICY_VERSION } : {}),
      });
      setSwitched(result);
    } catch (err) {
      const code = apiErrorCode(err);
      setError(extractApiError(err, "Could not switch accounts. Try again."));
      if (code === "SWITCH_OTP_REQUIRED") {
        setNeedsOtp(true);
      } else if (code === "POLICY_ACCEPTANCE_REQUIRED") {
        setNeedsPolicy(true);
      } else if (code === "MPIN_INCORRECT" || code === "SWITCH_LOCKED") {
        setMpin("");
      } else if (code?.startsWith("OTP_")) {
        setOtp("");
      }
      setBusy(false);
    }
  }

  if (switched) {
    return (
      <AccountFlipOverlay
        from={current}
        to={toFace(target)}
        onDone={() => finishSwitch(switched.user, switched.message)}
      />
    );
  }

  return (
    <LaDialog
      icon={<RefreshCw size={20} />}
      title={`Switch to ${target.roleLabel} account?`}
      subtitle="Your dashboard, balance and permissions will update."
      onClose={onClose}
      closeDisabled={busy}
    >
      <form onSubmit={submit}>
        <div
          className="flex items-center gap-4 rounded-2xl border p-4"
          style={{ background: B.bg, borderColor: "rgba(42,92,221,0.18)" }}
        >
          <AccountAvatar name={target.name} role={target.role} size={44} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
              {target.name}
            </p>
            <div className="mt-1">
              <RoleChip role={target.role} roleLabel={target.roleLabel} uid={target.uid} />
            </div>
            <p className="mt-1 text-xs" style={{ color: B.muted }}>
              {target.mobileMasked}
            </p>
          </div>
        </div>

        {needsOtp ? (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold" style={{ color: B.blue }}>
              Enter 6-digit OTP sent to {otpSent?.mobileMasked ?? target.mobileMasked}
            </p>
            <DigitBoxes length={6} value={otp} onChange={setOtp} label="OTP" disabled={busy} />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
              <span style={{ color: B.muted }}>For your security, verify with OTP once every 24 hours.</span>
              {countdown.left > 0 ? (
                <span className="shrink-0 font-semibold" style={{ color: B.muted }}>
                  Resend in {formatCountdown(countdown.left)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void sendOtp()}
                  disabled={sendingOtp}
                  className="shrink-0 font-semibold disabled:opacity-50"
                  style={{ color: B.blueLight }}
                >
                  {sendingOtp ? "Sending…" : otpSent ? "Resend OTP" : "Send OTP"}
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold" style={{ color: B.blue }}>
            Enter 4-digit MPIN of the {target.roleLabel} account
          </p>
          <DigitBoxes
            length={4}
            value={mpin}
            onChange={setMpin}
            masked
            autoFocus={!needsOtp}
            label="MPIN"
            disabled={busy}
            invalid={Boolean(error) && mpin.length === 0}
          />
          <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: B.muted }}>
            <ShieldCheck size={14} style={{ color: B.green }} />
            Required to protect your linked accounts
          </p>
        </div>

        {needsPolicy ? (
          <div className="mt-4">
            <LoginPolicyConsent checked={policyChecked} onChange={setPolicyChecked} />
          </div>
        ) : null}

        <InlineError message={error} />

        <div className="mt-6 grid grid-cols-2 gap-3">
          <PrimaryButton variant="destructive" onClick={onClose} disabled={busy}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" disabled={!canSubmit} loading={busy} showArrow={false}>
            Switch account
          </PrimaryButton>
        </div>
      </form>
    </LaDialog>
  );
}
