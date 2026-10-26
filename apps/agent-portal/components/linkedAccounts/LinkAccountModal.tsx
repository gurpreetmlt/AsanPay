"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import type { LinkedAccountSummary, LinkedAccountsResponse } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { startLink, verifyLink, type OtpSent } from "@/lib/linkedAccounts";
import { LaDialog } from "./LaDialog";
import { AccountAvatar, DigitBoxes, InlineError, RoleChip, formatCountdown, useCountdown } from "./parts";

const RESEND_SECONDS = 30;

function AccountMini({ account }: { account: LinkedAccountSummary }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl border p-4 text-center" style={{ borderColor: B.border, background: B.bg }}>
      <AccountAvatar name={account.name} role={account.role} size={44} />
      <p className="w-full truncate text-sm font-bold" style={{ color: B.blue }}>
        {account.name}
      </p>
      <RoleChip role={account.role} roleLabel={account.roleLabel} uid={account.uid} />
    </div>
  );
}

export function LinkAccountModal({
  onClose,
  onLinked,
  onSwitchNow,
}: {
  onClose: () => void;
  onLinked: (res: LinkedAccountsResponse) => void;
  onSwitchNow: (target: LinkedAccountSummary) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [mpin, setMpin] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [linked, setLinked] = useState<LinkedAccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const countdown = useCountdown(RESEND_SECONDS);

  const mobileValid = /^[6-9]\d{9}$/.test(mobile);

  async function sendOtp(e?: FormEvent) {
    e?.preventDefault();
    if (!mobileValid) {
      setError("Enter a valid 10-digit mobile");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startLink(mobile);
      setSent(res);
      setOtp(res.otp ?? "");
      countdown.start();
      setStep(2);
    } catch (err) {
      setError(extractApiError(err, "Could not send the OTP. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6 || mpin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyLink({ mobile, otp, mpin });
      setLinked(res);
      onLinked(res);
      setStep(3);
    } catch (err) {
      setError(extractApiError(err, "Could not link the account. Try again."));
      setMpin("");
    } finally {
      setBusy(false);
    }
  }

  if (step === 3 && linked) {
    const current = linked.accounts.find((a) => a.isCurrent);
    const other = linked.accounts.find((a) => !a.isCurrent);
    return (
      <LaDialog title="Accounts linked" onClose={onClose}>
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#E7F8EF" }}>
            <CheckCircle2 size={30} style={{ color: B.green }} />
          </div>
          <p className="text-sm" style={{ color: B.muted }}>
            You can now switch between these accounts with your MPIN.
          </p>
        </div>
        <div className="mt-5 flex gap-3">
          {current ? <AccountMini account={current} /> : null}
          {other ? <AccountMini account={other} /> : null}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <PrimaryButton variant="secondary" onClick={onClose}>
            Done
          </PrimaryButton>
          <PrimaryButton onClick={() => other && onSwitchNow(other)} disabled={!other} showArrow={false}>
            Switch now
          </PrimaryButton>
        </div>
      </LaDialog>
    );
  }

  if (step === 2) {
    return (
      <LaDialog eyebrow="Linked accounts" title="Link another account" subtitle="Step 2 of 2" onClose={onClose} closeDisabled={busy}>
        <form onSubmit={submitLink}>
          <p className="mb-2 text-xs font-semibold" style={{ color: B.blue }}>
            Enter 6-digit OTP sent to {sent?.mobileMasked ?? `XXXXXX${mobile.slice(-4)}`}
          </p>
          <DigitBoxes length={6} value={otp} onChange={setOtp} autoFocus label="OTP" disabled={busy} />
          <div className="mt-2 text-right text-[11px]">
            {countdown.left > 0 ? (
              <span className="font-semibold" style={{ color: B.muted }}>
                Resend OTP in {formatCountdown(countdown.left)}
              </span>
            ) : (
              <button type="button" onClick={() => void sendOtp()} disabled={busy} className="font-semibold disabled:opacity-50" style={{ color: B.blueLight }}>
                Resend OTP
              </button>
            )}
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold" style={{ color: B.blue }}>
            MPIN of the other account
          </p>
          <DigitBoxes length={4} value={mpin} onChange={setMpin} masked label="MPIN of the other account" disabled={busy} />
          <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
            The 4-digit MPIN you use to log in to that account.
          </p>

          <InlineError message={error} />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <PrimaryButton
              variant="secondary"
              onClick={() => {
                setStep(1);
                setError(null);
                setOtp("");
                setMpin("");
              }}
              disabled={busy}
            >
              Back
            </PrimaryButton>
            <PrimaryButton type="submit" variant="success" loading={busy} disabled={otp.length !== 6 || mpin.length !== 4}>
              Link account
            </PrimaryButton>
          </div>
        </form>
      </LaDialog>
    );
  }

  return (
    <LaDialog eyebrow="Linked accounts" title="Link another account" subtitle="Step 1 of 2" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={sendOtp}>
        <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: B.bg }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: B.blueLight }}>
            <Link2 size={18} />
          </div>
          <p className="text-xs" style={{ color: B.muted }}>
            Link your other AsanPay account (same PAN and Aadhaar) to switch without logging out.
          </p>
        </div>

        <label htmlFor="la-mobile" className="mb-2 mt-5 block text-xs font-semibold" style={{ color: B.blue }}>
          Mobile number of the other account
        </label>
        <div className="flex overflow-hidden rounded-xl border focus-within:border-[#2A5CDD]" style={{ borderColor: "rgba(11,42,154,0.18)" }}>
          <span className="flex items-center border-r px-4 text-sm font-semibold" style={{ background: B.bg, color: B.blue, borderColor: "rgba(11,42,154,0.12)" }}>
            +91
          </span>
          <input
            id="la-mobile"
            value={mobile}
            onChange={(e) => {
              setMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            inputMode="numeric"
            autoComplete="tel-national"
            autoFocus
            placeholder="10-digit mobile number"
            className="min-w-0 flex-1 px-4 py-3 text-sm outline-none"
            style={{ color: B.blue }}
          />
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: B.muted }}>
          We will send an OTP to this number.
        </p>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "#F0FBF5", borderColor: "#C8EED9" }}>
          <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: B.greenDark }} />
          <div>
            <p className="text-xs font-bold" style={{ color: B.greenDark }}>
              Identity check
            </p>
            <p className="text-[11px]" style={{ color: B.muted }}>
              The PAN and Aadhaar on both accounts must match.
            </p>
          </div>
        </div>

        <InlineError message={error} />

        <div className="mt-6 grid grid-cols-2 gap-3">
          <PrimaryButton variant="destructive" onClick={onClose} disabled={busy}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" loading={busy} disabled={!mobileValid} showArrow={false}>
            Send OTP
          </PrimaryButton>
        </div>
      </form>
    </LaDialog>
  );
}
