"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, Copy, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import {
  groupSecret,
  isTotpSetupRequiredFlag,
  markTotpSetupRequired,
  onlyDigits,
  type AdminTotpSetup,
  type AdminTotpStatus,
} from "@/lib/adminTotp";

function errMsg(err: unknown, fallback: string): string {
  const ax = err as { message?: string; response?: { data?: { message?: string } } };
  return ax.response?.data?.message || ax.message || fallback;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy the ${label.toLowerCase()}. Select the text and copy it manually.`);
  }
}

const fieldClass = "w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2";

function CodeField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-xs font-semibold" style={{ color: B.muted }}>
        6-digit code
      </span>
      <input
        id={id}
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        placeholder="123456"
        aria-invalid={Boolean(error)}
        className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
        style={{ borderColor: error ? B.danger : B.border, background: B.card, color: B.blue }}
      />
      <span className="block text-xs" style={{ color: error ? B.danger : B.muted }}>
        {error ?? "Enter the current code shown in your authenticator app."}
      </span>
    </label>
  );
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [status, setStatus] = useState<AdminTotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forcedByLogin, setForcedByLogin] = useState(isTotpSetupRequiredFlag);

  const [setup, setSetup] = useState<AdminTotpSetup | null>(null);
  const [startingSetup, setStartingSetup] = useState(false);
  const [enableCode, setEnableCode] = useState("");
  const [enableError, setEnableError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchApi<AdminTotpStatus>("/auth/admin/totp/status");
      setStatus(next);
      if (next.enabled) markTotpSetupRequired(false);
    } catch (err) {
      setLoadError(errMsg(err, "Could not load two-factor status. Refresh the page to try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function startSetup() {
    setStartingSetup(true);
    try {
      const { data } = await api.post<ApiResponse<AdminTotpSetup>>("/auth/admin/totp/setup", {});
      if (!data.success) throw new Error(data.message);
      setSetup(data.data);
      setEnableCode("");
      setEnableError(null);
    } catch (err) {
      toast.error(errMsg(err, "Could not start authenticator setup. Try again."));
    } finally {
      setStartingSetup(false);
    }
  }

  function closeSetup() {
    setSetup(null);
    setEnableCode("");
    setEnableError(null);
    void load();
  }

  async function onEnable(e: FormEvent) {
    e.preventDefault();
    if (enableCode.length !== 6) {
      setEnableError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setEnabling(true);
    setEnableError(null);
    try {
      const { data } = await api.post<ApiResponse<AdminTotpStatus>>("/auth/admin/totp/enable", {
        code: enableCode,
      });
      if (!data.success) throw new Error(data.message);
      setStatus(data.data);
      markTotpSetupRequired(false);
      setForcedByLogin(false);
      setSetup(null);
      setEnableCode("");
      toast.success("Two-factor login is on");
    } catch (err) {
      setEnableError(errMsg(err, "Incorrect 6-digit code. Check your authenticator app and try again."));
      setEnableCode("");
    } finally {
      setEnabling(false);
    }
  }

  function closeDisable() {
    setDisableOpen(false);
    setDisableCode("");
    setDisablePassword("");
    setDisableError(null);
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    if (disableCode.length !== 6) {
      setDisableError("Enter the 6-digit code from your authenticator app");
      return;
    }
    if (!disablePassword) {
      setDisableError("Enter your current admin password");
      return;
    }
    setDisabling(true);
    setDisableError(null);
    try {
      const { data } = await api.post<ApiResponse<AdminTotpStatus>>("/auth/admin/totp/disable", {
        code: disableCode,
        password: disablePassword,
      });
      if (!data.success) throw new Error(data.message);
      setStatus(data.data);
      closeDisable();
      toast.success("Two-factor login is off");
    } catch (err) {
      setDisableError(errMsg(err, "Could not turn off two-factor login. Check the code and password."));
      setDisableCode("");
    } finally {
      setDisabling(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const showRequiredBanner = Boolean(status && !status.enabled && (status.required || forcedByLogin));

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
            Security
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Two-factor login for the admin portal. After your password, you also enter a 6-digit code from an
            authenticator app on your phone.
          </p>
        </div>

        {showRequiredBanner ? (
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: "rgba(217,119,6,0.4)", background: "rgba(217,119,6,0.08)" }}
            role="alert"
          >
            <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: "#D97706" }} />
            <div className="text-sm" style={{ color: B.blue }}>
              <p className="font-semibold">Two-factor login is required for admin accounts</p>
              <p className="mt-0.5" style={{ color: B.muted }}>
                Set up an authenticator app now. Until it is on, every admin sign-in brings you back to this page.
              </p>
            </div>
          </div>
        ) : null}

        {loading && !status ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : loadError ? (
          <p className="text-sm" style={{ color: B.danger }}>
            {loadError}
          </p>
        ) : status ? (
          <section className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    background: status.enabled ? "rgba(18,183,106,0.14)" : "rgba(220,38,38,0.12)",
                    color: status.enabled ? B.greenDark : B.danger,
                  }}
                >
                  {status.enabled ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: B.blue }}>
                    {status.enabled ? "Two-factor login is on" : "Two-factor login is off"}
                  </h2>
                  <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
                    {status.enabled
                      ? `Turned on ${status.enabledAt ? new Date(status.enabledAt).toLocaleString("en-IN") : ""}. Sign-in asks for a code from your authenticator app.`
                      : status.pendingSetup
                        ? "A previous setup was not finished. Set up again to get a fresh key."
                        : "Anyone with the admin password can sign in. Add an authenticator app to block that."}
                  </p>
                </div>
              </div>
              {status.enabled ? (
                <button
                  type="button"
                  onClick={() => setDisableOpen(true)}
                  className="admin-btn-danger shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold"
                >
                  Turn off
                </button>
              ) : (
                <button
                  type="button"
                  disabled={startingSetup}
                  onClick={() => void startSetup()}
                  className="admin-btn-success shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {startingSetup ? "Preparing…" : "Set up authenticator"}
                </button>
              )}
            </div>
          </section>
        ) : null}

        <p className="text-xs" style={{ color: B.muted }}>
          Works with Google Authenticator, Microsoft Authenticator and any app that supports time-based codes (TOTP).
        </p>
      </div>

      {setup ? (
        <Modal
          title="Link your authenticator app"
          eyebrow="Authenticator setup"
          subtitle="Add the key in your authenticator app, then enter the 6-digit code it shows."
          icon={<KeyRound size={22} />}
          iconTone="green"
          wide
          onClose={closeSetup}
        >
          <form onSubmit={onEnable} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div
                className="flex h-full flex-col gap-3 rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
              >
                <div className="flex items-center gap-2">
                  <Smartphone size={16} style={{ color: B.blueLight }} />
                  <p className="text-sm font-semibold" style={{ color: B.blue }}>
                    In the app: tap + → Scan a QR code
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl border p-3" style={{ borderColor: B.border, background: "#fff" }}>
                  <QRCodeSVG value={setup.otpauthUrl} size={176} level="M" marginSize={2} aria-label="Authenticator setup QR code" />
                  <p className="text-center text-[11px]" style={{ color: B.muted }}>
                    Works with Google Authenticator and Microsoft Authenticator. Do not share or screenshot this code.
                  </p>
                </div>
                <p className="text-xs font-semibold" style={{ color: B.muted }}>
                  Can&apos;t scan? Tap + → Enter a setup key, and use:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                    <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                      Account name
                    </p>
                    <p className="text-sm font-semibold" style={{ color: B.blue }}>
                      AsanPay admin
                    </p>
                  </div>
                  <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                    <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                      Type of key
                    </p>
                    <p className="text-sm font-semibold" style={{ color: B.blue }}>
                      Time based
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: B.border }}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                    Setup key
                  </p>
                  <p className="mt-1 break-all font-mono text-base font-semibold tracking-wider" style={{ color: B.blue }}>
                    {groupSecret(setup.secretBase32)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyText(setup.secretBase32, "Setup key")}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: B.blueLight }}
                  >
                    <Copy size={13} />
                    Copy key
                  </button>
                </div>
              </div>

              <div className="flex h-full flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: B.border }}>
                <p className="text-sm font-semibold" style={{ color: B.blue }}>
                  Confirm the code
                </p>
                <CodeField
                  id="enable-code"
                  value={enableCode}
                  onChange={(v) => {
                    setEnableCode(v);
                    setEnableError(null);
                  }}
                  error={enableError}
                />
                <div
                  className="mt-auto rounded-xl p-3 text-xs"
                  style={{ background: "rgba(42,92,221,0.08)", color: B.muted }}
                >
                  Keep this phone safe. If you lose it, another admin with database access must clear two-factor
                  for this account before you can sign in.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeSetup}
                className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={enabling || enableCode.length !== 6}
                className="admin-btn-success rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {enabling ? "Enabling…" : "Enable"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {disableOpen ? (
        <Modal
          title="Turn off two-factor login"
          subtitle="Enter a current code and your admin password. Sign-in will then need only the password."
          icon={<ShieldOff size={22} />}
          iconTone="red"
          onClose={closeDisable}
        >
          <form onSubmit={onDisable} className="space-y-4">
            <div
              className="space-y-3 rounded-2xl border p-4"
              style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
            >
              <CodeField
                id="disable-code"
                value={disableCode}
                onChange={(v) => {
                  setDisableCode(v);
                  setDisableError(null);
                }}
                error={null}
              />
              <label htmlFor="disable-password" className="block space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Admin password
                </span>
                <input
                  id="disable-password"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => {
                    setDisablePassword(e.target.value);
                    setDisableError(null);
                  }}
                  className={fieldClass}
                  style={{ borderColor: B.border, background: B.card, color: B.blue }}
                />
              </label>
              {disableError ? (
                <p className="text-xs font-semibold" style={{ color: B.danger }} role="alert">
                  {disableError}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeDisable}
                className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disabling || disableCode.length !== 6 || !disablePassword}
                className="admin-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {disabling ? "Verifying…" : "Verify and turn off"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </AdminShell>
  );
}
