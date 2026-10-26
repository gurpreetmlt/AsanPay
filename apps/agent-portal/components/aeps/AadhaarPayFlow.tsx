"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDot, Fingerprint, Lock, RefreshCw, Settings2, X } from "lucide-react";
import { todayPhoneLocation } from "@/lib/phoneLocation";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { captureFingerprintWeb } from "@/lib/rdServiceFingerprint";

/** Airtel Payments Bank customers never need the Aadhaar Pay OTP. */
const AIRTEL_BANK_IIN = "990320";

export interface AadhaarPaySession {
  kycRequired: boolean;
  daily2faRequired: boolean;
  kycWadhValue: string;
  amountForOtp: number | null;
  tranTypeForOtp: string | null;
  live: boolean;
}

/** OTP is needed only for MT at or above the provider's amountForOtp, and never for Airtel. */
export function aadhaarPayOtpNeeded(
  session: AadhaarPaySession | null,
  amount: string,
  bankIin: string,
): boolean {
  if (!session || session.amountForOtp == null) return false;
  if ((session.tranTypeForOtp ?? "").toUpperCase() !== "MT") return false;
  if (bankIin === AIRTEL_BANK_IIN) return false;
  return Number(amount || 0) >= session.amountForOtp;
}

/**
 * Today's phone-verified location first (QR hand-off); otherwise best-effort browser location —
 * the API falls back to the saved shop location.
 */
function currentGeo(): Promise<{ latitude: string; longitude: string } | null> {
  const phone = todayPhoneLocation();
  if (phone) return Promise.resolve({ latitude: phone.latitude, longitude: phone.longitude });
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

export function useAadhaarPaySession(enabled: boolean) {
  const [session, setSession] = useState<AadhaarPaySession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<ApiResponse<AadhaarPaySession>>("/onboarding/noble/ap/load", {});
      if (!data.success) throw new Error(data.message);
      setSession(data.data);
    } catch (err) {
      setError(extractApiError(err, "Could not load Aadhaar Pay status. Tap Retry."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !session && !loading && !error) void reload();
  }, [enabled, session, loading, error, reload]);

  const needsSetup = Boolean(session && (session.kycRequired || session.daily2faRequired));
  return { session, loading, error, reload, needsSetup };
}

type ScannerProps = {
  deviceLabel: string;
  scannerReady: boolean;
  scannerLooking: boolean;
  onRetryScanner: () => void;
  onChangeDevice: () => void;
};

