"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  Webhook,
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

type Environment = "dev" | "live";

interface WebhookKey {
  id: string;
  provider: Provider;
  name: string;
  vendorName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  environment: Environment;
  rotatedFromId: string | null;
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

type HealthStatus = "not_set" | "alert" | "quiet" | "ok";

interface ProviderHealth {
  provider: Provider;
  label: string;
  status: HealthStatus;
  activeKeys: number;
  usingServerSecret: boolean;
  acceptedLast24h: number;
  rejectedLast24h: number;
  rejectedLastHour: number;
  lastAcceptedAt: string | null;
  lastRejectedAt: string | null;
  lastRejectReason: string | null;
}

interface Overview {
  environment: Environment;
  providers: ProviderHealth[];
}

interface DetailsForm {
  vendorName: string;
  name: string;
  environment: Environment;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

const GRACE_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
] as const;

const ROTATE_AFTER_DAYS = 90;

const HEALTH_PILL: Record<HealthStatus, { label: string; bg: string; fg: string; dot: string }> = {
  ok: { label: "Healthy", bg: "rgba(18,183,106,0.12)", fg: "#0F9E5C", dot: "#12B76A" },
  quiet: { label: "Quiet", bg: "rgba(217,119,6,0.12)", fg: "#B45309", dot: "#F59E0B" },
  alert: { label: "Alert", bg: "rgba(220,38,38,0.12)", fg: "#B91C1C", dot: "#EF4444" },
  not_set: { label: "Not set", bg: "rgba(100,116,139,0.12)", fg: "#64748B", dot: "#94A3B8" },
};

const PROVIDER_TONE: Record<Provider, string> = {
  noble: "#0F766E",
  vyaparapi: "#C2410C",
  telegram: "#0284C7",
  whatsapp: "#15803D",
};

function ago(iso: string | null, now: number): string {
  if (!iso) return "Never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s-]{10,16}$/;

/** Field-level problems in the vendor / contact form. */
function detailsErrors(f: DetailsForm): Partial<Record<keyof DetailsForm, string>> {
  const out: Partial<Record<keyof DetailsForm, string>> = {};
  if (f.name.trim().length < 2) out.name = "Name / purpose must be at least 2 characters";
  if (f.contactEmail.trim() && !EMAIL_RE.test(f.contactEmail.trim())) out.contactEmail = "Enter a valid email like ops@vendor.com";
  if (f.contactPhone.trim() && !PHONE_RE.test(f.contactPhone.trim())) out.contactPhone = "Enter a valid phone (10 digits, + and spaces allowed)";
  return out;
}

interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  message: string;
}

type StepUpAction = "create" | "reveal" | "rotate" | "disable" | "delete";

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
  if (k.status === "disabled") return { label: "Revoked", ...grey };
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
    title: "Verify to regenerate key",
    subtitle: "Enter the current 6-digit code. The old key keeps working for the time you picked.",
    confirm: "Verify & regenerate",
    busy: "Regenerating…",
    tone: "amber",
  },
  disable: {
    title: "Verify to revoke key",
    subtitle: "Enter the current 6-digit code. Callbacks using this key stop immediately.",
    confirm: "Verify & revoke",
    busy: "Revoking…",
    tone: "red",
  },
  delete: {
    title: "Verify to delete key",
    subtitle: "Enter the current 6-digit code. The key is removed permanently and callbacks using it stop immediately.",
    confirm: "Verify & delete",
    busy: "Deleting…",
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

function EnvBadge({ env, server = false }: { env: Environment; server?: boolean }) {
  const live = env === "live";
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={live ? { background: "rgba(18,183,106,0.14)", color: "#0F9E5C" } : { background: "rgba(217,119,6,0.14)", color: "#B45309" }}
      title={server ? "Which server this admin is connected to" : "Where this key is used"}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: live ? "#12B76A" : "#F59E0B" }} />
      {server ? (live ? "Live server" : "Dev server") : live ? "Live" : "Dev"}
    </span>
  );
}

