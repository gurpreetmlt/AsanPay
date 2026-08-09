"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import api from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import type { DownlineUser } from "@/lib/types";

interface PullFormProps {
  target: DownlineUser;
  onClose: () => void;
  onSuccess: () => void;
}

interface PullRequestResult {
  message: string;
  otp?: string;
  maskedMobile?: string;
  expiresInSeconds: number;
}

/**
 * Reverse (pull) funds from a direct child: OTP → child's phone, parent enters OTP + txn PIN.
 */
export function PullForm({ target, onClose, onSuccess }: PullFormProps) {
  const [step, setStep] = useState<"amount" | "otp">("amount");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [otp, setOtp] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [maskedMobile, setMaskedMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(`pull-${target.id}`));

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    if (loading || !amount) return;
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<PullRequestResult>>("/wallet/pull/request", {
        targetUserId: target.id,
        walletType: "main",
        amount,
      });
      if (!data.success) throw new Error(data.message);
      setDevOtp(data.data.otp ?? null);
      setMaskedMobile(data.data.maskedMobile ?? null);
      setStep("otp");
      toast.success(data.data.otp ? `Dev OTP: ${data.data.otp}` : data.data.message);
    } catch (err) {
      toast.error(extractApiError(err, "Could not send OTP"));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(e?: FormEvent) {
    e?.preventDefault();
    if (loading || otp.length !== 6 || txnPin.length !== 4) return;
    setLoading(true);
    try {
      await api.post("/wallet/pull/confirm", {
        targetUserId: target.id,
        walletType: "main",
        amount,
        otp,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
        ...(description ? { description } : {}),
      });
      attemptKey.current.clear();
      toast.success(`₹${amount} reversed from ${target.name}`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(extractApiError(err, "Reverse failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Reverse · ${target.name}`} onClose={onClose}>
      {step === "amount" ? (
        <form onSubmit={requestOtp} className="space-y-3">
          <p className="text-xs text-gray-500">
            OTP will go to {target.name}&apos;s phone ({target.mobile}). You enter that OTP + your txn PIN.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₹)</label>
            <input
              required
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.]/g, ""));
                attemptKey.current.clear();
              }}
              placeholder="1000.00"
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Available on partner: ₹{Number(target.mainBalance).toLocaleString("en-IN")}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <PrimaryButton
            type="submit"
            variant="primary"
            loopGlow
            disabled={loading || !amount}
            loading={loading}
          >
            Send OTP to partner
          </PrimaryButton>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-xs text-gray-500">
            Reversing ₹{amount} from {target.name}
            {maskedMobile ? ` · OTP sent to ${maskedMobile}` : ""}
          </p>
          {devOtp ? (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
              Dev OTP: {devOtp}
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">6-digit OTP (from partner phone)</label>
            <input
              required
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm tracking-widest outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Your transaction PIN</label>
            <input
              required
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={txnPin}
              onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <PrimaryButton
            type="submit"
            variant="primary"
            loopGlow
            disabled={loading || otp.length !== 6 || txnPin.length !== 4}
            loading={loading}
          >
            Confirm reverse
          </PrimaryButton>
          <button
            type="button"
            className="w-full text-sm font-medium text-gray-500"
            onClick={() => {
              setStep("amount");
              setOtp("");
              setTxnPin("");
              setDevOtp(null);
              attemptKey.current.clear();
            }}
          >
            Change amount
          </button>
        </form>
      )}
    </Modal>
  );
}
