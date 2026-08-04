"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Fingerprint, ScanFace } from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import {
  captureFingerprintWeb,
  formatRdDeviceLabel,
  warmRdService,
  type RdEndpoint,
} from "@/lib/rdServiceFingerprint";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SpKey = "WAP" | "DMI";

interface BioKycStatus {
  action: string;
  status: string;
  approved: boolean;
  outletAadhaarNumber: string | null;
  isFaceAuthAvailable: boolean;
  isBiometricKycMandatory: boolean;
  pidOptionWadh: string | null;
  referenceKey: string | null;
  referenceKeyType: string | null;
  live: boolean;
}

const RAILS: { key: SpKey; label: string; hint: string }[] = [
  { key: "WAP", label: "AePS", hint: "Bank Aadhaar transactions" },
  { key: "DMI", label: "DMT", hint: "Money transfer rail" },
];

export default function BioKycOnboardingPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [spKey, setSpKey] = useState<SpKey>("WAP");
  const [status, setStatus] = useState<BioKycStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aadhaar, setAadhaar] = useState("");
  const [rd, setRd] = useState<RdEndpoint | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!hydrated || !accessToken || !user) return;
    if (user.role !== "retailer") {
      router.replace("/dashboard");
      return;
    }
    if (!user.hasInstantpayOutlet) {
      router.replace("/onboarding/outlet");
    }
  }, [hydrated, accessToken, user, router]);

  useEffect(() => {
    void warmRdService().then(setRd);
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.post<ApiResponse<BioKycStatus>>(
        "/onboarding/instantpay/bio-kyc-status",
        { spKey },
      );
      if (!data.success) throw new Error(data.message);
      setStatus(data.data);
    } catch (err) {
      setStatus(null);
      toast.error(extractApiError(err, "Could not load biometric KYC status"));
    } finally {
      setLoading(false);
    }
  }, [spKey]);

  useEffect(() => {
    if (hydrated && accessToken && user?.hasInstantpayOutlet) {
      void refreshStatus();
    }
  }, [hydrated, accessToken, user?.hasInstantpayOutlet, refreshStatus]);

  const needsCapture =
    status &&
    !status.approved &&
    String(status.action).toUpperCase().includes("ACTION-REQUIRED");
  const needsAadhaar = needsCapture && !status?.outletAadhaarNumber;

  async function submitBioKyc() {
    if (!status?.referenceKey) {
      toast.error("Check biometric KYC status first — missing reference key");
      return;
    }
    if (needsAadhaar && aadhaar.replace(/\D/g, "").length !== 12) {
      toast.error("Enter the 12-digit Aadhaar linked to this outlet");
      return;
    }
    if (status.live && !status.pidOptionWadh) {
      toast.error("Biometric KYC status did not return wadh. Refresh status and try again.");
      return;
    }

    setScanning(true);
    try {
      await warmRdService();
      const biometricPayload = await captureFingerprintWeb({
        wadh: status.pidOptionWadh || undefined,
      });

      const body: Record<string, string> = {
        referenceKey: status.referenceKey,
        biometricPayload,
      };
      if (needsAadhaar) body.aadhaarNumber = aadhaar.replace(/\D/g, "");

      const { data } = await api.post<ApiResponse<{ message: string }>>(
        "/onboarding/instantpay/bio-kyc",
        body,
      );
      if (!data.success) throw new Error(data.message);
      toast.success(data.data.message || "Biometric KYC submitted");
      await refreshStatus();
    } catch (err) {
      toast.error(extractApiError(err, "Biometric KYC failed"));
    } finally {
      setScanning(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-5 p-6">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Fingerprint size={20} style={{ color: B.blue }} />
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Outlet biometric KYC
            </h1>
          </div>
          <p className="text-sm" style={{ color: B.muted }}>
            Verify Aadhaar fingerprint on InstantPay to enable AePS / DMT rails. Place finger on the
            scanner when prompted.
          </p>
        </div>

        <div className="flex gap-2">
          {RAILS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSpKey(r.key)}
              className="flex-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors"
              style={{
                borderColor: spKey === r.key ? B.blue : B.border,
                background: spKey === r.key ? `${B.blue}0C` : "#fff",
                color: B.blue,
              }}
            >
              <div className="font-semibold">{r.label}</div>
              <div className="text-xs" style={{ color: B.muted }}>
                {r.hint}
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border bg-white p-5 space-y-3" style={{ borderColor: B.border }}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold" style={{ color: B.blue }}>
              Status ({spKey})
            </div>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={loading}
              className="text-xs font-semibold underline-offset-2 hover:underline"
              style={{ color: B.blueLight }}
            >
              {loading ? "Checking…" : "Refresh"}
            </button>
          </div>

          {status ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt style={{ color: B.muted }}>Action</dt>
              <dd className="font-medium" style={{ color: B.blue }}>
                {status.action || "—"}
              </dd>
              <dt style={{ color: B.muted }}>Status</dt>
              <dd className="font-medium" style={{ color: status.approved ? B.green : B.blue }}>
                {status.status || "—"}
                {status.approved ? " · Ready" : ""}
              </dd>
              <dt style={{ color: B.muted }}>Aadhaar</dt>
              <dd className="font-medium" style={{ color: B.blue }}>
                {status.outletAadhaarNumber || "Not on file — enter below"}
              </dd>
              <dt style={{ color: B.muted }}>Mode</dt>
              <dd className="font-medium" style={{ color: B.blue }}>
                {status.live ? "Live InstantPay" : "Dummy (auto-approved)"}
              </dd>
            </dl>
          ) : (
            <p className="text-sm" style={{ color: B.muted }}>
              Tap Refresh to load status for this rail.
            </p>
          )}
        </div>

        {needsCapture ? (
          <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <p className="text-sm" style={{ color: B.muted }}>
              Biometric capture is required. RD device:{" "}
              <span className="font-medium" style={{ color: B.blue }}>
                {rd ? formatRdDeviceLabel(rd) : "Not detected yet"}
              </span>
            </p>

            {needsAadhaar ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Aadhaar number (12 digits)
                </span>
                <input
                  inputMode="numeric"
                  maxLength={12}
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-1"
                  style={{ borderColor: B.border, color: B.blue }}
                  placeholder="12-digit Aadhaar"
                />
              </label>
            ) : null}

            <button
              type="button"
              disabled={scanning || loading}
              onClick={() => void submitBioKyc()}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: B.blue }}
            >
              <ScanFace size={18} />
              {scanning ? "Capturing fingerprint…" : "Capture & submit biometric KYC"}
            </button>
          </div>
        ) : status?.approved ? (
          <div
            className="rounded-2xl border p-4 text-sm font-medium"
            style={{ borderColor: B.green, background: `${B.green}0A`, color: B.green }}
          >
            This rail is approved. You can run transactions when other onboarding steps are complete.
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="w-full rounded-xl border px-4 py-3 text-sm font-semibold"
          style={{ borderColor: B.border, color: B.blue }}
        >
          Continue to dashboard
        </button>
      </div>
    </AppShell>
  );
}
