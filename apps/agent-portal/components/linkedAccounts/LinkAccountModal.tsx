"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Link2, ShieldCheck, XCircle } from "lucide-react";
import type { LinkCheckResult, LinkedAccountSummary, LinkedAccountsResponse } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { checkLink, startLink, verifyLink, type OtpSent } from "@/lib/linkedAccounts";
import { LaDialog } from "./LaDialog";
import { AccountAvatar, CodeField, InlineError, RoleChip, formatCountdown, useCountdown } from "./parts";

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

function MatchValue({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 font-bold" style={{ color: B.greenDark }}>
      <CheckCircle2 size={14} /> Matched
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-bold" style={{ color: "#DC2626" }}>
      <XCircle size={14} /> Not matched
    </span>
  );
}

/** Label / value table — same layout as the admin user-detail popups. */
function DetailTable({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(11,42,154,0.12)" }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="grid grid-cols-[110px_1fr] items-center gap-3 px-4 py-2.5 text-xs"
          style={{ borderTop: i === 0 ? undefined : "1px solid rgba(11,42,154,0.08)" }}
        >
          <span style={{ color: B.muted }}>{r.label}</span>
          <span className="font-bold" style={{ color: B.blue }}>
            {r.value}
          </span>
        </div>
      ))}
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
  const [step, setStep] = useState<"mobile" | "verify" | "done">("mobile");
  const [mobile, setMobile] = useState("");
  const [check, setCheck] = useState<LinkCheckResult | null>(null);
  const [otp, setOtp] = useState("");
  const [mpin, setMpin] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [linked, setLinked] = useState<LinkedAccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const countdown = useCountdown(RESEND_SECONDS);

  const mobileValid = /^[6-9]\d{9}$/.test(mobile);

  async function runCheck(e?: FormEvent) {
    e?.preventDefault();
    if (!mobileValid) {
      setError("Enter a valid 10-digit mobile");
      return;
    }
    setBusy(true);
    setError(null);
    let result: LinkCheckResult;
    try {
      result = await checkLink(mobile);
      setCheck(result);
      setStep("verify");
    } catch (err) {
      setError(extractApiError(err, "Could not verify this account. Try again."));
      setBusy(false);
      return;
    }
    setBusy(false);
    // OTP goes out automatically once every detail matched.
    if (result.eligible) await sendOtp();
  }

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await startLink(mobile);
      setSent(res);
      setOtp(res.otp ?? "");
      countdown.start();
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
      setStep("done");
    } catch (err) {
      setError(extractApiError(err, "Could not link the account. Try again."));
      setMpin("");
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStep("mobile");
    setCheck(null);
    setSent(null);
    setError(null);
    setOtp("");
    setMpin("");
  }

  if (step === "done" && linked) {
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

  if (step === "verify" && check) {
    const a = check.account;
    const rows = [
      ...(a
        ? [
            { label: "Name", value: a.name },
            { label: "Mobile", value: a.mobileMasked },
            { label: "UID", value: a.uid },
            { label: "Role", value: a.roleLabel },
            { label: "KYC", value: "Verified" },
          ]
        : [{ label: "Mobile", value: `XXXXXX${mobile.slice(-4)}` }]),
      { label: "PAN match", value: <MatchValue ok={check.checks.pan} /> },
      { label: "Aadhaar match", value: <MatchValue ok={check.checks.aadhaar} /> },
      { label: "Name match", value: <MatchValue ok={check.checks.name} /> },
    ];
    return (
      <LaDialog
        icon={<ShieldCheck size={22} />}
        eyebrow="Step 2 of 2"
        title="Verify account"
        subtitle={
          check.eligible
            ? "PAN, Aadhaar and name match your verified KYC."
            : "This account cannot be linked to you."
        }
        onClose={onClose}
        closeDisabled={busy}
      >
        <form onSubmit={submitLink}>
          <DetailTable rows={rows} />
          {check.message ? <InlineError message={check.message} /> : null}

          {check.eligible ? (
            <>
              <label htmlFor="la-otp" className="mb-2 mt-5 block text-xs font-semibold" style={{ color: B.blue }}>
                {sent ? `Enter 6-digit OTP sent to ${sent.mobileMasked}` : "Sending OTP…"}
              </label>
              <CodeField id="la-otp" length={6} value={otp} onChange={setOtp} autoFocus placeholder="6-digit OTP" />
              <div className="mt-2 text-right text-[11px]">
                {countdown.left > 0 ? (
                  <span className="font-semibold" style={{ color: B.muted }}>
                    Resend OTP in {formatCountdown(countdown.left)}
                  </span>
                ) : (
                  <button type="button" onClick={() => void sendOtp()} disabled={busy} className="font-semibold disabled:opacity-50" style={{ color: B.blueLight }}>
                    {sent ? "Resend OTP" : "Send OTP"}
                  </button>
                )}
              </div>

              <label htmlFor="la-mpin" className="mb-2 mt-3 block text-xs font-semibold" style={{ color: B.blue }}>
                MPIN of the other account
              </label>
              <CodeField id="la-mpin" length={4} value={mpin} onChange={setMpin} masked placeholder="4-digit MPIN" />
              <p className="mt-2 text-[11px]" style={{ color: B.muted }}>
                The 4-digit MPIN you use to log in to that account.
              </p>
            </>
          ) : null}

          <InlineError message={error} />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <PrimaryButton variant="secondary" onClick={() => goBack()} disabled={busy}>
              Back
            </PrimaryButton>
            <PrimaryButton
              type="submit"
              variant="success"
              loading={busy}
              disabled={!check.eligible || otp.length !== 6 || mpin.length !== 4}
            >
              Link account
            </PrimaryButton>
          </div>
        </form>
      </LaDialog>
    );
  }

  return (
    <LaDialog eyebrow="Linked accounts" title="Link another account" subtitle="Step 1 of 2" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={runCheck}>
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
          We first check PAN, Aadhaar and name. The OTP is sent after they match.
        </p>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "#F0FBF5", borderColor: "#C8EED9" }}>
          <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: B.greenDark }} />
          <div>
            <p className="text-xs font-bold" style={{ color: B.greenDark }}>
              Identity check
            </p>
            <p className="text-[11px]" style={{ color: B.muted }}>
              The PAN, Aadhaar and name on both accounts must match.
            </p>
          </div>
        </div>

        <InlineError message={error} />

        <div className="mt-6 grid grid-cols-2 gap-3">
          <PrimaryButton variant="destructive" onClick={onClose} disabled={busy}>
            Cancel
          </PrimaryButton>
          <PrimaryButton type="submit" loading={busy} disabled={!mobileValid} showArrow={false}>
            Verify
          </PrimaryButton>
        </div>
      </form>
    </LaDialog>
  );
}
