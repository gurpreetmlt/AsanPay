"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  KeyRound,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { ApiResponse } from "@asanpay/shared-types";
import { AdminShell } from "@/components/layout/AdminShell";
import { Modal, type ModalIconTone } from "@/components/ui/Modal";
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
  services: string[];
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

interface KeySecret {
  secret: string;
  callbackUrl: string | null;
  callbackNote: string | null;
  providerMessage: string;
}

interface RevealedKey extends KeySecret {
  keyId: string;
}

interface ShownOnce extends KeySecret {
  kind: "create" | "rotate";
  key: WebhookKey;
}

interface Delivery {
  id: string;
  result: "ok" | "bad_token" | "no_token" | "error" | "test";
  httpStatus: number | null;
  ip: string | null;
  txnRef: string | null;
  note: string | null;
  createdAt: string;
}

interface RejectionSummary {
  provider: Provider;
  rejectedLastHour: number;
  rejectedLast24h: number;
  lastRejectedAt: string | null;
  alert: boolean;
}

interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  message: string;
}

type StepUpAction = "create" | "reveal" | "rotate" | "disable";

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "noble", label: "Noble" },
  { value: "vyaparapi", label: "VyaparAPI" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
];

/** Mirrors WEBHOOK_SERVICES in the backend webhookKeys.helpers.ts. */
const SERVICES: Record<Provider, string[]> = {
  noble: ["UPI QR", "Recharge", "CMS"],
  vyaparapi: ["Recharge"],
  telegram: ["Bot updates"],
  whatsapp: ["Support inbox"],
};

const providerLabel = (p: string) => PROVIDERS.find((x) => x.value === p)?.label ?? p;

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Mirrors suggestKeyName in the backend webhookKeys.helpers.ts. */
function suggestName(provider: Provider, services: string[]): string {
  if (provider === "noble") {
    const picked = SERVICES.noble.filter((s) => services.includes(s));
    return `Noble callbacks for ${joinList(picked.length ? picked : SERVICES.noble)}`;
  }
  if (provider === "vyaparapi") return "VyaparAPI recharge callbacks";
  if (provider === "telegram") return "Telegram bot webhook";
  return "WhatsApp webhook signature (Meta App Secret)";
}

const REVEAL_SECONDS = 30;
const TOTP_OFF_MESSAGE = "Turn on two-factor login in Admin → Security before managing keys.";
const fieldClass = "w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2";
const neutralBtn = "rounded-xl border px-3 py-1.5 text-xs font-semibold";
const cardBg = "linear-gradient(180deg, #F7F9FF 0%, transparent 100%)";

type ApiErr = {
  message?: string;
  response?: { data?: { message?: string; code?: string; errors?: Record<string, unknown> } };
};

function errMsg(err: unknown, fallback: string): string {
  const ax = err as ApiErr;
  const data = ax.response?.data;
  if (data?.errors && typeof data.errors === "object") {
    for (const v of Object.values(data.errors)) {
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    }
  }
  return data?.message || ax.message || fallback;
}

function errCode(err: unknown): string | undefined {
  return (err as ApiErr).response?.data?.code;
}

