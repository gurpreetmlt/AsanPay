"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Fingerprint, Plus, X, AlertTriangle } from "lucide-react";
import { B } from "@/lib/brand";
import api, { fetchApi } from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";

interface DeviceRow {
  id: string;
  serial: string;
  vendor: string | null;
  model: string | null;
  rdLicenseExpiry: string | null;
  registeredAt: string;
}

const MAX_DEVICES = 3; // mirrors backend MAX_AGENT_DEVICES default; server is the source of truth

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * The UIDAI L1 scanner registry — distinct from "Logged-in Devices" above, which is app
 * sessions. Self-service by design: OTP to the registered mobile, then register or
 * de-register directly. See apps/backend/src/modules/devices/agentDevice.service.ts.
 */
export function BiometricDevices() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [serial, setSerial] = useState("");
  const [vendor, setVendor] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setDevices(await fetchApi<DeviceRow[]>("/devices"));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load devices"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function requestOtp() {
    if (!serial.trim()) {
      toast.error("Enter the device serial number");
      return;
    }
    setBusy(true);
    try {
      await api.post("/devices/otp");
      setOtpSent(true);
      toast.success("OTP sent to your registered mobile");
    } catch (err) {
      toast.error(extractApiError(err, "Could not send OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit OTP");
      return;
    }
    setBusy(true);
    try {
      await api.post("/devices", {
        serial: serial.trim(),
        vendor: vendor.trim() || undefined,
        otp,
      });
      toast.success("Device registered");
      resetForm();
      await load();
    } catch (err) {
      // DEVICE_LIMIT_REACHED and DEVICE_IN_USE are expected outcomes, not bugs — the API
      // message already explains what to do (de-register one, or ask the other agent to).
      toast.error(extractApiError(err, "Registration failed"));
    } finally {
      setBusy(false);
    }
  }

  async function deregister(id: string) {
    const reason = window.prompt("Why are you removing this device? (e.g. replaced, lost)");
    if (reason === null) return;
    setBusy(true);
    try {
      await api.delete(`/devices/${id}`, { data: { reason } });
      toast.success("Device de-registered");
      await load();
    } catch (err) {
      toast.error(extractApiError(err, "Could not de-register device"));
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setShowAdd(false);
    setOtpSent(false);
    setOtp("");
    setSerial("");
    setVendor("");
  }

  const atLimit = (devices?.length ?? 0) >= MAX_DEVICES;

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: B.blue }}>
            Biometric Devices
          </h2>
          <p className="text-xs" style={{ color: B.muted }}>
            You can register up to {MAX_DEVICES} devices at a time.
          </p>
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: B.blue }}
          >
            <Plus size={14} />
            Add device
          </button>
        )}
      </div>

      {devices === null ? (
        <p className="text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : devices.length === 0 && !showAdd ? (
        <p className="text-sm" style={{ color: B.muted }}>
          No biometric devices registered yet.
        </p>
      ) : (
        devices.map((d) => {
          const expiryDays = daysUntil(d.rdLicenseExpiry);
          const expirySoon = expiryDays !== null && expiryDays <= 15;
          return (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-xl border p-4"
              style={{ borderColor: expirySoon ? "#F59E0B" : B.border }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: B.secondary }}
                >
                  <Fingerprint size={18} style={{ color: B.blue }} />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: B.blue }}>
                    {d.vendor ?? "Device"} · {d.serial}
                  </div>
                  <div className="text-xs" style={{ color: B.muted }}>
                    Registered {new Date(d.registeredAt).toLocaleDateString()}
                  </div>
                  {expiryDays !== null && (
                    <div
                      className="mt-0.5 flex items-center gap-1 text-xs font-medium"
                      style={{ color: expirySoon ? "#B45309" : B.muted }}
                    >
                      {expirySoon && <AlertTriangle size={12} />}
                      {expiryDays < 0
                        ? "RD licence expired"
                        : `RD licence expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void deregister(d.id)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-red-50 disabled:opacity-50"
                style={{ borderColor: "#DC262630", color: "#DC2626" }}
              >
                De-register
              </button>
            </div>
          );
        })
      )}

      {showAdd && (
        <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: B.border, background: B.bg }}>
          {atLimit ? (
            <p className="text-sm font-medium" style={{ color: "#B45309" }}>
              You already have {MAX_DEVICES} devices registered. De-register one before adding
              another.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: B.blue }}>
                  Register new device
                </p>
                <button type="button" onClick={resetForm} aria-label="Cancel">
                  <X size={16} style={{ color: B.muted }} />
                </button>
              </div>

              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="Device serial number"
                disabled={otpSent}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none disabled:opacity-60"
                style={{ borderColor: B.border, color: B.blue }}
              />
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Vendor (e.g. Mantra) — optional"
                disabled={otpSent}
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none disabled:opacity-60"
                style={{ borderColor: B.border, color: B.blue }}
              />

              {!otpSent ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void requestOtp()}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: B.blue }}
                >
                  Send OTP
                </button>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                    style={{ borderColor: B.border, color: B.blue }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void register()}
                    className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: B.green }}
                  >
                    Confirm & Register
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
