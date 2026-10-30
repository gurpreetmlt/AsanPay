"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CircleDot, Fingerprint, Landmark, Lock, ReceiptText } from "lucide-react";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  LOCATION_REQUIRED_MESSAGE,
  LocationRequiredHint,
  txnLocationBody,
  type TxnLocationFix,
} from "@/components/aeps/TxnLocation";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { captureFingerprintWeb } from "@/lib/rdServiceFingerprint";

/** Provider asks for a customer OTP on withdrawals above this amount (OTP rides inside the PID). */
export const AEPS_WITHDRAW_OTP_ABOVE = 5000;

function inr(v: string | number): string {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

/** Withdraw / Deposit confirm: optional customer OTP → TPIN → customer fingerprint → POST. */
export function AepsCashConfirmModal({
  open,
  kind,
  onClose,
  onDone,
  bankName,
  bankIin,
  aadhaar,
  mobile,
  amount,
  location,
  onLocationUsed,
}: {
  open: boolean;
  kind: "Withdraw" | "Deposit";
  onClose: () => void;
  onDone: () => void;
  bankName: string;
  bankIin: string;
  aadhaar: string;
  mobile: string;
  amount: string;
  location: TxnLocationFix | null;
  onLocationUsed: (err?: unknown) => void;
}) {
  const isDeposit = kind === "Deposit";
  const [txnPin, setTxnPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRef, setOtpRef] = useState<{ referenceKey: string; amount: string; bankIin: string } | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(isDeposit ? "aeps-dp" : "aeps-wd"));

  const otpNeeded = !isDeposit && Number(amount || 0) > AEPS_WITHDRAW_OTP_ABOVE;
  const otpFresh = otpRef !== null && otpRef.amount === amount && otpRef.bankIin === bankIin;

  useEffect(() => {
    if (!open) {
      setTxnPin("");
      setOtp("");
    }
  }, [open]);

  useEffect(() => {
    attemptKey.current.clear();
  }, [amount, bankIin, aadhaar, kind]);

  if (!open) return null;

  async function sendOtp() {
    if (sendingOtp) return;
    if (!location) {
      toast.error(LOCATION_REQUIRED_MESSAGE);
      return;
    }
    setSendingOtp(true);
    try {
      const { data } = await api.post<ApiResponse<{ data?: { referenceKey?: string } }>>("/txn/aeps/withdraw/otp", {
        aadhaarNumber: aadhaar,
        bankIin,
        mobile,
        amount,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      if (!data.success) throw new Error(data.message || "Could not send the withdrawal OTP");
      const referenceKey = data.data?.data?.referenceKey;
      if (!referenceKey) throw new Error("Could not send the withdrawal OTP. Try again.");
      setOtpRef({ referenceKey, amount, bankIin });
      setOtp("");
      toast.success("OTP sent to the customer's mobile. Enter it, then scan.");
    } catch (err) {
      toast.error(extractApiError(err, "Could not send the withdrawal OTP. Try again."));
    } finally {
      setSendingOtp(false);
    }
  }

  async function submit() {
    if (submitting) return;
    if (otpNeeded && !otpFresh) {
      toast.error(`Tap Send OTP first — withdrawals above ${inr(AEPS_WITHDRAW_OTP_ABOVE)} need a customer OTP`);
      return;
    }
    if (otpNeeded && !/^\d{4,8}$/.test(otp)) {
      toast.error("Enter the OTP the customer received (4–8 digits)");
      return;
    }
    if (!/^\d{4}$/.test(txnPin)) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }
    if (!location) {
      toast.error(LOCATION_REQUIRED_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const biometricPayload = await captureFingerprintWeb(otpNeeded ? { otp } : undefined);
      const idempotencyKey = attemptKey.current.get();
      const { data } = await api.post<ApiResponse<{ txn: { txnRef: string; status: string } }>>(
        isDeposit ? "/txn/aeps/deposit" : "/txn/aeps/withdraw",
        {
          idempotencyKey,
          txnPin,
          aadhaarNumber: aadhaar,
          bankIin,
          mobile,
          amount,
          biometricPayload,
          ...(otpNeeded && otpRef ? { otpReferenceKey: otpRef.referenceKey } : {}),
          ...txnLocationBody(location),
        },
      );
      if (!data.success) throw new Error(data.message);
      onLocationUsed();
      attemptKey.current.clear();
      setOtpRef(null);
      const ref = data.data.txn?.txnRef ?? idempotencyKey;
      if ((data.data.txn?.status ?? "").toLowerCase() === "pending") {
        toast(`${isDeposit ? "Deposit" : "Withdrawal"} is pending — Ref: ${ref}. Check Transactions for the final status.`, {
          duration: 10_000,
        });
      } else {
        toast.success(`${isDeposit ? "Deposit" : "Withdrawal"} successful — ${inr(amount)} · Ref: ${ref}`, {
          duration: 10_000,
        });
      }
      onDone();
    } catch (err) {
      onLocationUsed(err);
      toast.error(
        extractApiError(err, `${isDeposit ? "Deposit" : "Withdrawal"} failed. Check the details and try again.`),
        { duration: 10_000 },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={isDeposit ? "Confirm cash deposit" : "Confirm cash withdrawal"}
      subtitle="Check the details, enter your PIN, then the customer scans their finger."
      icon={isDeposit ? <ArrowDownToLine size={22} /> : <ArrowUpFromLine size={22} />}
      iconTone="blue"
      onClose={onClose}
      closeDisabled={submitting}
    >
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-xl border bg-slate-50/70 p-4 text-sm" style={{ borderColor: B.border }}>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Amount</dt>
            <dd className="font-extrabold text-gray-900">{inr(amount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Customer bank</dt>
            <dd className="truncate font-semibold text-gray-800">{bankName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Aadhaar</dt>
            <dd className="font-mono text-gray-800">XXXX XXXX {aadhaar.slice(-4)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Customer mobile</dt>
            <dd className="font-semibold text-gray-800">{mobile}</dd>
          </div>
        </dl>

        {otpNeeded ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Customer OTP
            </label>
            {otpFresh ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="OTP received by customer"
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium tracking-widest outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <PrimaryButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={sendingOtp}
                  onClick={() => void sendOtp()}
                >
                  Resend
                </PrimaryButton>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Withdrawals above {inr(AEPS_WITHDRAW_OTP_ABOVE)} need an OTP sent to the customer&apos;s mobile.
                </p>
                <PrimaryButton
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={sendingOtp}
                  onClick={() => void sendOtp()}
                >
                  Send OTP
                </PrimaryButton>
              </div>
            )}
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Transaction PIN
          </label>
          <div className="relative">
            <Lock
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: B.blueLight }}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={txnPin}
              onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Enter 4-digit TPIN"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-9 pr-3.5 text-sm font-medium tracking-widest outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-gray-500">
          <CircleDot size={14} className="mt-0.5 shrink-0 text-green-600" />
          The customer places their finger on the scanner after you tap Scan Finger.
        </p>

        <div className="flex gap-3">
          <PrimaryButton type="button" variant="destructive" onClick={onClose} disabled={submitting} className="flex-1">
            Cancel
          </PrimaryButton>
          <PrimaryButton
            type="button"
            variant="primary"
            loading={submitting}
            disabled={submitting || !location || (otpNeeded && !otpFresh)}
            onClick={() => void submit()}
            showArrow={false}
            className="flex-1"
          >
            <Fingerprint size={18} />
            Scan Finger
          </PrimaryButton>
        </div>
        <LocationRequiredHint show={!location} />
      </div>
    </Modal>
  );
}

export interface AepsEnquiryResult {
  kind: "Balance Enquiry" | "Mini Statement";
  bankName: string;
  aadhaarLast4: string;
  balance?: string;
  statement?: { date: string; narration: string; amount: string; type: "credit" | "debit" }[];
}

/** Balance / mini statement result. */
export function AepsEnquiryResultModal({ result, onClose }: { result: AepsEnquiryResult | null; onClose: () => void }) {
  if (!result) return null;
  const isMini = result.kind === "Mini Statement";
  const rows = result.statement ?? [];
  return (
    <Modal
      title={isMini ? "Mini statement" : "Account balance"}
      eyebrow={`${result.bankName} · XXXX ${result.aadhaarLast4}`}
      subtitle={isMini ? "Recent transactions on the customer's account." : "Available balance in the customer's account."}
      icon={isMini ? <ReceiptText size={22} /> : <Landmark size={22} />}
      iconTone="green"
      wide={isMini && rows.length > 6}
      onClose={onClose}
    >
      <div className="space-y-4">
        {result.balance ? (
          <div
            className="rounded-2xl border p-4 text-center"
            style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Available balance</p>
            <p className="mt-1 text-2xl font-extrabold text-gray-900">{inr(result.balance)}</p>
          </div>
        ) : null}
        {isMini ? (
          rows.length ? (
            <ul className={rows.length > 6 ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "space-y-2"}>
              {rows.map((r, i) => (
                <li
                  key={`${r.date}-${i}`}
                  className="la-check-row flex items-start justify-between gap-3 rounded-xl border p-3 text-sm"
                  style={{ borderColor: B.border, animationDelay: `${i * 120}ms` }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-800">{r.narration || "Transaction"}</p>
                    <p className="text-xs text-gray-500">{r.date}</p>
                  </div>
                  <span
                    className="shrink-0 font-bold"
                    style={{ color: r.type === "credit" ? B.greenDark : "#DC2626" }}
                  >
                    {r.type === "credit" ? "+" : "−"}
                    {inr(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border p-4 text-center text-sm text-gray-500" style={{ borderColor: B.border }}>
              No recent transactions found for this account.
            </p>
          )
        ) : null}
        <PrimaryButton type="button" variant="primary" onClick={onClose} showArrow={false} className="w-full">
          Done
        </PrimaryButton>
      </div>
    </Modal>
  );
}