/** One-time Aadhaar Pay KYC + daily Aadhaar Pay fingerprint, shown above the form until done. */
export function AadhaarPaySetupCard({
  session,
  loading,
  error,
  onReload,
  deviceLabel,
  scannerReady,
  scannerLooking,
  onRetryScanner,
  onChangeDevice,
}: ScannerProps & {
  session: AadhaarPaySession | null;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
}) {
  const [scanning, setScanning] = useState(false);

  const kycPending = Boolean(session?.kycRequired);
  const twoFaPending = Boolean(session?.daily2faRequired);

  async function scan() {
    if (!session || scanning) return;
    if (scannerLooking) {
      toast.error("Scanner still connecting — wait a moment");
      return;
    }
    if (!scannerReady) {
      toast.error("RD Service not found. Open Mantra/Morpho RDService on this PC, then Retry.");
      return;
    }
    setScanning(true);
    try {
      const geo = await currentGeo();
      if (kycPending) {
        // kycWadhValue is `finger~iris~face`; a fingerprint capture takes the first part only.
        const fingerWadh = session.kycWadhValue.split("~")[0]?.trim() ?? "";
        const biometricPayload = await captureFingerprintWeb(fingerWadh ? { wadh: fingerWadh } : undefined);
        const { data } = await api.post<ApiResponse<unknown>>("/onboarding/noble/ap/kyc", {
          biometricPayload,
          ...(geo ?? {}),
        });
        if (!data.success) throw new Error(data.message);
        toast.success("Aadhaar Pay KYC completed");
      } else {
        const biometricPayload = await captureFingerprintWeb();
        const { data } = await api.post<ApiResponse<unknown>>("/onboarding/noble/ap/2fa", {
          biometricPayload,
          ...(geo ?? {}),
        });
        if (!data.success) throw new Error(data.message);
        toast.success("Aadhaar Pay unlocked for today");
      }
      await onReload();
    } catch (err) {
      toast.error(extractApiError(err, "Fingerprint verification failed. Try again."), { duration: 10_000 });
      onRetryScanner();
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div
        className="flex items-center gap-3 px-6 py-5"
        style={{ background: `linear-gradient(135deg, ${B.blue}, ${B.blueMid})` }}
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Fingerprint size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Activate Aadhaar Pay</h2>
          <p className="mt-0.5 text-xs text-white/70">
            Aadhaar Pay needs its own retailer fingerprint — KYC once, then one scan each day.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {loading && !session ? (
          <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Checking Aadhaar Pay status…
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">{error}</p>
            <PrimaryButton type="button" variant="primary" size="sm" onClick={() => void onReload()}>
              Retry
            </PrimaryButton>
          </div>
        ) : null}

        {session ? (
          <>
            <ol className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                {kycPending ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
                    1
                  </span>
                ) : (
                  <CheckCircle2 size={20} className="text-green-600" />
                )}
                <span className={kycPending ? "font-semibold text-gray-800" : "text-gray-500"}>
                  One-time Aadhaar Pay KYC
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                {twoFaPending ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
                    2
                  </span>
                ) : (
                  <CheckCircle2 size={20} className="text-green-600" />
                )}
                <span className={twoFaPending && !kycPending ? "font-semibold text-gray-800" : "text-gray-500"}>
                  Today&apos;s Aadhaar Pay fingerprint
                </span>
              </li>
            </ol>

            <div className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: B.border }}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <Fingerprint size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{deviceLabel}</p>
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      scannerReady ? "bg-green-500" : scannerLooking ? "bg-amber-400" : "bg-red-400"
                    }`}
                  />
                  {scannerReady ? "Device ready" : scannerLooking ? "Looking for RD Service…" : "RD Service not found"}
                </p>
              </div>
              <button
                type="button"
                onClick={onRetryScanner}
                className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
              >
                <RefreshCw size={12} />
                Retry
              </button>
              <button
                type="button"
                onClick={onChangeDevice}
                className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
              >
                <Settings2 size={12} />
                Change Device
              </button>
            </div>

            <PrimaryButton
              type="button"
              variant="primary"
              loading={scanning}
              disabled={scanning || !scannerReady}
              onClick={() => void scan()}
            >
              <Fingerprint size={18} />
              {kycPending ? "Scan Finger for Aadhaar Pay KYC" : "Scan Finger to unlock Aadhaar Pay"}
            </PrimaryButton>
            <p className="text-center text-xs text-gray-500">
              Face authentication is available in the AsanPay mobile app (Aadhaar FaceRD).
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

type OtpState = {
  amount: string;
  bankIin: string;
  required: boolean;
  otpReference: string;
  otpTransactionId: string;
  otpTransactionToken: string;
};

/** Confirm step: optional customer OTP → TPIN → customer fingerprint → POST /txn/aeps/aadhaar-pay. */
export function AadhaarPayConfirmModal({
  open,
  onClose,
  onDone,
  session,
  bankName,
  bankIin,
  aadhaar,
  mobile,
  amount,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  session: AadhaarPaySession | null;
  bankName: string;
  bankIin: string;
  aadhaar: string;
  mobile: string;
  amount: string;
}) {
  const [txnPin, setTxnPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpState, setOtpState] = useState<OtpState | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [paying, setPaying] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("aeps-ap"));

  const otpNeeded = aadhaarPayOtpNeeded(session, amount, bankIin);
  const otpFresh = otpState !== null && otpState.amount === amount && otpState.bankIin === bankIin;
  const otpRequired = otpNeeded && (!otpFresh || otpState.required);

  useEffect(() => {
    if (!open) {
      setTxnPin("");
      setOtp("");
    }
  }, [open]);

  useEffect(() => {
    attemptKey.current.clear();
  }, [amount, bankIin, aadhaar]);

  if (!open) return null;

  async function sendOtp() {
    if (sendingOtp) return;
    setSendingOtp(true);
    try {
      const geo = await currentGeo();
      const { data } = await api.post<
        ApiResponse<{ otpRequired: boolean; otpReference: string; otpTransactionId: string; otpTransactionToken: string }>
      >("/txn/aeps/aadhaar-pay/otp", {
        aadhaarNumber: aadhaar,
        bankIin,
        mobile,
        amount,
        ...(geo ?? {}),
      });
      if (!data.success) throw new Error(data.message);
      setOtpState({
        amount,
        bankIin,
        required: data.data.otpRequired,
        otpReference: data.data.otpReference,
        otpTransactionId: data.data.otpTransactionId,
        otpTransactionToken: data.data.otpTransactionToken,
      });
      setOtp("");
      toast.success(
        data.data.otpRequired
          ? "OTP sent to the customer's mobile. Enter it, then scan."
          : "No OTP needed for this payment. Scan to continue.",
      );
    } catch (err) {
      toast.error(extractApiError(err, "Could not send the Aadhaar Pay OTP. Try again."));
    } finally {
      setSendingOtp(false);
    }
  }

  async function pay() {
    if (paying) return;
    if (otpNeeded && !otpFresh) {
      toast.error("Tap Send OTP first — this amount needs a customer OTP");
      return;
    }
    const useOtp = otpNeeded && otpFresh && otpState.required;
    if (useOtp && !/^\d{4,8}$/.test(otp)) {
      toast.error("Enter the OTP the customer received (4–8 digits)");
      return;
    }
    if (!/^\d{4}$/.test(txnPin)) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }
    setPaying(true);
    try {
      const geoPromise = currentGeo();
      const biometricPayload = await captureFingerprintWeb(useOtp ? { otp } : undefined);
      const geo = await geoPromise;
      const idempotencyKey = attemptKey.current.get();
      const { data } = await api.post<ApiResponse<{ txn: { txnRef: string; status: string } }>>(
        "/txn/aeps/aadhaar-pay",
        {
          idempotencyKey,
          txnPin,
          aadhaarNumber: aadhaar,
          bankIin,
          mobile,
          amount,
          biometricPayload,
          ...(useOtp && otpState
            ? {
                otpReferenceKey: otpState.otpReference,
                otpTransactionId: otpState.otpTransactionId,
                otpTransactionToken: otpState.otpTransactionToken,
              }
            : {}),
          ...(geo ?? {}),
        },
      );
      if (!data.success) throw new Error(data.message);
      attemptKey.current.clear();
      setOtpState(null);
      const ref = data.data.txn?.txnRef ?? idempotencyKey;
      const status = (data.data.txn?.status ?? "").toLowerCase();
      if (status === "pending") {
        toast(`Aadhaar Pay is pending — Ref: ${ref}. Check Transactions for the final status.`, { duration: 10_000 });
      } else {
        toast.success(`Aadhaar Pay successful — ₹${Number(amount).toLocaleString("en-IN")} · Ref: ${ref}`, {
          duration: 10_000,
        });
      }
      onDone();
    } catch (err) {
      toast.error(extractApiError(err, "Aadhaar Pay failed. Check the details and try again."), { duration: 10_000 });
    } finally {
      setPaying(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={paying ? undefined : onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Confirm Aadhaar Pay
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="popup-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <dl className="space-y-1.5 rounded-xl border bg-slate-50/70 p-4 text-sm" style={{ borderColor: B.border }}>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Amount</dt>
              <dd className="font-extrabold text-gray-900">₹{Number(amount || 0).toLocaleString("en-IN")}</dd>
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
              {otpFresh && !otpState.required ? (
                <p className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-xs font-semibold text-green-800">
                  No OTP needed for this payment.
                </p>
              ) : otpFresh ? (
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
                    Payments of ₹{session?.amountForOtp?.toLocaleString("en-IN")} or more need an OTP sent to the
                    customer&apos;s mobile.
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
            The customer places their finger on the scanner after you tap Scan Finger &amp; Pay.
          </p>

          <div className="flex gap-3">
            <PrimaryButton
              type="button"
              variant="destructive"
              onClick={onClose}
              disabled={paying}
              className="flex-1"
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton
              type="button"
              variant="primary"
              loading={paying}
              disabled={paying || (otpRequired && !otpFresh)}
              onClick={() => void pay()}
              showArrow={false}
              className="flex-[2]"
            >
              <Fingerprint size={18} />
              Scan Finger &amp; Pay
            </PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}