async function copyText(value: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  } catch {
    toast.error("Could not copy. Select the text and copy it manually.");
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function fmtIst(iso: string): string {
  return `${new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" })} IST`;
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

const RESULT_PILL: Record<Delivery["result"], { label: string; bg: string; fg: string }> = {
  ok: { label: "OK", bg: "rgba(18,183,106,0.14)", fg: B.greenDark },
  test: { label: "Test", bg: "rgba(100,116,139,0.14)", fg: "#64748B" },
  bad_token: { label: "Wrong key", bg: "rgba(220,38,38,0.12)", fg: B.danger },
  no_token: { label: "No key", bg: "rgba(220,38,38,0.12)", fg: B.danger },
  error: { label: "Error", bg: "rgba(220,38,38,0.12)", fg: B.danger },
};

function isLive(k: WebhookKey, now: number): boolean {
  return k.status === "active" && (!k.expiresAt || new Date(k.expiresAt).getTime() > now);
}

const STEP_UP_COPY: Record<
  StepUpAction,
  { title: string; subtitle: string; confirm: string; busy: string; tone: ModalIconTone }
> = {
  create: {
    title: "Verify to generate key",
    subtitle: "Enter the current 6-digit code from your authenticator app to create this key.",
    confirm: "Verify & generate",
    busy: "Generating…",
    tone: "green",
  },
  reveal: {
    title: "Verify to view key",
    subtitle: "Enter the current 6-digit code from your authenticator app.",
    confirm: "Verify",
    busy: "Verifying…",
    tone: "blue",
  },
  rotate: {
    title: "Verify to rotate key",
    subtitle: "Enter the current 6-digit code. The old key keeps working for 24 hours.",
    confirm: "Verify & rotate",
    busy: "Rotating…",
    tone: "amber",
  },
  disable: {
    title: "Verify to disable key",
    subtitle: "Enter the current 6-digit code. Callbacks using this key stop immediately.",
    confirm: "Verify & disable",
    busy: "Disabling…",
    tone: "red",
  },
};

function TotpModal({
  action,
  eyebrow,
  busy,
  error,
  onSubmit,
  onCancel,
  onEdit,
}: {
  action: StepUpAction;
  eyebrow: string;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const [code, setCode] = useState("");
  const copy = STEP_UP_COPY[action];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    onSubmit(code);
    setCode("");
  }

  return (
    <Modal
      title={copy.title}
      eyebrow={eyebrow}
      subtitle={copy.subtitle}
      icon={<ShieldCheck size={22} />}
      iconTone={copy.tone}
      onClose={onCancel}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
          <label htmlFor="step-up-code" className="block space-y-1.5">
            <span className="text-xs font-semibold" style={{ color: B.muted }}>
              6-digit code
            </span>
            <input
              id="step-up-code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(onlyDigits(e.target.value));
                onEdit();
              }}
              placeholder="123456"
              aria-invalid={Boolean(error)}
              className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
              style={{ borderColor: error ? B.danger : B.border, background: B.card, color: B.blue }}
            />
            <span className="block text-xs" style={{ color: error ? B.danger : B.muted }} role={error ? "alert" : undefined}>
              {error ?? "Each code works once. Wait for the next code if you just used one."}
            </span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="admin-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? copy.busy : copy.confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SecretDetails({ data }: { data: KeySecret }) {
  return (
    <>
      <div className="rounded-xl border p-3" style={{ borderColor: B.border }}>
        <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
          Secret key
        </p>
        <p className="mt-1 break-all font-mono text-sm font-semibold" style={{ color: B.blue }}>
          {data.secret}
        </p>
        <button
          type="button"
          onClick={() => void copyText(data.secret, "Key copied")}
          className="admin-btn-primary mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          <Copy size={13} />
          Copy key
        </button>
      </div>
      <div className="rounded-xl border p-3" style={{ borderColor: B.border }}>
        <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
          {data.callbackUrl ? "Callback URL" : "Where to use it"}
        </p>
        {data.callbackUrl ? (
          <>
            <p className="mt-1 break-all font-mono text-[11px]" style={{ color: B.blue }}>
              {data.callbackUrl}
            </p>
            <button
              type="button"
              onClick={() => void copyText(data.callbackUrl!, "Callback URL copied")}
              className="admin-btn-primary mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              <Copy size={13} />
              Copy callback URL
            </button>
          </>
        ) : (
          <p className="mt-1 text-sm" style={{ color: B.blue }}>
            {data.callbackNote}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void copyText(data.providerMessage, "Message copied. Send it over a private channel.")}
        className="admin-btn-primary inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold"
      >
        <MessageSquareText size={15} />
        Copy message for provider
      </button>
    </>
  );
}

function DeliveryTable({ rows }: { rows: Delivery[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
            <th className="px-2 py-1.5 font-semibold">Time (IST)</th>
            <th className="px-2 py-1.5 font-semibold">Result</th>
            <th className="px-2 py-1.5 font-semibold">HTTP</th>
            <th className="px-2 py-1.5 font-semibold">IP</th>
            <th className="px-2 py-1.5 font-semibold">Txn ref / note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const pill = RESULT_PILL[d.result] ?? RESULT_PILL.error;
            return (
              <tr
                key={d.id}
                className="la-check-row border-t"
                style={{ borderColor: B.border, animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <td className="whitespace-nowrap px-2 py-1.5" style={{ color: B.blue }}>
                  {fmtIst(d.createdAt)}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: pill.bg, color: pill.fg }}
                  >
                    {pill.label}
                  </span>
                </td>
                <td className="px-2 py-1.5" style={{ color: B.blue }}>
                  {d.httpStatus ?? "—"}
                </td>
                <td className="px-2 py-1.5 font-mono" style={{ color: B.blue }}>
                  {d.ip ?? "—"}
                </td>
                <td className="max-w-[260px] break-all px-2 py-1.5" style={{ color: B.muted }}>
                  {d.txnRef ?? d.note ?? "—"}
                  {d.txnRef && d.note ? <span className="block">{d.note}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function WebhookKeysPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [keys, setKeys] = useState<WebhookKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [totp, setTotp] = useState<AdminTotpStatus | null>(null);
  const [summary, setSummary] = useState<RejectionSummary[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [createOpen, setCreateOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("noble");
  const [services, setServices] = useState<string[]>(SERVICES.noble);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [pasted, setPasted] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [shownOnce, setShownOnce] = useState<ShownOnce | null>(null);

  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<WebhookKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [confirm, setConfirm] = useState<{ kind: "rotate" | "disable"; key: WebhookKey } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const [stepUp, setStepUp] = useState<{ action: StepUpAction; key: WebhookKey | null } | null>(null);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpBusy, setStepUpBusy] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, { loading: boolean; rows: Delivery[]; error: string | null }>>({});
  const [tests, setTests] = useState<Record<string, { busy: boolean; result: TestResult | null }>>({});
  const [rejectedFor, setRejectedFor] = useState<Provider | null>(null);
  const [rejectedRows, setRejectedRows] = useState<{ loading: boolean; rows: Delivery[]; error: string | null }>({
    loading: false,
    rows: [],
    error: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, status, rejections] = await Promise.all([
        fetchApi<WebhookKey[]>("/admin/webhook-keys"),
        fetchApi<AdminTotpStatus>("/auth/admin/totp/status").catch(() => null),
        fetchApi<RejectionSummary[]>("/admin/webhook-keys/deliveries/summary").catch(() => []),
      ]);
      setKeys(list);
      setTotp(status);
      setSummary(rejections);
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
      setRevealOpen(false);
    }
  }, [revealed, secondsLeft]);

  function totpReady(): boolean {
    if (totp && !totp.enabled) {
      toast.error(TOTP_OFF_MESSAGE);
      return false;
    }
    return true;
  }

  function openStepUp(action: StepUpAction, key: WebhookKey | null) {
    setStepUpError(null);
    setStepUp({ action, key });
  }

  function openCreate() {
    setProvider("noble");
    setServices(SERVICES.noble);
    setName(suggestName("noble", SERVICES.noble));
    setNameTouched(false);
    setNotes("");
    setMode("generate");
    setPasted("");
    setCreateError(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
    setPasted("");
  }

  function pickProvider(p: Provider) {
    setProvider(p);
    setServices(SERVICES[p]);
    if (!nameTouched) setName(suggestName(p, SERVICES[p]));
    setCreateError(null);
  }

  function toggleService(s: string) {
    const next = services.includes(s) ? services.filter((x) => x !== s) : SERVICES[provider].filter((x) => x === s || services.includes(x));
    setServices(next);
    if (!nameTouched && next.length > 0) setName(suggestName(provider, next));
    setCreateError(null);
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (services.length === 0) {
      setCreateError("Select at least one service for this key");
      return;
    }
    if (name.trim().length < 2) {
      setCreateError("Name / purpose must be at least 2 characters");
      return;
    }
    if (mode === "paste" && (pasted.trim().length < 16 || pasted.trim().length > 200)) {
      setCreateError("Pasted key must be 16 to 200 characters");
      return;
    }
    if (!totpReady()) return;
    setCreateError(null);
    openStepUp("create", null);
  }

  function openReveal(k: WebhookKey) {
    if (!totpReady()) return;
    setRevealKey(k);
    if (revealed?.keyId === k.id) {
      setRevealOpen(true);
      return;
    }
    setRevealed(null);
    openStepUp("reveal", k);
  }

  function hideNow() {
    setRevealed(null);
    setRevealOpen(false);
  }

  function onConfirm() {
    if (!confirm) return;
    if (confirm.kind === "disable") {
      const r = reason.trim();
      if (r.length < 3) {
        setReasonError("Reason must be at least 3 characters");
        return;
      }
      if (r.length > 200) {
        setReasonError("Reason must be at most 200 characters");
        return;
      }
    }
    if (!totpReady()) return;
    openStepUp(confirm.kind, confirm.key);
  }

  async function runStepUp(code: string) {
    if (!stepUp) return;
    const { action, key } = stepUp;
    setStepUpBusy(true);
    setStepUpError(null);
    try {
      if (action === "create") {
        const { data } = await api.post<ApiResponse<{ key: WebhookKey } & KeySecret>>("/admin/webhook-keys", {
          provider,
          name: name.trim(),
          notes: notes.trim() || null,
          services,
          totpCode: code,
          ...(mode === "paste" ? { secret: pasted.trim() } : {}),
        });
        if (!data.success) throw new Error(data.message);
        const { key: createdKey, ...secret } = data.data;
        setCreateOpen(false);
        setPasted("");
        setShownOnce({ kind: "create", key: createdKey, ...secret });
      } else if (action === "reveal" && key) {
        const { data } = await api.post<ApiResponse<KeySecret>>(`/admin/webhook-keys/${key.id}/reveal`, { totpCode: code });
        if (!data.success) throw new Error(data.message);
        setRevealed({ keyId: key.id, ...data.data });
        setSecondsLeft(REVEAL_SECONDS);
        setRevealOpen(true);
      } else if (action === "rotate" && key) {
        const { data } = await api.post<ApiResponse<{ key: WebhookKey } & KeySecret>>(
          `/admin/webhook-keys/${key.id}/rotate`,
          { totpCode: code },
        );
        if (!data.success) throw new Error(data.message);
        const { key: newKey, ...secret } = data.data;
        setConfirm(null);
        setShownOnce({ kind: "rotate", key: newKey, ...secret });
      } else if (action === "disable" && key) {
        const { data } = await api.post<ApiResponse<WebhookKey>>(`/admin/webhook-keys/${key.id}/disable`, {
          reason: reason.trim(),
          totpCode: code,
        });
        if (!data.success) throw new Error(data.message);
        toast.success("Key disabled");
        setConfirm(null);
        setReason("");
      }
      setStepUp(null);
      if (action !== "reveal") void load();
    } catch (err) {
      const msg = errMsg(err, "Could not complete this action. Check the fields and try again.");
      const failCode = errCode(err);
      if (failCode === "TOTP_INCORRECT" || (failCode === "VALIDATION_ERROR" && /6-digit/.test(msg))) {
        setStepUpError(msg);
      } else {
        setStepUp(null);
        if (action === "create") setCreateError(msg);
        else if (action === "disable") setReasonError(msg);
        else toast.error(msg);
      }
    } finally {
      setStepUpBusy(false);
    }
  }

  async function loadDeliveries(id: string) {
    setExpanded((m) => ({ ...m, [id]: { loading: true, rows: m[id]?.rows ?? [], error: null } }));
    try {
      const rows = await fetchApi<Delivery[]>(`/admin/webhook-keys/${id}/deliveries?limit=20`);
      setExpanded((m) => (m[id] ? { ...m, [id]: { loading: false, rows, error: null } } : m));
    } catch (err) {
      const error = errMsg(err, "Could not load recent callbacks. Try again.");
      setExpanded((m) => (m[id] ? { ...m, [id]: { loading: false, rows: [], error } } : m));
    }
  }

  function toggleDeliveries(id: string) {
    if (expanded[id]) {
      setExpanded(({ [id]: _drop, ...rest }) => rest);
      return;
    }
    void loadDeliveries(id);
  }

  async function sendTest(k: WebhookKey) {
    setTests((m) => ({ ...m, [k.id]: { busy: true, result: null } }));
    try {
      const { data } = await api.post<ApiResponse<TestResult>>(`/admin/webhook-keys/${k.id}/test`, {});
      if (!data.success) throw new Error(data.message);
      setTests((m) => ({ ...m, [k.id]: { busy: false, result: data.data } }));
      if (expanded[k.id]) void loadDeliveries(k.id);
    } catch (err) {
      const message = errMsg(err, "Could not send the test callback. Try again.");
      setTests((m) => ({ ...m, [k.id]: { busy: false, result: { ok: false, httpStatus: null, message } } }));
    }
  }

  async function openRejected(p: Provider) {
    setRejectedFor(p);
    setRejectedRows({ loading: true, rows: [], error: null });
    try {
      const rows = await fetchApi<Delivery[]>(`/admin/webhook-keys/deliveries?provider=${p}&limit=50`);
      setRejectedRows({ loading: false, rows, error: null });
    } catch (err) {
      setRejectedRows({ loading: false, rows: [], error: errMsg(err, "Could not load rejected attempts. Try again.") });
    }
  }

  if (!hydrated || !accessToken) return null;

  const urlUnlocked = (k: WebhookKey) => revealed?.keyId === k.id && Boolean(revealed.callbackUrl);
  const alerts = summary.filter((s) => s.alert);
  const stepUpEyebrow = stepUp
    ? stepUp.key
      ? `${providerLabel(stepUp.key.provider)} · ${stepUp.key.name}`
      : `${providerLabel(provider)} · Step 2 of 2`
    : "";

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

        {alerts.length > 0 ? (
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{ borderColor: "rgba(220,38,38,0.4)", background: "rgba(220,38,38,0.08)" }}
            role="alert"
          >
            <ShieldAlert size={20} className="mt-0.5 shrink-0" style={{ color: B.danger }} />
            <div className="text-sm" style={{ color: B.blue }}>
              <p className="font-semibold">Many rejected callbacks in the last hour</p>
              <p className="mt-0.5" style={{ color: B.muted }}>
                {alerts.map((a) => `${providerLabel(a.provider)}: ${a.rejectedLastHour}`).join(" · ")} attempts with a
                wrong or missing key. A provider may still be using an old key, or someone is guessing. Open Rejected
                attempts below to see the IPs.
              </p>
            </div>
          </div>
        ) : null}

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
                Generating, viewing, rotating or disabling a key needs a 6-digit authenticator code.{" "}
                <Link href={SECURITY_PAGE} className="font-semibold underline" style={{ color: B.blueLight }}>
                  Turn it on in Security
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        {summary.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {summary.map((s) => (
              <div
                key={s.provider}
                className="flex flex-col gap-1 rounded-2xl border p-3"
                style={{ borderColor: s.alert ? "rgba(220,38,38,0.4)" : B.border, background: B.card }}
              >
                <p className="text-[11px] uppercase tracking-wide" style={{ color: B.muted }}>
                  {providerLabel(s.provider)} · Rejected attempts
                </p>
                <p className="text-lg font-bold" style={{ color: s.rejectedLast24h > 0 ? B.danger : B.blue }}>
                  {s.rejectedLast24h}
                  <span className="ml-1 text-xs font-medium" style={{ color: B.muted }}>
                    in 24h · {s.rejectedLastHour} in 1h
                  </span>
                </p>
                <button
                  type="button"
                  disabled={s.rejectedLast24h === 0}
                  onClick={() => void openRejected(s.provider)}
                  className={`${neutralBtn} mt-auto self-start disabled:cursor-not-allowed disabled:opacity-50`}
                  style={{ borderColor: B.border, color: B.blue }}
                >
                  View attempts
                </button>
              </div>
            ))}
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
              <table className="w-full min-w-[1040px] text-left text-sm">
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
                    const panel = expanded[k.id];
                    const test = tests[k.id];
                    return (
                      <Fragment key={k.id}>
                        <tr className="border-t align-top" style={{ borderColor: B.border }}>
                          <td className="px-4 py-3">
                            <p className="font-semibold" style={{ color: B.blue }}>
                              {k.name}
                            </p>
                            {k.services.length > 0 ? (
                              <div className="mt-1 flex max-w-[240px] flex-wrap gap-1">
                                {k.services.map((s) => (
                                  <span
                                    key={s}
                                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                    style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : null}
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
                                <code className="max-w-[240px] break-all text-[11px]" style={{ color: B.blue }}>
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
                              <p className="max-w-[240px] text-xs" style={{ color: B.muted }}>
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
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => toggleDeliveries(k.id)}
                                aria-expanded={Boolean(panel)}
                                className={`${neutralBtn} inline-flex items-center gap-1`}
                                style={{ borderColor: B.border, color: B.blue }}
                              >
                                {panel ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                Recent callbacks
                              </button>
                              {live ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={test?.busy}
                                    onClick={() => void sendTest(k)}
                                    className="admin-btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                                  >
                                    <Send size={12} />
                                    {test?.busy ? "Sending…" : "Send test"}
                                  </button>
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
                                      setReasonError(null);
                                      setConfirm({ kind: "disable", key: k });
                                    }}
                                    className="admin-btn-danger rounded-xl px-3 py-1.5 text-xs font-semibold"
                                  >
                                    Disable
                                  </button>
                                </>
                              ) : null}
                            </div>
                            {test?.result ? (
                              <p
                                className="mt-2 max-w-[260px] text-right text-xs font-semibold ml-auto"
                                style={{ color: test.result.ok ? B.greenDark : B.danger }}
                                role="status"
                              >
                                {test.result.message}
                                {!test.result.ok && test.result.httpStatus ? ` (HTTP ${test.result.httpStatus})` : ""}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                        {panel ? (
                          <tr style={{ background: B.bg }}>
                            <td colSpan={8} className="px-4 py-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="text-xs font-semibold" style={{ color: B.blue }}>
                                  Recent callbacks · {k.maskedSecret}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void loadDeliveries(k.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold"
                                  style={{ color: B.blueLight }}
                                >
                                  <RefreshCw size={12} />
                                  Refresh
                                </button>
                              </div>
                              {panel.loading ? (
                                <p className="text-xs" style={{ color: B.muted }}>
                                  Loading…
                                </p>
                              ) : panel.error ? (
                                <p className="text-xs" style={{ color: B.danger }}>
                                  {panel.error}
                                </p>
                              ) : panel.rows.length === 0 ? (
                                <p className="text-xs" style={{ color: B.muted }}>
                                  No callbacks with this key yet. Use Send test to check the setup.
                                </p>
                              ) : (
                                <DeliveryTable rows={panel.rows} />
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {createOpen && !stepUp ? (
        <Modal
          title="Generate callback key"
          eyebrow="Step 1 of 2"
          subtitle="The provider sends this key with every callback so we know it is really them."
          icon={<KeyRound size={22} />}
          iconTone="green"
          onClose={closeCreate}
        >
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Provider
                </span>
                <select
                  value={provider}
                  onChange={(e) => pickProvider(e.target.value as Provider)}
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
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold" style={{ color: B.muted }}>
                  Services <span style={{ color: B.danger }}>*</span>
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Services">
                  {SERVICES[provider].map((s) => {
                    const on = services.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleService(s)}
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: on ? B.blueLight : B.border,
                          background: on ? "rgba(42,92,221,0.10)" : B.card,
                          color: on ? B.blueLight : B.muted,
                        }}
                      >
                        {on ? <CheckCircle2 size={12} /> : null}
                        {s}
                      </button>
                    );
                  })}
                </div>
                <span className="block text-xs" style={{ color: services.length ? B.muted : B.danger }}>
                  {services.length ? "Callbacks this key is used for." : "Select at least one service for this key"}
                </span>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Name / purpose <span style={{ color: B.danger }}>*</span>
                </span>
                <input
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(e.target.value.trim().length > 0);
                    setCreateError(null);
                  }}
                  className={fieldClass}
                  style={{ borderColor: B.border, background: B.card, color: B.blue }}
                />
                <span className="block text-xs" style={{ color: B.muted }}>
                  {nameTouched ? `Suggested: ${suggestName(provider, services)}` : "Filled in from the provider and services."}
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
                disabled={
                  services.length === 0 || name.trim().length < 2 || (mode === "paste" && pasted.trim().length < 16)
                }
                className="admin-btn-success rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Generate key
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {stepUp ? (
        <TotpModal
          action={stepUp.action}
          eyebrow={stepUpEyebrow}
          busy={stepUpBusy}
          error={stepUpError}
          onSubmit={(code) => void runStepUp(code)}
          onCancel={() => setStepUp(null)}
          onEdit={() => setStepUpError(null)}
        />
      ) : null}

      {shownOnce ? (
        <Modal
          title={shownOnce.kind === "create" ? "Callback key created" : "New key created"}
          eyebrow={`${providerLabel(shownOnce.key.provider)} · ${shownOnce.key.name}`}
          subtitle={
            shownOnce.kind === "create"
              ? "Send the callback details to the provider over a private channel."
              : "Send the new key to the provider. The old key keeps working for 24 hours."
          }
          icon={<CheckCircle2 size={22} />}
          iconTone="green"
          onClose={() => setShownOnce(null)}
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
              {shownOnce.key.services.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {shownOnce.key.services.map((s) => (
                    <span
                      key={s}
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
              <SecretDetails data={shownOnce} />
              <div
                className="flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold"
                style={{ borderColor: "rgba(217,119,6,0.4)", background: "rgba(217,119,6,0.08)", color: "#B45309" }}
                role="note"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                This is the only time the full key is shown without 2FA. Copy it now.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShownOnce(null)}
              className="admin-btn-primary w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </Modal>
      ) : null}

      {revealOpen && revealed && revealKey ? (
        <Modal
          title="Callback key"
          eyebrow={`${providerLabel(revealKey.provider)} · ${revealKey.name}`}
          subtitle={`Hides automatically in ${secondsLeft}s. Send it to the provider over a private channel.`}
          icon={<KeyRound size={22} />}
          iconTone="blue"
          onClose={() => setRevealOpen(false)}
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
              <SecretDetails data={revealed} />
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
        </Modal>
      ) : null}

      {confirm && !stepUp ? (
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
              style={{ borderColor: B.border, background: cardBg }}
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
                    Reason <span style={{ color: B.danger }}>*</span>
                  </span>
                  <input
                    value={reason}
                    maxLength={200}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setReasonError(null);
                    }}
                    aria-invalid={Boolean(reasonError)}
                    className={fieldClass}
                    style={{ borderColor: reasonError ? B.danger : B.border, background: B.card, color: B.blue }}
                  />
                  <span className="block text-xs" style={{ color: reasonError ? B.danger : B.muted }}>
                    {reasonError ?? "3 to 200 characters. Saved in the audit log."}
                  </span>
                </label>
              ) : (
                <p className="col-span-2 text-xs" style={{ color: B.muted }}>
                  You will need a 6-digit authenticator code. The new key is shown once after rotating.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className={
                  confirm.kind === "rotate"
                    ? "admin-btn-danger rounded-xl py-2.5 text-sm font-semibold"
                    : "rounded-xl border py-2.5 text-sm font-semibold"
                }
                style={confirm.kind === "rotate" ? undefined : { borderColor: B.border, color: B.blue }}
              >
                {confirm.kind === "rotate" ? "Cancel" : "Keep key"}
              </button>
              <button
                type="button"
                disabled={confirm.kind === "disable" && reason.trim().length < 3}
                onClick={onConfirm}
                className={`${confirm.kind === "rotate" ? "admin-btn-primary" : "admin-btn-danger"} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60`}
              >
                {confirm.kind === "rotate" ? "Rotate key" : "Disable key"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {rejectedFor ? (
        <Modal
          title="Rejected attempts"
          eyebrow={providerLabel(rejectedFor)}
          subtitle="Callbacks with a wrong or missing key (latest 50). Tokens are never stored."
          icon={<ShieldAlert size={22} />}
          iconTone="red"
          wide
          onClose={() => setRejectedFor(null)}
        >
          <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
            {rejectedRows.loading ? (
              <p className="text-xs" style={{ color: B.muted }}>
                Loading…
              </p>
            ) : rejectedRows.error ? (
              <p className="text-xs" style={{ color: B.danger }}>
                {rejectedRows.error}
              </p>
            ) : rejectedRows.rows.length === 0 ? (
              <p className="text-xs" style={{ color: B.muted }}>
                No rejected attempts for {providerLabel(rejectedFor)}.
              </p>
            ) : (
              <DeliveryTable rows={rejectedRows.rows} />
            )}
          </div>
        </Modal>
      ) : null}
    </AdminShell>
  );
}
