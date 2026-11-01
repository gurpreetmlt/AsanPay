"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, ShieldX, Smartphone } from "lucide-react";
import type { ApiResponse, AuthUser } from "@asanpay/shared-types";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { getDeviceId, getDeviceLabel } from "@/lib/deviceId";
import { extractApiError } from "@/lib/onboarding";

interface QrStart {
  approvalId: string;
  pollToken: string;
  qrValue: string;
  expiresAt: string;
}

type PollData =
  | { status: "pending"; expiresInSeconds: number; scanned: boolean }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; user: AuthUser };

const POLL_MS = 2500;

/** "Login with QR code": the AsanPay app scans this, checks the phone's GPS, and approves. */
export function QrLoginPanel({ onApproved, onCancel }: { onApproved: (user: AuthUser) => void; onCancel: () => void }) {
  const [qr, setQr] = useState<QrStart | null>(null);
  const [scanned, setScanned] = useState(false);
  const [phase, setPhase] = useState<"loading" | "showing" | "denied" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const done = useRef(false);
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  const fetchQr = useCallback(async () => {
    setPhase("loading");
    setScanned(false);
    setError(null);
    done.current = false;
    try {
      const { data } = await api.post<ApiResponse<QrStart>>("/auth/qr-login/start", {
        deviceId: getDeviceId(),
        deviceLabel: getDeviceLabel(),
      });
      if (!data.success) throw new Error(data.message);
      setQr(data.data);
      setPhase("showing");
    } catch (err) {
      setError(extractApiError(err, "Could not create a login QR. Refresh the page or log in with OTP."));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void fetchQr();
  }, [fetchQr]);

  useEffect(() => {
    if (!qr || phase !== "showing") return;
    const poll = async () => {
      if (inFlight.current || done.current) return;
      inFlight.current = true;
      try {
        const { data } = await api.post<ApiResponse<PollData>>(`/auth/login-approval/${qr.approvalId}/poll`, {
          pollToken: qr.pollToken,
        });
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
          void fetchQr();
        } else {
          setScanned(result.scanned);
        }
      } catch (err) {
        const res = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
        if (res?.status === 403 || res?.data?.code === "POLICY_ACCEPTANCE_REQUIRED") {
          done.current = true;
          setError(extractApiError(err, "Could not finish the QR login. Log in with OTP instead."));
          setPhase("error");
        } else if (res?.status === 404 || res?.status === 409 || res?.status === 410) {
          done.current = true;
          void fetchQr();
        }
      } finally {
        inFlight.current = false;
      }
    };
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [qr, phase, fetchQr]);

  if (phase === "denied" || phase === "error") {
    const denied = phase === "denied";
    return (
      <div className="mb-6 space-y-4">
        <div
          className="flex items-start gap-3 rounded-2xl border px-4 py-4"
          style={{ borderColor: "#FECACA", background: "#FEF2F2" }}
        >
          <div className="confirm-modal-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "#FEE2E2" }}>
            <ShieldX size={22} color="#DC2626" />
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: "#B91C1C" }}>
              {denied ? "QR login was not approved" : "QR login is not available"}
            </div>
            <div className="mt-0.5 text-sm" style={{ color: B.muted }}>
              {denied
                ? "The login was denied on the phone, or the phone reported a fake location. If it wasn't you, change your password now."
                : error}
            </div>
          </div>
        </div>
        <PrimaryButton variant="primary" showArrow={false} onClick={() => void fetchQr()}>
          Show a new QR
        </PrimaryButton>
        <button type="button" className="w-full text-xs font-semibold" style={{ color: "#DC2626" }} onClick={onCancel}>
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      <div className="rounded-2xl border px-4 py-5 text-center" style={{ borderColor: B.border, background: "#F7F9FF" }}>
        {scanned ? (
          <>
            <div className="confirm-modal-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${B.blue}14` }}>
              <Smartphone size={22} style={{ color: B.blue }} />
            </div>
            <div className="text-base font-bold" style={{ color: B.blue }}>
              QR scanned — confirm on your phone
            </div>
            <div className="mx-auto mt-1 max-w-[340px] text-sm" style={{ color: B.muted }}>
              Tap Approve in the AsanPay app to finish signing in on this computer.
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-[226px] w-[226px] items-center justify-center rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              {phase === "loading" || !qr ? (
                <RefreshCw size={26} className="animate-spin" style={{ color: B.muted }} />
              ) : (
                <QRCodeSVG value={qr.qrValue} size={206} fgColor={B.blue} marginSize={1} />
              )}
            </div>
            <div className="mt-4 text-base font-bold" style={{ color: B.blue }}>
              Scan with the AsanPay app
            </div>
            <ol className="mx-auto mt-2 max-w-[340px] list-decimal space-y-1 pl-5 text-left text-sm" style={{ color: B.muted }}>
              <li>Open the AsanPay app on your phone (you must be logged in).</li>
              <li>Tap the Scan icon at the top of the home screen.</li>
              <li>Point the camera at this QR. Keep Location (GPS) on.</li>
            </ol>
            <div className="mt-3 text-xs" style={{ color: B.muted }}>
              The QR refreshes every 2 minutes.
            </div>
          </>
        )}
      </div>
      <button type="button" className="w-full text-xs font-semibold" style={{ color: "#DC2626" }} onClick={onCancel}>
        Back to login
      </button>
    </div>
  );
}