function DetailsFields({
  form,
  onChange,
  errors,
  showName = true,
}: {
  form: DetailsForm;
  onChange: (patch: Partial<DetailsForm>) => void;
  errors: Partial<Record<keyof DetailsForm, string>>;
  showName?: boolean;
}) {
  const input = (key: keyof DetailsForm, label: string, opts: { placeholder?: string; max: number; type?: string; required?: boolean }) => (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold" style={{ color: B.muted }}>
        {label} {opts.required ? <span style={{ color: B.danger }}>*</span> : null}
      </span>
      <input
        type={opts.type ?? "text"}
        value={form[key]}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        onChange={(e) => onChange({ [key]: e.target.value })}
        aria-invalid={Boolean(errors[key])}
        className={fieldClass}
        style={{ borderColor: errors[key] ? B.danger : B.border, background: B.card, color: B.blue }}
      />
      {errors[key] ? (
        <span className="block text-xs font-semibold" style={{ color: B.danger }}>
          {errors[key]}
        </span>
      ) : null}
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {input("vendorName", "Vendor / company", { placeholder: "e.g. Noble Web Studio", max: 120 })}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold" style={{ color: B.muted }}>
            Environment
          </span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Environment">
            {(["dev", "live"] as const).map((e) => {
              const on = form.environment === e;
              return (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ environment: e })}
                  className="rounded-xl border-2 py-2.5 text-sm font-bold transition"
                  style={{
                    borderColor: on ? (e === "live" ? "#12B76A" : "#F59E0B") : B.border,
                    background: on ? (e === "live" ? "rgba(18,183,106,0.08)" : "rgba(217,119,6,0.08)") : B.card,
                    color: on ? (e === "live" ? "#0F9E5C" : "#B45309") : B.muted,
                  }}
                >
                  {e === "live" ? "Live" : "Dev"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {showName ? input("name", "Name / purpose", { max: 120, required: true }) : null}
      <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: B.card }}>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: B.blueLight }}>
          Vendor contact · optional
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {input("contactName", "Name", { placeholder: "Tech contact", max: 80 })}
          {input("contactEmail", "Email", { placeholder: "ops@vendor.com", max: 150, type: "email" })}
          {input("contactPhone", "Phone", { placeholder: "98765 43210", max: 20, type: "tel" })}
        </div>
      </div>
      {input("notes", "Notes", { placeholder: "e.g. Set in the provider portal on 29 Oct", max: 300 })}
    </div>
  );
}

type MenuItem = { label: string; icon: typeof Plus; tone?: "danger"; onClick: () => void };

function ActionMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border transition hover:bg-[rgba(42,92,221,0.06)]"
        style={{ borderColor: B.border, color: B.blue, background: B.card }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-2xl border py-1 shadow-xl"
          style={{ borderColor: B.border, background: B.card }}
          role="menu"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-semibold transition ${
                  it.tone === "danger" ? "hover:bg-[#FEF2F2]" : "hover:bg-[rgba(42,92,221,0.06)]"
                }`}
                style={{ color: it.tone === "danger" ? B.danger : B.blue }}
              >
                <Icon size={15} />
                {it.label}
              </button>
            );
          })}
        </div>
      ) : null}
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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const serverEnv: Environment = overview?.environment ?? "dev";
  const emptyDetails = (): DetailsForm => ({
    vendorName: "",
    name: "",
    environment: serverEnv,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    notes: "",
  });
  const [createDetails, setCreateDetails] = useState<DetailsForm>(emptyDetails);
  const [edit, setEdit] = useState<{ key: WebhookKey; form: DetailsForm; busy: boolean; error: string | null } | null>(null);
  const [graceHours, setGraceHours] = useState<number>(24);

  const [createOpen, setCreateOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("noble");
  const [services, setServices] = useState<string[]>(SERVICES.noble);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [pasted, setPasted] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [shownOnce, setShownOnce] = useState<ShownOnce | null>(null);

  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<WebhookKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [confirm, setConfirm] = useState<{ kind: "rotate" | "disable" | "delete"; key: WebhookKey } | null>(null);
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
      const [list, status, health] = await Promise.all([
        fetchApi<WebhookKey[]>("/admin/webhook-keys"),
        fetchApi<AdminTotpStatus>("/auth/admin/totp/status").catch(() => null),
        fetchApi<Overview>("/admin/webhook-keys/overview").catch(() => null),
      ]);
      setKeys(list);
      setTotp(status);
      setOverview(health);
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
    setCreateDetails({ ...emptyDetails(), vendorName: "Noble Web Studio" });
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
    setCreateDetails((d) => {
      const known = ["", "Noble Web Studio", ...PROVIDERS.map((x) => x.label)];
      return known.includes(d.vendorName) ? { ...d, vendorName: p === "noble" ? "Noble Web Studio" : providerLabel(p) } : d;
    });
    setCreateError(null);
  }

  function openEdit(k: WebhookKey) {
    setEdit({
      key: k,
      busy: false,
      error: null,
      form: {
        vendorName: k.vendorName,
        name: k.name,
        environment: k.environment,
        contactName: k.contactName ?? "",
        contactEmail: k.contactEmail ?? "",
        contactPhone: k.contactPhone ?? "",
        notes: k.notes ?? "",
      },
    });
  }

  async function saveEdit() {
    if (!edit) return;
    if (Object.keys(detailsErrors(edit.form)).length > 0) return;
    setEdit({ ...edit, busy: true, error: null });
    const f = edit.form;
    try {
      const { data } = await api.patch<ApiResponse<WebhookKey>>(`/admin/webhook-keys/${edit.key.id}`, {
        name: f.name.trim(),
        vendorName: f.vendorName.trim() || null,
        environment: f.environment,
        contactName: f.contactName.trim() || null,
        contactEmail: f.contactEmail.trim() || null,
        contactPhone: f.contactPhone.trim() || null,
        notes: f.notes.trim() || null,
      });
      if (!data.success) throw new Error(data.message);
      setKeys((list) => list.map((k) => (k.id === data.data.id ? data.data : k)));
      toast.success("Key details saved");
      setEdit(null);
    } catch (err) {
      setEdit((e) => (e ? { ...e, busy: false, error: errMsg(err, "Key details were not saved. Try again.") } : e));
    }
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
    const detailProblem = Object.values(detailsErrors({ ...createDetails, name }))[0];
    if (detailProblem) {
      setCreateError(detailProblem);
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
    if (confirm.kind === "disable" || confirm.kind === "delete") {
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
          notes: createDetails.notes.trim() || null,
          vendorName: createDetails.vendorName.trim() || null,
          environment: createDetails.environment,
          contactName: createDetails.contactName.trim() || null,
          contactEmail: createDetails.contactEmail.trim() || null,
          contactPhone: createDetails.contactPhone.trim() || null,
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
          { totpCode: code, graceHours },
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
        toast.success("Key revoked");
        setConfirm(null);
        setReason("");
      } else if (action === "delete" && key) {
        const { data } = await api.post<ApiResponse<{ id: string }>>(`/admin/webhook-keys/${key.id}/delete`, {
          reason: reason.trim(),
          totpCode: code,
        });
        if (!data.success) throw new Error(data.message);
        toast.success("Key deleted");
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
        else if (action === "disable" || action === "delete") setReasonError(msg);
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
  const alerts = (overview?.providers ?? []).filter((h) => h.status === "alert");
  const stepUpEyebrow = stepUp
    ? stepUp.key
      ? `${providerLabel(stepUp.key.provider)} · ${stepUp.key.name}`
      : `${providerLabel(provider)} · Step 2 of 2`
    : "";

  return (
    <AdminShell>
      <div className="w-full space-y-5 p-4 md:p-6">
        <div
          className="relative overflow-hidden rounded-3xl border p-5 md:p-6"
          style={{ borderColor: B.border, background: "linear-gradient(135deg, #F3F6FF 0%, var(--admin-card) 60%)" }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: B.badgeGrad }}
              >
                <Webhook size={22} />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                    Webhooks &amp; callback keys
                  </h1>
                  {overview ? <EnvBadge env={serverEnv} server /> : null}
                </div>
                <p className="mt-1 max-w-2xl text-sm" style={{ color: B.muted }}>
                  The key each vendor sends with its callbacks, so we know it is really them. Server keys (JWT, encryption,
                  database) stay in the server settings.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="admin-btn-success inline-flex shrink-0 items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm"
            >
              <Plus size={16} />
              Generate callback key
            </button>
          </div>
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
                {alerts.map((a) => `${a.label}: ${a.rejectedLastHour}`).join(" · ")} attempts with a wrong or missing key.
                A vendor may still be using an old key, or someone is guessing. Open Rejected attempts to see the IPs.
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
                Generating, viewing, regenerating, revoking or deleting a key needs a 6-digit authenticator code.{" "}
                <Link href={SECURITY_PAGE} className="font-semibold underline" style={{ color: B.blueLight }}>
                  Turn it on in Security
                </Link>
                .
              </p>
            </div>
          </div>
        ) : null}

        {overview ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overview.providers.map((h) => {
              const pill = HEALTH_PILL[h.status];
              const tone = PROVIDER_TONE[h.provider];
              return (
                <div
                  key={h.provider}
                  className="flex flex-col gap-3 rounded-2xl border p-4 transition hover:shadow-md"
                  style={{
                    borderColor: h.status === "alert" ? "rgba(220,38,38,0.45)" : B.border,
                    background: B.card,
                    boxShadow: `inset 3px 0 0 ${tone}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-extrabold"
                        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
                      >
                        {h.label.slice(0, 1)}
                      </span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: B.blue }}>
                          {h.label}
                        </p>
                        <p className="text-[11px]" style={{ color: B.muted }}>
                          {h.activeKeys > 0
                            ? `${h.activeKeys} active key${h.activeKeys === 1 ? "" : "s"}`
                            : h.usingServerSecret
                              ? "Using the server secret"
                              : "No key yet"}
                        </p>
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: pill.bg, color: pill.fg }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: pill.dot }} />
                      {pill.label}
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                      Last callback
                    </p>
                    <p className="text-lg font-bold" style={{ color: h.status === "quiet" ? "#B45309" : B.blue }}>
                      {ago(h.lastAcceptedAt, now)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl px-2.5 py-1.5" style={{ background: "rgba(18,183,106,0.08)" }}>
                      <p style={{ color: B.muted }}>Accepted 24h</p>
                      <p className="text-sm font-bold" style={{ color: B.greenDark }}>
                        {h.acceptedLast24h}
                      </p>
                    </div>
                    <div
                      className="rounded-xl px-2.5 py-1.5"
                      style={{ background: h.rejectedLast24h > 0 ? "rgba(220,38,38,0.08)" : B.secondary }}
                    >
                      <p style={{ color: B.muted }}>Rejected 24h</p>
                      <p className="text-sm font-bold" style={{ color: h.rejectedLast24h > 0 ? B.danger : B.blue }}>
                        {h.rejectedLast24h}
                        {h.rejectedLastHour > 0 ? (
                          <span className="ml-1 text-[10px] font-semibold">({h.rejectedLastHour} in 1h)</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  {h.rejectedLast24h > 0 ? (
                    <button
                      type="button"
                      onClick={() => void openRejected(h.provider)}
                      className="mt-auto flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:bg-[#FEF2F2]"
                      style={{ borderColor: "#FCA5A5", color: B.danger }}
                    >
                      <span>{h.lastRejectReason ?? "Rejected"} · {ago(h.lastRejectedAt, now)}</span>
                      <span>View →</span>
                    </button>
                  ) : (
                    <p className="mt-auto text-[11px]" style={{ color: B.muted }}>
                      {h.status === "not_set"
                        ? "Generate a key and send it to the vendor."
                        : h.status === "quiet"
                          ? "No accepted callback for over a day."
                          : "No rejected attempts."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Callback keys
            </h2>
            {keys.length > 0 ? (
              <p className="text-xs" style={{ color: B.muted }}>
                {keys.filter((k) => isLive(k, now)).length} working · {keys.length} total
              </p>
            ) : null}
          </div>

          {loading && keys.length === 0 ? (
            <p className="rounded-2xl border p-5 text-sm" style={{ borderColor: B.border, color: B.muted }}>
              Loading…
            </p>
          ) : loadError ? (
            <p className="rounded-2xl border p-5 text-sm" style={{ borderColor: B.border, color: B.danger }}>
              {loadError}
            </p>
          ) : keys.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center"
              style={{ borderColor: B.border, background: B.card }}
            >
              <KeyRound size={28} style={{ color: B.muted }} />
              <p className="text-sm font-semibold" style={{ color: B.blue }}>
                No callback keys yet
              </p>
              <p className="max-w-md text-xs" style={{ color: B.muted }}>
                Until you add one, callbacks use the secret set in the server settings (if any). Generate a key and send the
                callback URL to the vendor.
              </p>
            </div>
          ) : (
            keys.map((k, idx) => {
              const pill = statusPill(k, now);
              const live = isLive(k, now);
              const panel = expanded[k.id];
              const test = tests[k.id];
              const tone = PROVIDER_TONE[k.provider];
              const ageDays = Math.floor((now - new Date(k.createdAt).getTime()) / 86_400_000);
              const replaced = k.rotatedFromId ? keys.find((x) => x.id === k.rotatedFromId) : null;
              const menu: MenuItem[] = [
                { label: "Edit details", icon: Pencil, onClick: () => openEdit(k) },
                ...(live && !k.expiresAt
                  ? [
                      {
                        label: "Regenerate key",
                        icon: RefreshCw,
                        onClick: () => {
                          setGraceHours(24);
                          setConfirm({ kind: "rotate", key: k });
                        },
                      },
                    ]
                  : []),
                ...(live
                  ? [
                      {
                        label: "Revoke key",
                        icon: Ban,
                        tone: "danger" as const,
                        onClick: () => {
                          setReason("");
                          setReasonError(null);
                          setConfirm({ kind: "disable", key: k });
                        },
                      },
                    ]
                  : [
                      {
                        label: "Delete permanently",
                        icon: Trash2,
                        tone: "danger" as const,
                        onClick: () => {
                          setReason("");
                          setReasonError(null);
                          setConfirm({ kind: "delete", key: k });
                        },
                      },
                    ]),
              ];
              return (
                <article
                  key={k.id}
                  className="la-check-row overflow-hidden rounded-2xl border transition hover:shadow-md"
                  style={{
                    borderColor: B.border,
                    background: B.card,
                    boxShadow: `inset 3px 0 0 ${live ? tone : "#CBD5E1"}`,
                    opacity: live ? 1 : 0.78,
                    animationDelay: `${Math.min(idx, 8) * 60}ms`,
                  }}
                >
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold"
                        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
                      >
                        {k.vendorName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-bold" style={{ color: B.blue }}>
                            {k.vendorName}
                          </p>
                          <EnvBadge env={k.environment} />
                          <span
                            className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ background: pill.bg, color: pill.fg }}
                          >
                            {pill.label}
                          </span>
                          {live && !k.expiresAt && ageDays >= ROTATE_AFTER_DAYS ? (
                            <span
                              className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{ background: "rgba(217,119,6,0.12)", color: "#B45309" }}
                              title="Regenerate keys every 90 days"
                            >
                              {ageDays} days old · rotate soon
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
                          {providerLabel(k.provider)} · {k.name}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {k.services.map((s) => (
                            <span
                              key={s}
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                            >
                              {s}
                            </span>
                          ))}
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: B.secondary, color: B.muted }}
                          >
                            {k.source === "pasted" ? "Pasted key" : "Generated key"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDeliveries(k.id)}
                        aria-expanded={Boolean(panel)}
                        className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-semibold transition hover:bg-[rgba(42,92,221,0.06)]"
                        style={{ borderColor: B.border, color: B.blue, background: B.card }}
                      >
                        {panel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        Recent callbacks
                      </button>
                      {live ? (
                        <button
                          type="button"
                          disabled={test?.busy}
                          onClick={() => void sendTest(k)}
                          className="admin-btn-primary inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold disabled:opacity-60"
                        >
                          <Send size={13} />
                          {test?.busy ? "Sending…" : "Send test"}
                        </button>
                      ) : null}
                      <ActionMenu items={menu} label={`More actions for ${k.vendorName}`} />
                    </div>
                  </div>

                  {test?.result ? (
                    <div
                      className="mx-4 mb-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                      style={
                        test.result.ok
                          ? { background: "rgba(18,183,106,0.08)", color: B.greenDark }
                          : { background: "rgba(220,38,38,0.08)", color: B.danger }
                      }
                      role="status"
                    >
                      {test.result.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                      <span>
                        {test.result.message}
                        {!test.result.ok && test.result.httpStatus ? ` (HTTP ${test.result.httpStatus})` : ""}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className="grid gap-px border-t sm:grid-cols-2 xl:grid-cols-4"
                    style={{ borderColor: B.border, background: B.border }}
                  >
                    <div className="p-3.5" style={{ background: B.card }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                        {k.callbackUrl ? "Callback URL" : "Where to use it"}
                      </p>
                      {k.callbackUrl ? (
                        <>
                          <code className="mt-1 block break-all text-[11px]" style={{ color: B.blue }}>
                            {k.callbackUrl}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              urlUnlocked(k) && revealed?.callbackUrl
                                ? void copyText(revealed.callbackUrl, "Callback URL copied — paste it in the vendor portal")
                                : openReveal(k)
                            }
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold"
                            style={{ color: B.blueLight }}
                          >
                            <Copy size={12} />
                            {urlUnlocked(k) ? `Copy for vendor portal (${secondsLeft}s)` : "Unlock to copy for vendor portal"}
                          </button>
                        </>
                      ) : (
                        <p className="mt-1 text-xs" style={{ color: B.blue }}>
                          {k.callbackNote}
                        </p>
                      )}
                    </div>
                    <div className="p-3.5" style={{ background: B.card }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                        Secret
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="text-sm font-semibold" style={{ color: B.blue }}>
                          {k.maskedSecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => openReveal(k)}
                          aria-label="View key"
                          title="View key (needs 2FA)"
                          className="rounded-lg p-1 transition hover:bg-[rgba(42,92,221,0.08)]"
                          style={{ color: B.blueLight }}
                        >
                          <Eye size={15} />
                        </button>
                      </div>
                      {replaced ? (
                        <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
                          Replaces {replaced.maskedSecret}
                          {replaced.expiresAt && new Date(replaced.expiresAt).getTime() > now
                            ? ` · old key works until ${fmtDate(replaced.expiresAt)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="p-3.5" style={{ background: B.card }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                        Usage
                      </p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: B.blue }}>
                        Last used {ago(k.lastUsedAt, now).toLowerCase()}
                      </p>
                      <p className="text-[11px]" style={{ color: B.muted }}>
                        {k.useCount} callback{k.useCount === 1 ? "" : "s"} · created {fmtDate(k.createdAt)}
                        {k.createdByName ? ` by ${k.createdByName}` : ""}
                      </p>
                    </div>
                    <div className="p-3.5" style={{ background: B.card }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                        Vendor contact
                      </p>
                      {k.contactName || k.contactEmail || k.contactPhone ? (
                        <div className="mt-1 space-y-0.5 text-xs" style={{ color: B.blue }}>
                          {k.contactName ? (
                            <p className="flex items-center gap-1.5 font-semibold">
                              <UserRound size={12} style={{ color: B.muted }} /> {k.contactName}
                            </p>
                          ) : null}
                          {k.contactEmail ? (
                            <a href={`mailto:${k.contactEmail}`} className="flex items-center gap-1.5 hover:underline">
                              <Mail size={12} style={{ color: B.muted }} /> {k.contactEmail}
                            </a>
                          ) : null}
                          {k.contactPhone ? (
                            <a href={`tel:${k.contactPhone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:underline">
                              <Phone size={12} style={{ color: B.muted }} /> {k.contactPhone}
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEdit(k)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-bold"
                          style={{ color: B.greenDark }}
                        >
                          <Plus size={12} /> Add contact
                        </button>
                      )}
                      {k.notes ? (
                        <p className="mt-1 text-[11px]" style={{ color: B.muted }} title={k.notes}>
                          {k.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {panel ? (
                    <div className="border-t px-4 py-3" style={{ borderColor: B.border, background: B.bg }}>
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
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>

      {createOpen && !stepUp ? (
        <Modal
          title="Generate callback key"
          eyebrow="Step 1 of 2"
          subtitle="The vendor sends this key with every callback so we know it is really them."
          icon={<KeyRound size={22} />}
          iconTone="green"
          wide
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
              <DetailsFields
                form={createDetails}
                showName={false}
                errors={detailsErrors({ ...createDetails, name })}
                onChange={(patch) => {
                  setCreateDetails((d) => ({ ...d, ...patch }));
                  setCreateError(null);
                }}
              />
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
              : `Send the new key to ${shownOnce.key.vendorName}. The old key keeps working for ${GRACE_OPTIONS.find((g) => g.hours === graceHours)?.label ?? "24 hours"}.`
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
          title={
            confirm.kind === "rotate"
              ? "Regenerate callback key"
              : confirm.kind === "delete"
                ? "Delete callback key"
                : "Revoke callback key"
          }
          eyebrow={`${providerLabel(confirm.key.provider)} · ${confirm.key.name}`}
          subtitle={
            confirm.kind === "rotate"
              ? "A new key is generated. The old key keeps working for the time you pick, then stops."
              : confirm.kind === "delete"
                ? "The key is removed permanently and callbacks using it stop immediately. The audit log keeps the record."
                : "Callbacks using this key stop working immediately."
          }
          icon={
            confirm.kind === "rotate" ? (
              <RefreshCw size={22} />
            ) : confirm.kind === "delete" ? (
              <Trash2 size={22} />
            ) : (
              <Ban size={22} />
            )
          }
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
              {confirm.kind === "disable" || confirm.kind === "delete" ? (
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
                <div className="col-span-2 space-y-1.5">
                  <span className="block text-xs font-semibold" style={{ color: B.muted }}>
                    Old key keeps working for
                  </span>
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Grace period">
                    {GRACE_OPTIONS.map((g) => {
                      const on = graceHours === g.hours;
                      return (
                        <button
                          key={g.hours}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setGraceHours(g.hours)}
                          className="rounded-xl border-2 py-2 text-xs font-bold transition"
                          style={{
                            borderColor: on ? B.blueLight : B.border,
                            background: on ? "rgba(42,92,221,0.08)" : B.card,
                            color: on ? B.blueLight : B.blue,
                          }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="block text-xs" style={{ color: B.muted }}>
                    Time for the vendor to put the new key in their portal. Needs a 6-digit code; the new key is shown once.
                  </span>
                </div>
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
                disabled={confirm.kind !== "rotate" && reason.trim().length < 3}
                onClick={onConfirm}
                className={`${confirm.kind === "rotate" ? "admin-btn-primary" : "admin-btn-danger"} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60`}
              >
                {confirm.kind === "rotate" ? "Regenerate key" : confirm.kind === "delete" ? "Delete key" : "Revoke key"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {edit ? (
        <Modal
          title="Edit key details"
          eyebrow={`${providerLabel(edit.key.provider)} · ${edit.key.maskedSecret}`}
          subtitle="Who holds this key and how to reach them. The key itself does not change, so no 2FA is needed."
          icon={<Pencil size={22} />}
          iconTone="blue"
          wide
          onClose={() => {
            if (!edit.busy) setEdit(null);
          }}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border p-4" style={{ borderColor: B.border, background: cardBg }}>
              <DetailsFields
                form={edit.form}
                errors={detailsErrors(edit.form)}
                onChange={(patch) => setEdit((e) => (e ? { ...e, error: null, form: { ...e.form, ...patch } } : e))}
              />
              {edit.error ? (
                <p className="mt-3 text-xs font-semibold" style={{ color: B.danger }} role="alert">
                  {edit.error}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={edit.busy}
                onClick={() => setEdit(null)}
                className="admin-btn-danger rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={edit.busy || Object.keys(detailsErrors(edit.form)).length > 0}
                onClick={() => void saveEdit()}
                className="admin-btn-primary rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {edit.busy ? "Saving…" : "Save details"}
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
