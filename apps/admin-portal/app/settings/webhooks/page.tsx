"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { SECURITY_PAGE, onlyDigits, type AdminTotpStatus } from "@/lib/adminTotp";

type Provider = "noble" | "vyaparapi" | "telegram" | "whatsapp";

interface WebhookKey {
  id: string;
  provider: Provider;
  name: string;
  notes: string | null;
  last4: string;
  maskedSecret: string;
  source: "generated" | "pasted";
  status: "active" | "disabled";
  expiresAt: string | null;
  createdAt: string;
  createdByName: string | null;
  lastUsedAt: string | null;
  useCount: number;
  callbackUrl: string | null;
  callbackNote: string | null;
}

interface RevealedKey {
  keyId: string;
  secret: string;
  callbackUrl: string | null;
  callbackNote: string | null;
}

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "noble", label: "Noble" },
  { value: "vyaparapi", label: "VyaparAPI" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
];

const providerLabel = (p: string) => PROVIDERS.find((x) => x.value === p)?.label ?? p;

const REVEAL_SECONDS = 30;
const fieldClass = "w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2";
const neutralBtn = "rounded-xl border px-3 py-1.5 text-xs font-semibold";

function errMsg(err: unknown, fallback: string): string {
  const ax = err as { message?: string; response?: { data?: { message?: string } } };
  return ax.response?.data?.message || ax.message || fallback;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function statusPill(k: WebhookKey, now: number): { label: string; bg: string; fg: string } {
  const grey = { bg: "rgba(100,116,139,0.14)", fg: "#64748B" };
  if (k.status === "disabled") return { label: "Disabled", ...grey };
  if (k.expiresAt) {
    const ms = new Date(k.expiresAt).getTime() - now;
    if (ms <= 0) return { label: "Expired", ...grey };
    return { label: `Expires in ${Math.max(1, Math.ceil(ms / 3_600_000))}h`, bg: "rgba(217,119,6,0.14)", fg: "#D97706" };
  }
  return { label: "Active", bg: "rgba(18,183,106,0.14)", fg: B.greenDark };
}

function isLive(k: WebhookKey, now: number): boolean {
  return k.status === "active" && (!k.expiresAt || new Date(k.expiresAt).getTime() > now);
}

export default function WebhookKeysPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [keys, setKeys] = useState<WebhookKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totp, setTotp] = useState<AdminTotpStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [createOpen, setCreateOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("noble");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [pasted, setPasted] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<WebhookKey | null>(null);

  const [revealFor, setRevealFor] = useState<WebhookKey | null>(null);
  const [code, setCode] = useState("");
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [confirm, setConfirm] = useState<{ kind: "rotate" | "disable"; key: WebhookKey } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, status] = await Promise.all([
        fetchApi<WebhookKey[]>("/admin/webhook-keys"),
        fetchApi<AdminTotpStatus>("/auth/admin/totp/status").catch(() => null),
      ]);
      setKeys(list);
      setTotp(status);
    } catch (err) {
      setLoadError(errMsg(err, "Could not load webhook keys. Refresh the page to try again."));
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [revealed]);

  useEffect(() => {
    if (revealed && secondsLeft === 0) {
      setRevealed(null);
      setRevealFor(null);
    }
  }, [revealed, secondsLeft]);

  function openCreate() {
    setProvider("noble");
    setName("");
    setNotes("");
    setMode("generate");
    setPasted("");
    setCreateError(null);
    setCreated(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setCreated(null);
    setPasted("");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setCreateError("Name / purpose must be at least 2 characters");
      return;
    }
    if (mode === "paste" && (pasted.trim().length < 16 || pasted.trim().length > 200)) {
      setCreateError("Pasted key must be 16 to 200 characters");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await api.post<ApiResponse<WebhookKey>>("/admin/webhook-keys", {
        provider,
        name: name.trim(),
        notes: notes.trim() || null,
        ...(mode === "paste" ? { secret: pasted.trim() } : {}),
      });
      if (!data.success) throw new Error(data.message);
      setCreated(data.data);
      setPasted("");
      void load();
    } catch (err) {
      setCreateError(errMsg(err, "Could not create the key. Check the fields and try again."));
    } finally {
      setCreating(false);
    }
  }

  function openReveal(k: WebhookKey) {
    if (totp && !totp.enabled) {
      toast.error("Turn on two-factor login in Admin → Security before viewing keys.");
      return;
    }
    setRevealed(null);
    setCode("");
    setRevealError(null);
    setRevealFor(k);
  }

  /** Closing keeps the revealed key until the countdown ends so the table can copy the full URL. */
  function closeReveal() {
    setRevealFor(null);
    setCode("");
  }

  function hideNow() {
    setRevealed(null);
    setRevealFor(null);
    setCode("");
  }

  async function onReveal(e: FormEvent) {
    e.preventDefault();
    if (!revealFor) return;
    if (code.length !== 6) {
      setRevealError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setRevealing(true);
    setRevealError(null);
    try {
      const { data } = await api.post<ApiResponse<Omit<RevealedKey, "keyId">>>(
        `/admin/webhook-keys/${revealFor.id}/reveal`,
        { totpCode: code },
      );
      if (!data.success) throw new Error(data.message);
      setRevealed({ keyId: revealFor.id, ...data.data });
      setSecondsLeft(REVEAL_SECONDS);
      setCode("");
    } catch (err) {
      setRevealError(errMsg(err, "Incorrect 6-digit code. Check your authenticator app and try again."));
      setCode("");
    } finally {
      setRevealing(false);
    }
  }

  async function onConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      const path = `/admin/webhook-keys/${confirm.key.id}/${confirm.kind}`;
      const body = confirm.kind === "disable" ? { reason: reason.trim() || null } : {};
      const { data } = await api.post<ApiResponse<WebhookKey>>(path, body);
      if (!data.success) throw new Error(data.message);
      toast.success(
        confirm.kind === "rotate" ? "New key created. Click the eye to view it and send it to the provider." : "Key disabled",
      );
      setConfirm(null);
      setReason("");
      void load();
    } catch (err) {
      toast.error(errMsg(err, confirm.kind === "rotate" ? "Could not rotate the key. Try again." : "Could not disable the key. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const urlUnlocked = (k: WebhookKey) => revealed?.keyId === k.id && Boolean(revealed.callbackUrl);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
              Webhooks & callback keys
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Keys providers send with every callback. Server keys (JWT, encryption, database) stay in the server
              settings.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="admin-btn-success inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            <Plus size={16} />
            Generate callback key
          </button>
        </div>

        {totp && !totp.enabled ? (
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: "rgba(217,119,6,0.4)", background: "rgba(217,119,6,0.08)" }}
            role="alert"
          >
            <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: "#D97706" }} />
            <div className="text-sm" style={{ color: B.blue }}>
              <p className="font-semibold">Two-factor login is off</p>
              <p className="mt-0.5" style={{ color: B.muted }}>
                Viewing or copying a key needs a 6-digit authenticator code.{" "}
                <Link href={SECURITY_PAGE} className="font-semibold underline" style={{ color: B.blueLight }}>
                  Turn it on in Security
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border, background: B.card }}>
          {loading && keys.length === 0 ? (
            <p className="p-5 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : loadError ? (
            <p className="p-5 text-sm" style={{ color: B.danger }}>
              {loadError}
            </p>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <KeyRound size={28} style={{ color: B.muted }} />
              <p className="text-sm font-semibold" style={{ color: B.blue }}>
                No callback keys yet
              </p>
              <p className="max-w-md text-xs" style={{ color: B.muted }}>
                Until you add one, callbacks use the secret set in the server settings (if any). Generate a key and send
                the callback URL to the provider.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: B.muted, background: B.bg }}>
                    <th className="px-4 py-3 font-semibold">Name / purpose</th>
                    <th className="px-4 py-3 font-semibold">Provider</th>
                    <th className="px-4 py-3 font-semibold">Callback URL</th>
                    <th className="px-4 py-3 font-semibold">Secret</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Last used</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const pill = statusPill(k, now);
                    const live = isLive(k, now);
                    return (
                      <tr key={k.id} className="border-t align-top" style={{ borderColor: B.border }}>
                        <td className="px-4 py-3">
                          <p className="font-semibold" style={{ color: B.blue }}>
                            {k.name}
                          </p>
                          {k.notes ? (
                            <p className="mt-0.5 max-w-[220px] text-xs" style={{ color: B.muted }}>
                              {k.notes}
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-[11px]" style={{ color: B.muted }}>
                            {k.source === "pasted" ? "Pasted key" : "Generated key"}
                          </p>
                        </td>
                        <td className="px-4 py-3" style={{ color: B.blue }}>
                          {providerLabel(k.provider)}
                        </td>
                        <td className="px-4 py-3">
                          {k.callbackUrl ? (
                            <div className="flex items-start gap-2">
                              <code className="max-w-[260px] break-all text-[11px]" style={{ color: B.blue }}>
                                {k.callbackUrl}
                              </code>
                              <button
                                type="button"
                                disabled={!urlUnlocked(k)}
                                onClick={() => revealed?.callbackUrl && void copyText(revealed.callbackUrl)}
                                title={
                                  urlUnlocked(k)
                                    ? `Copy full callback URL (${secondsLeft}s left)`
                                    : "Click the eye to view the key first"
                                }
                                aria-label="Copy callback URL"
                                className="shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                                style={{ color: B.blueLight }}
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          ) : (
                            <p className="max-w-[260px] text-xs" style={{ color: B.muted }}>
                              {k.callbackNote}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs" style={{ color: B.blue }}>
                              {k.maskedSecret}
                            </code>
                            <button
                              type="button"
                              onClick={() => openReveal(k)}
                              aria-label="View key"
                              title="View key"
                              style={{ color: B.blueLight }}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openReveal(k)}
                              aria-label="Copy key"
                              title="Copy key"
                              style={{ color: B.blueLight }}
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: B.blue }}>
                          {fmtDate(k.createdAt)}
                          <p style={{ color: B.muted }}>by {k.createdByName ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: B.blue }}>
                          {k.lastUsedAt ? fmtDate(k.lastUsedAt) : "Never"}
                          {k.useCount > 0 ? <p style={{ color: B.muted }}>{k.useCount} callbacks</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ background: pill.bg, color: pill.fg }}
                          >
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {live ? (
                            <div className="flex justify-end gap-2">
                              {!k.expiresAt ? (
                                <button
                                  type="button"
                                  onClick={() => setConfirm({ kind: "rotate", key: k })}
                                  className={`${neutralBtn} inline-flex items-center gap-1`}
                                  style={{ borderColor: B.border, color: B.blue }}
                                >
                                  <RefreshCw size={12} />
                                  Rotate
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setReason("");
                                  setConfirm({ kind: "disable", key: k });
                                }}
                                className="admin-btn-danger rounded-xl px-3 py-1.5 text-xs font-semibold"
                              >
                                Disable
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {createOpen ? (
        <Modal
          title={created ? "Callback key created" : "Generate callback key"}
          subtitle={
            created
              ? "Click the eye to view and copy the full callback URL to send to the provider."
              : "The provider sends this key with every callback so we know it is really them."
          }
          icon={created ? <CheckCircle2 size={22} /> : <KeyRound size={22} />}
          iconTone="green"
          onClose={closeCreate}
        >
          {created ? (
            <div className="space-y-4">
              <div
                className="grid grid-cols-2 gap-2 rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
              >
                <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                    Provider
                  </p>
                  <p className="text-sm font-semibold" style={{ color: B.blue }}>
                    {providerLabel(created.provider)}
                  </p>
                </div>
                <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                    Key
                  </p>
                  <p className="font-mono text-sm font-semibold" style={{ color: B.blue }}>
                    {created.maskedSecret}
                  </p>
                </div>
                <p className="col-span-2 text-xs" style={{ color: B.muted }}>
                  Click the eye to view and copy the full callback URL to send to the provider.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                className="admin-btn-primary w-full rounded-xl py-2.5 text-sm font-semibold"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={onCreate} className="space-y-4">
              <div
                className="space-y-3 rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Provider
                  </span>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as Provider)}
                    className={fieldClass}
                    style={{ borderColor: B.border, background: B.card, color: B.blue }}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Name / purpose <span style={{ color: B.danger }}>*</span>
                  </span>
                  <input
                    value={name}
                    maxLength={120}
                    onChange={(e) => {
                      setName(e.target.value);
                      setCreateError(null);
                    }}
                    className={fieldClass}
                    style={{ borderColor: B.border, background: B.card, color: B.blue }}
                  />
                  <span className="block text-xs" style={{ color: B.muted }}>
                    e.g. Noble callbacks for UPI QR, Recharge and CMS
                  </span>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Notes
                  </span>
                  <input
                    value={notes}
                    maxLength={300}
                    onChange={(e) => setNotes(e.target.value)}
                    className={fieldClass}
                    style={{ borderColor: B.border, background: B.card, color: B.blue }}
                  />
                </label>
                <div className="space-y-2">
                  {(
                    [
                      ["generate", "Generate a strong key (recommended)"],
                      ["paste", "Paste a key the provider gave me"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: B.blue }}>
                      <input
                        type="radio"
                        name="key-mode"
                        checked={mode === value}
                        onChange={() => {
                          setMode(value);
                          setCreateError(null);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                  {mode === "paste" ? (
                    <input
                      type="password"
                      autoComplete="off"
                      value={pasted}
                      maxLength={200}
                      onChange={(e) => {
                        setPasted(e.target.value);
                        setCreateError(null);
                      }}
                      placeholder="16 to 200 characters"
                      className={fieldClass}
                      style={{ borderColor: B.border, background: B.card, color: B.blue }}
                    />
                  ) : null}
                </div>
                {createError ? (
                  <p className="text-xs font-semibold" style={{ color: B.danger }} role="alert">
                    {createError}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={closeCreate} className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || name.trim().length < 2 || (mode === "paste" && pasted.trim().length < 16)}
                  className="admin-btn-success rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {creating ? "Creating…" : "Generate key"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}

      {revealFor ? (
        <Modal
          title={revealed ? "Callback key" : "Verify to view key"}
          eyebrow={`${providerLabel(revealFor.provider)} · ${revealFor.name}`}
          subtitle={
            revealed
              ? `Hides automatically in ${secondsLeft}s. Send it to the provider over a private channel.`
              : "Enter the current 6-digit code from your authenticator app."
          }
          icon={revealed ? <KeyRound size={22} /> : <ShieldCheck size={22} />}
          iconTone="blue"
          onClose={closeReveal}
        >
          {revealed ? (
            <div className="space-y-4">
              <div
                className="space-y-3 rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
              >
                <div className="rounded-xl border p-3" style={{ borderColor: B.border }}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                    Secret key
                  </p>
                  <p className="mt-1 break-all font-mono text-sm font-semibold" style={{ color: B.blue }}>
                    {revealed.secret}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyText(revealed.secret)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: B.blueLight }}
                  >
                    <Copy size={13} />
                    Copy key
                  </button>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: B.border }}>
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                    {revealed.callbackUrl ? "Callback URL" : "Where to use it"}
                  </p>
                  {revealed.callbackUrl ? (
                    <>
                      <p className="mt-1 break-all font-mono text-[11px]" style={{ color: B.blue }}>
                        {revealed.callbackUrl}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyText(revealed.callbackUrl!)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
                        style={{ color: B.blueLight }}
                      >
                        <Copy size={13} />
                        Copy callback URL
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-sm" style={{ color: B.blue }}>
                      {revealed.callbackNote}
                    </p>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: B.bg }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${(secondsLeft / REVEAL_SECONDS) * 100}%`, background: B.blueLight }}
                  />
                </div>
              </div>
              <button type="button" onClick={hideNow} className="admin-btn-primary w-full rounded-xl py-2.5 text-sm font-semibold">
                Hide now
              </button>
            </div>
          ) : (
            <form onSubmit={onReveal} className="space-y-4">
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
              >
                <label htmlFor="reveal-code" className="block space-y-1.5">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    6-digit code
                  </span>
                  <input
                    id="reveal-code"
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      setCode(onlyDigits(e.target.value));
                      setRevealError(null);
                    }}
                    placeholder="123456"
                    aria-invalid={Boolean(revealError)}
                    className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
                    style={{ borderColor: revealError ? B.danger : B.border, background: B.card, color: B.blue }}
                  />
                  <span className="block text-xs" style={{ color: revealError ? B.danger : B.muted }}>
                    {revealError ?? "Each code works once. Wait for the next code if you just used one."}
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={closeReveal} className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={revealing || code.length !== 6}
                  className="admin-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {revealing ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      ) : null}

      {confirm ? (
        <Modal
          title={confirm.kind === "rotate" ? "Rotate callback key" : "Disable callback key"}
          eyebrow={`${providerLabel(confirm.key.provider)} · ${confirm.key.name}`}
          subtitle={
            confirm.kind === "rotate"
              ? "A new key is created. The old key keeps working for 24 hours, then stops. Send the new key to the provider."
              : "Callbacks using this key stop working immediately."
          }
          icon={confirm.kind === "rotate" ? <RefreshCw size={22} /> : <Ban size={22} />}
          iconTone={confirm.kind === "rotate" ? "amber" : "red"}
          onClose={() => setConfirm(null)}
        >
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-2 rounded-2xl border p-4"
              style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)" }}
            >
              <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                  Key
                </p>
                <p className="font-mono text-sm font-semibold" style={{ color: B.blue }}>
                  {confirm.key.maskedSecret}
                </p>
              </div>
              <div className="rounded-xl border p-2.5" style={{ borderColor: B.border }}>
                <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                  Last used
                </p>
                <p className="text-sm font-semibold" style={{ color: B.blue }}>
                  {confirm.key.lastUsedAt ? fmtDate(confirm.key.lastUsedAt) : "Never"}
                </p>
              </div>
              {confirm.kind === "disable" ? (
                <label className="col-span-2 block space-y-1.5">
                  <span className="text-xs font-semibold" style={{ color: B.muted }}>
                    Reason (optional)
                  </span>
                  <input
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                    className={fieldClass}
                    style={{ borderColor: B.border, background: B.card, color: B.blue }}
                  />
                </label>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {confirm.kind === "rotate" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onConfirm()}
                    className="admin-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {busy ? "Rotating…" : "Rotate key"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="rounded-xl border py-2.5 text-sm font-semibold"
                    style={{ borderColor: B.border, color: B.blue }}
                  >
                    Keep key
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onConfirm()}
                    className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {busy ? "Disabling…" : "Disable key"}
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </AdminShell>
  );
}
