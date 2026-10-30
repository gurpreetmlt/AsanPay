"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  Banknote,
  MapPin,
  ShieldCheck,
  User,
  Wallet,
  Network,
  History,
  Landmark,
  BadgeCheck,
  CircleCheck,
  CircleX,
  Clock,
  Snowflake,
  KeyRound,
  Mail,
  MailCheck,
  MailX,
  AlertTriangle,
  CalendarDays,
  Copy,
  FileCheck2,
  LayoutDashboard,
  Percent,
  Phone,
  SlidersHorizontal,
  ChevronRight,
  Camera,
  Eye,
  Hash,
  Receipt,
  IdCard,
  Fingerprint,
  ShieldAlert,
  ShieldX,
  ArrowRightLeft,
  RotateCcw,
  Info,
  type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { DetailSection } from "@/components/users/DetailSection";
import { AgentSettlementBanksCard } from "@/components/users/AgentSettlementBanksCard";
import { KycDocumentGrid } from "@/components/users/KycDocumentGrid";
import type { DocCheckLabelMap } from "@/components/users/DocCheckLabels";
import {
  ReasonSelect,
  RESTRICT_REASON_PRESETS,
  AEPS_REACTIVATE_REASON_PRESETS,
  KYC_RESET_REASON_PRESETS,
  KYC_REJECT_REASON_PRESETS,
} from "@/components/users/ReasonSelect";
import { Modal } from "@/components/ui/Modal";
import { AgentRateCard } from "@/components/users/AgentRateCard";
import { NightAccessCard } from "@/components/users/NightAccessCard";
import { ServiceAccessCard } from "@/components/users/ServiceAccessCard";
import { TxnLimitsCard } from "@/components/users/TxnLimitsCard";
import { RoleAccountCard } from "@/components/users/RoleAccountCard";
import { LinkedAccountsCard } from "@/components/users/LinkedAccountsCard";
import { FundRequestSwitch } from "@/components/users/FundRequestSwitch";
import { MoveAgentModal } from "@/components/users/MoveAgentModal";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type PillTone = "green" | "amber" | "red" | "slate";

const PILL_TONES: Record<PillTone, { bg: string; border: string; fg: string; dot: string }> = {
  green: { bg: "#F0FDF4", border: "#86EFAC", fg: "#15803D", dot: "#22C55E" },
  amber: { bg: "#FFFBEB", border: "#FCD34D", fg: "#B45309", dot: "#F59E0B" },
  red: { bg: "#FEF2F2", border: "#FCA5A5", fg: "#B91C1C", dot: "#EF4444" },
  slate: { bg: "#F8FAFC", border: "#CBD5E1", fg: "#475569", dot: "#94A3B8" },
};

function kycPill(status: string): { text: string; tone: PillTone; icon: LucideIcon } {
  if (status === "verified") return { text: "Verified", tone: "green", icon: BadgeCheck };
  if (status === "rejected") return { text: "Rejected", tone: "red", icon: CircleX };
  if (status === "pending") return { text: "Pending review", tone: "amber", icon: Clock };
  return { text: status.replace(/_/g, " "), tone: "slate", icon: Clock };
}

function StatusPill({
  label,
  text,
  tone,
  icon: Icon,
  live = false,
}: {
  label: string;
  text: string;
  tone: PillTone;
  icon: LucideIcon;
  live?: boolean;
}) {
  const t = PILL_TONES[tone];
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ background: t.bg, borderColor: t.border }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.fg, opacity: 0.75 }}>
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-bold capitalize" style={{ color: t.fg }}>
        <Icon size={16} strokeWidth={2.4} />
        {text}
        {live ? (
          <span className="relative ml-0.5 flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: t.dot }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: t.dot }} />
          </span>
        ) : null}
      </p>
    </div>
  );
}

type AgentTab = "overview" | "kyc" | "wallet" | "commission" | "controls";

const TABS: Array<{ id: AgentTab; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "kyc", label: "KYC", icon: FileCheck2 },
  { id: "wallet", label: "Wallet & bank", icon: Wallet },
  { id: "commission", label: "Commission", icon: Percent },
  { id: "controls", label: "Services & limits", icon: SlidersHorizontal },
];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const inrText = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

/** Profile fact as a small tile: icon, label, value, optional copy. */
function ProfileTile({
  icon: Icon,
  label,
  value,
  onCopy,
  missing = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  onCopy?: () => void;
  /** Amber tile + "Missing" chip when the fact is not on file. */
  missing?: boolean;
}) {
  const gap = missing || !value;
  return (
    <div
      className="agent-lift flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3"
      style={{
        borderColor: gap ? "#FDE68A" : B.border,
        background: gap ? "linear-gradient(180deg, #FFFBEB 0%, var(--admin-card) 100%)" : "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)",
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={gap ? { background: "#FEF3C7", color: "#B45309" } : { background: "rgba(42,92,221,0.10)", color: B.blueLight }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="truncate text-sm font-semibold" style={{ color: gap ? "#92400E" : B.blue }} title={value ?? undefined}>
          {value || "Not on file"}
        </p>
      </div>
      {gap ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: "#FEF3C7", color: "#B45309" }}>
          Missing
        </span>
      ) : null}
      {onCopy && value ? (
        <button
          type="button"
          onClick={onCopy}
          title={`Copy ${label.toLowerCase()}`}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded-lg p-1.5 transition hover:bg-[rgba(42,92,221,0.10)]"
          style={{ color: B.muted }}
        >
          <Copy size={14} />
        </button>
      ) : null}
    </div>
  );
}

type CheckItem = { label: string; ok: boolean; okText?: string; noText?: string; hint?: string; icon?: LucideIcon };

/** Status list: icon + label + pill per row, staggered in, with a summary strip at the end. */
function CheckList({ items, allGood, notReady }: { items: CheckItem[]; allGood: string; notReady: string }) {
  const missing = items.filter((i) => !i.ok).length;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => {
        const RowIcon = it.icon ?? (it.ok ? CircleCheck : CircleX);
        return (
          <div
            key={it.label}
            className="rc-slab-in flex items-center gap-2.5 rounded-xl border px-3 py-2"
            style={{ borderColor: B.border, animationDelay: `${i * 120}ms` }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={it.ok ? { background: "rgba(22,163,74,0.12)", color: "#16A34A" } : { background: "#FEF3C7", color: "#B45309" }}
            >
              <RowIcon size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold" style={{ color: B.blue }}>
                {it.label}
              </p>
              {it.hint ? (
                <p className="truncate text-[10px]" style={{ color: B.muted }}>
                  {it.hint}
                </p>
              ) : null}
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={it.ok ? { background: "#F0FDF4", color: "#15803D" } : { background: "#FFFBEB", color: "#B45309" }}
            >
              {it.ok ? it.okText ?? "Done" : it.noText ?? "Missing"}
            </span>
          </div>
        );
      })}
      <div
        className="rc-slab-in rounded-xl px-3 py-2 text-xs font-semibold"
        style={{
          animationDelay: `${items.length * 120}ms`,
          ...(missing ? { background: "#FFFBEB", color: "#92400E" } : { background: "#F0FDF4", color: "#15803D" }),
        }}
      >
        {missing ? notReady.replace("{n}", String(missing)) : allGood}
      </div>
    </div>
  );
}

type StepState = "done" | "current" | "todo" | "failed";

/** Horizontal KYC progress: numbered dots joined by a line; stacks on small screens. */
function KycStepper({ steps }: { steps: Array<{ title: string; hint: string; state: StepState; icon: LucideIcon }> }) {
  const tone: Record<StepState, { bg: string; fg: string; ring: string; label: string }> = {
    done: { bg: "#16A34A", fg: "#fff", ring: "rgba(22,163,74,0.18)", label: "Done" },
    current: { bg: B.blueLight, fg: "#fff", ring: "rgba(42,92,221,0.20)", label: "Now" },
    todo: { bg: "var(--admin-card)", fg: B.muted, ring: "transparent", label: "Next" },
    failed: { bg: "#DC2626", fg: "#fff", ring: "rgba(220,38,38,0.18)", label: "Rejected" },
  };
  return (
    <div className="rounded-2xl border px-4 py-4 md:px-6" style={{ borderColor: B.border, background: B.card }}>
      <div className="grid gap-4 sm:grid-cols-4">
        {steps.map((s, i) => {
          const t = tone[s.state];
          const SIcon = s.state === "done" ? CircleCheck : s.state === "failed" ? CircleX : s.icon;
          return (
            <div key={s.title} className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center">
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[calc(50%+22px)] right-[calc(-50%+6px)] top-5 hidden h-[3px] rounded-full sm:block"
                  style={{ background: s.state === "done" ? "#16A34A" : B.border }}
                />
              ) : null}
              <span
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${s.state === "current" ? "modal-icon-pulse" : ""}`}
                style={{ background: t.bg, color: t.fg, borderColor: s.state === "todo" ? B.border : t.bg, boxShadow: `0 0 0 5px ${t.ring}` }}
              >
                <SIcon size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: B.blue }}>
                  {s.title}
                </p>
                <p className="text-[11px]" style={{ color: B.muted }}>
                  {s.hint}
                </p>
                <span
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={
                    s.state === "todo"
                      ? { background: "var(--admin-bg)", color: B.muted }
                      : { background: `color-mix(in srgb, ${s.state === "current" ? B.blueLight : t.bg} 14%, transparent)`, color: s.state === "current" ? B.blueLight : t.bg }
                  }
                >
                  {t.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tall button tile for the Quick actions card. */
function QuickAction({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="agent-lift group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left"
      style={{ borderColor: B.border, background: "var(--admin-card)" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold" style={{ color: B.blue }}>
          {label}
        </span>
        <span className="block truncate text-[11px]" style={{ color: B.muted }}>
          {hint}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: B.muted }} />
    </button>
  );
}

/** Agent photo from KYC (personal photo); falls back to initials when missing or it fails to load. */
function AgentAvatar({
  src,
  name,
  className,
  style,
}: {
  /** One URL, or several tried in order (next one on load error). */
  src: string | null | Array<string | null>;
  name: string;
  className: string;
  style?: CSSProperties;
}) {
  const list = (Array.isArray(src) ? src : [src]).filter((s): s is string => !!s);
  const [failed, setFailed] = useState<string[]>([]);
  const current = list.find((s) => !failed.includes(s)) ?? null;
  return (
    <span className={`flex items-center justify-center overflow-hidden ${className}`} style={style}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={current} src={current} alt={name} className="h-full w-full object-cover" onError={() => setFailed((f) => [...f, current])} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** One colour per agent role so Super Distributor / Distributor / Retailer read apart at a glance. */
const ROLE_TONE: Record<string, { fg: string; grad: string; tint: string }> = {
  super_distributor: { fg: "#7C3AED", grad: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)", tint: "#F5F3FF" },
  distributor: { fg: "#0D9488", grad: "linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)", tint: "#F0FDFA" },
  retailer: { fg: "#2A5CDD", grad: "linear-gradient(135deg, #3B6CF0 0%, #1D3FA8 100%)", tint: "#EFF4FF" },
};
const roleTone = (role: string | null | undefined) => ROLE_TONE[role ?? ""] ?? ROLE_TONE.retailer!;

/** Network tree card: role-coloured border, glow, tint and avatar; `current` marks the open agent. */
function NetworkNode({
  name,
  role,
  uid,
  photo,
  current = false,
}: {
  name: string;
  role: string | null;
  uid: string | null;
  photo: string | null | Array<string | null>;
  current?: boolean;
}) {
  const tone = roleTone(role);
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
      style={{
        border: `2px solid ${tone.fg}`,
        background: `linear-gradient(90deg, ${tone.tint} 0%, var(--admin-card) 75%)`,
        boxShadow: `0 10px 24px -14px ${tone.fg}, 0 0 0 ${current ? 4 : 0}px color-mix(in srgb, ${tone.fg} 14%, transparent)`,
      }}
    >
      <AgentAvatar
        src={photo}
        name={name}
        className="h-12 w-12 shrink-0 rounded-xl text-sm font-extrabold text-white shadow-md"
        style={{ background: tone.grad, boxShadow: `0 0 0 2px #fff, 0 0 0 4px color-mix(in srgb, ${tone.fg} 35%, transparent)` }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
          {name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: B.muted }}>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${tone.fg} 14%, transparent)`, color: tone.fg }}>
            {role ? ROLE_LABEL[role] ?? role : "—"}
          </span>
          <span className="font-mono">{uid}</span>
        </div>
      </div>
      {current ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: tone.grad }}>
          This agent
        </span>
      ) : (
        <ChevronRight size={18} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: tone.fg }} />
      )}
    </div>
  );
}

/** Soft empty state: icon in a dashed circle, title, one helper line. */
function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center" style={{ borderColor: B.border }}>
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "rgba(42,92,221,0.08)", color: B.blueLight, boxShadow: "0 0 0 8px rgba(42,92,221,0.04)" }}
      >
        <Icon size={24} />
      </span>
      <p className="mt-3 text-sm font-bold" style={{ color: B.blue }}>
        {title}
      </p>
      <p className="mt-0.5 max-w-xs text-xs" style={{ color: B.muted }}>
        {hint}
      </p>
    </div>
  );
}

/** Glass pill on the blue hero for a contact fact. */
function HeroFact({ icon: Icon, children, onClick, title }: { icon: LucideIcon; children: ReactNode; onClick?: () => void; title?: string }) {
  const cls = "inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm";
  const style = { border: "1px solid rgba(255,255,255,0.22)" };
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${cls} transition hover:bg-white/25 hover:text-white`} style={style}>
      <Icon size={13} />
      {children}
    </button>
  ) : (
    <span className={cls} style={style}>
      <Icon size={13} />
      {children}
    </span>
  );
}

/** Compact white wallet card on the blue hero. */
function HeroWallet({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-[132px] items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 shadow-md">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(42,92,221,0.12)", color: B.blueLight }}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="truncate text-sm font-extrabold tabular-nums leading-tight" style={{ color: B.blue }}>
          {value}
        </p>
      </div>
    </div>
  );
}

/** Tinted helper strip with an icon tile, used at the top of a section. */
function SectionIntro({ icon: Icon, tone = B.blueLight, children }: { icon: LucideIcon; tone?: string; children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-3 py-2.5"
      style={{ background: `color-mix(in srgb, ${tone} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${tone} 22%, transparent)` }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
      >
        <Icon size={15} />
      </span>
      <p className="pt-1 text-xs leading-relaxed" style={{ color: "var(--admin-text)" }}>
        {children}
      </p>
    </div>
  );
}

const RESTRICT_LEVELS: Array<{ id: "soft" | "hard" | "freeze" | "none"; label: string; hint: string; icon: LucideIcon; tone: string }> = [
  { id: "soft", label: "Soft", hint: "AePS + money transfer off", icon: ShieldAlert, tone: "#D97706" },
  { id: "hard", label: "Hard", hint: "Soft + no top-ups", icon: ShieldX, tone: "#EA580C" },
  { id: "freeze", label: "Freeze", hint: "Login + settlement off", icon: Snowflake, tone: "#DC2626" },
  { id: "none", label: "Lift all", hint: "Back to normal", icon: ShieldCheck, tone: "#16A34A" },
];

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Login email (temporary password) for agents who signed up without a password. */
function LoginEmailCard({
  agent,
  busy,
  onResend,
}: {
  agent: AgentDetail;
  busy: boolean;
  onResend: () => void;
}) {
  const le = agent.loginEmail;
  if (!le || (!le.pending && !le.status && !le.mustChangePassword)) {
    return (
      <SectionIntro icon={KeyRound} tone="#16A34A">
        <strong>Password login.</strong> The agent signs in with their mobile number and own password. No login email is
        pending.
      </SectionIntro>
    );
  }

  const expired =
    le.mustChangePassword && le.tempPasswordExpiresAt
      ? new Date(le.tempPasswordExpiresAt).getTime() < Date.now()
      : false;
  const canResend = agent.kycStatus === "verified" && (le.pending || le.mustChangePassword);

  let pill: { text: string; tone: PillTone; icon: LucideIcon };
  let helper: string;
  if (le.status === "failed" && le.pending) {
    pill = { text: "Email failed", tone: "red", icon: MailX };
    helper = le.message ?? "The login email could not be sent.";
  } else if (le.pending) {
    pill = { text: "Waiting for KYC approval", tone: "slate", icon: Mail };
    helper = "The temporary password is emailed automatically when KYC is approved.";
  } else if (le.mustChangePassword && expired) {
    pill = { text: "Temporary password expired", tone: "amber", icon: KeyRound };
    helper = `Sent ${formatWhen(le.sentAt)} — the agent did not log in within 48 hours. Resend the email.`;
  } else if (le.mustChangePassword) {
    pill = { text: "Sent · password not set yet", tone: "amber", icon: MailCheck };
    helper = `${le.message ?? "Sent"} on ${formatWhen(le.sentAt)}. Works until ${formatWhen(le.tempPasswordExpiresAt)}.`;
  } else {
    pill = { text: "Agent set own password", tone: "green", icon: MailCheck };
    helper = le.sentAt ? `Login email sent ${formatWhen(le.sentAt)}.` : "Password is set.";
  }

  const t = PILL_TONES[pill.tone];
  const Icon = pill.icon;
  return (
    <div className="space-y-2 rounded-xl border px-3 py-2.5" style={{ borderColor: B.border }}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold" style={{ color: B.blue }}>
          Login email
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold"
          style={{ background: t.bg, borderColor: t.border, color: t.fg }}
        >
          <Icon size={14} strokeWidth={2.4} />
          {pill.text}
        </span>
      </div>
      <p className="text-xs" style={{ color: B.muted }}>
        {helper}
      </p>
      {canResend ? (
        <button
          type="button"
          disabled={busy}
          onClick={onResend}
          className="w-full rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: B.border, color: B.blue, background: "#fff" }}
        >
          Resend login email
        </button>
      ) : null}
    </div>
  );
}

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: ConfirmTone;
  action: () => void | Promise<void>;
};

type KycCheckStatus = "pending" | "verified" | "failed" | "retry_required" | "manual_review";

type KycVerificationBrief = {
  reviewDecision: "approved" | "rejected" | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  panNumber?: KycCheckStatus;
  panImage?: KycCheckStatus;
  aadhaarOtp?: KycCheckStatus;
  aadhaarImage?: KycCheckStatus;
  crossCheck?: KycCheckStatus;
  reasons?: Partial<Record<"panNumber" | "panImage" | "aadhaarOtp" | "aadhaarImage" | "crossCheck", string>>;
};

const CHECK_TONE: Record<KycCheckStatus, { label: string; bg: string; fg: string; icon: LucideIcon }> = {
  verified: { label: "Passed", bg: "#F0FDF4", fg: "#15803D", icon: CircleCheck },
  failed: { label: "Failed", bg: "#FEF2F2", fg: "#B91C1C", icon: CircleX },
  retry_required: { label: "Retry", bg: "#FFFBEB", fg: "#B45309", icon: RotateCcw },
  manual_review: { label: "Check by hand", bg: "#EFF6FF", fg: "#1D4ED8", icon: Eye },
  pending: { label: "Not run", bg: "#F8FAFC", fg: "#64748B", icon: Clock },
};

/** Provider checks run during KYC submit (statuses only — no numbers). */
function AutoChecks({ v }: { v: KycVerificationBrief }) {
  const rows: Array<{ key: keyof NonNullable<KycVerificationBrief["reasons"]>; label: string; icon: LucideIcon }> = [
    { key: "panNumber", label: "PAN number", icon: IdCard },
    { key: "panImage", label: "PAN photo", icon: FileCheck2 },
    { key: "aadhaarOtp", label: "Aadhaar OTP", icon: KeyRound },
    { key: "aadhaarImage", label: "Aadhaar photo", icon: Fingerprint },
    { key: "crossCheck", label: "Name match (PAN ↔ Aadhaar)", icon: ShieldCheck },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((r, i) => {
        const status = v[r.key] ?? "pending";
        const tone = CHECK_TONE[status];
        const ToneIcon = tone.icon;
        const RowIcon = r.icon;
        const reason = v.reasons?.[r.key];
        return (
          <div
            key={r.key}
            className={`rc-slab-in flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${i === rows.length - 1 ? "sm:col-span-2" : ""}`}
            style={{ borderColor: B.border, animationDelay: `${i * 120}ms` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tone.bg, color: tone.fg }}>
              <RowIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                {r.label}
              </p>
              {reason ? (
                <p className="truncate text-[11px]" style={{ color: B.muted }} title={reason}>
                  {reason}
                </p>
              ) : null}
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: tone.bg, color: tone.fg }}
            >
              <ToneIcon size={11} />
              {tone.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface RecentTxn {
  id: string;
  txnRef: string;
  amount: string;
  status: string;
  serviceName: string;
  createdAt: string;
}

interface SettlementBankBrief {
  id: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
  isActive: boolean;
  verified: boolean;
}

interface AgentDetail {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  email: string | null;
  role: string;
  kycStatus: string;
  isActive: boolean;
  /** Set when the agent picked a profile photo in Settings; otherwise the KYC personal photo is shown. */
  profilePhotoUpdatedAt?: string | null;
  /** Full-freeze status (accounts.blockLogin) — the moderation lever. isActive is lifecycle-only. */
  isFrozen: boolean;
  fundRequestEnabled: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  hasKycDocs: boolean;
  kyc: {
    status: string;
    panMasked: string | null;
    aadhaarMasked: string | null;
    city: string | null;
    pincode: string | null;
    bankName: string | null;
    hasBank: boolean;
    submittedAt: string | null;
    verification?: KycVerificationBrief;
  };
  documents: Record<string, string>;
  documentFiles?: Partial<
    Record<
      "panCard" | "aadhaarFront" | "aadhaarBack" | "chequeOrPassbook" | "personalPhoto" | "shopPhoto",
      string | null
    >
  >;
  docCheckLabels?: DocCheckLabelMap;
  /** Signup without a password: temporary password emailed on KYC approval. */
  loginEmail?: {
    pending: boolean;
    status: "sent" | "failed" | null;
    message: string | null;
    sentAt: string | null;
    mustChangePassword: boolean;
    tempPasswordExpiresAt: string | null;
  };
  wallets: { walletType: string; balance: string }[];
  parent: { id: string; uid: string | null; name: string | null; role: string | null } | null;
}

export default function AgentDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [aepsReason, setAepsReason] = useState("");
  const [restrictReason, setRestrictReason] = useState("");
  const [kycResetReason, setKycResetReason] = useState("");
  const [recentTxns, setRecentTxns] = useState<RecentTxn[]>([]);
  const [activeBank, setActiveBank] = useState<SettlementBankBrief | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Old links point at "#commission"; any other hash or none opens Overview.
  const [tab, setTab] = useState<AgentTab>(() =>
    typeof window !== "undefined" && window.location.hash === "#commission" ? "commission" : "overview",
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detail, txns, banks] = await Promise.all([
        fetchApi<AgentDetail>(`/admin/users/${id}`),
        fetchApi<RecentTxn[]>("/admin/transactions", { userId: id, limit: "10" }).catch(() => [] as RecentTxn[]),
        fetchApi<SettlementBankBrief[]>(`/settlements/banks/by-user/${id}`).catch(() => []),
      ]);
      setAgent(detail);
      setLoadError(null);
      setRecentTxns(txns);
      setActiveBank(banks.find((b) => b.isActive) ?? null);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "Agent details did not load. Check your connection and refresh.";
      setLoadError(msg);
      // Keep the page that is already open; only an empty page shows the error card.
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function decideKyc(decision: "verified" | "rejected", reason?: string) {
    if (!agent) return;
    if (decision === "verified" && !agent.hasKycDocs) {
      toast.error(
        "Cannot verify KYC without PAN and Aadhaar on file. Agent must finish signup KYC (PAN + Aadhaar numbers) first.",
      );
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{
        message?: string;
        data?: { loginEmail?: { status: "sent" | "failed" } | null };
      }>(`/admin/kyc/${agent.id}/decide`, { decision, reason });
      const message = data.message ?? (decision === "verified" ? "KYC approved" : "KYC rejected");
      if (data.data?.loginEmail?.status === "failed") toast.error(message, { duration: 8000 });
      else toast.success(message);
      setRejectOpen(false);
      setRejectReason("");
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Decision failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function askResendLoginEmail() {
    if (!agent) return;
    setPendingConfirm({
      title: "Resend login email?",
      message: (
        <div className="space-y-2">
          <p>
            A new temporary password goes to <strong>{agent.email ?? "the agent's email"}</strong>. It works for 48
            hours.
          </p>
          <p>The earlier temporary password stops working once the new email is sent.</p>
        </div>
      ),
      confirmLabel: "Resend email",
      tone: "info",
      action: () => resendLoginEmailNow(),
    });
  }

  async function resendLoginEmailNow() {
    if (!agent) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ message?: string }>(`/admin/users/${agent.id}/login-email/resend`);
      toast.success(data.message ?? "Login email sent");
      setPendingConfirm(null);
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Login email could not be sent",
        { duration: 8000 },
      );
      setPendingConfirm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function askResetKyc() {
    if (!agent) return;
    const reason = kycResetReason.trim();
    if (reason.length < 8) {
      toast.error("Select a reset reason (custom reason must be at least 8 characters)");
      return;
    }
    setPendingConfirm({
      title: "Reset KYC for this agent?",
      message: (
        <div className="space-y-2">
          <p>
            KYC goes back to <strong>Pending</strong> and the saved PAN / Aadhaar are cleared. {agent.name} will be
            asked to complete KYC again on next login.
          </p>
          <p>Services that need verified KYC (AePS, DMT, etc.) stay locked until the new KYC is approved.</p>
          <p>
            Reason: <strong>{reason}</strong>
          </p>
        </div>
      ),
      confirmLabel: "Reset KYC",
      tone: "danger",
      action: () => resetKycNow(reason),
    });
  }

  async function resetKycNow(reason: string) {
    if (!agent) return;
    setBusy(true);
    try {
      await api.post(`/admin/kyc/${agent.id}/reset`, { reason });
      toast.success("KYC reset — the agent will be asked to submit KYC again");
      setKycResetReason("");
      setPendingConfirm(null);
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "KYC reset failed",
      );
    } finally {
      setBusy(false);
    }
  }

  // Graded restriction instead of deactivating the account. Soft and hard leave login, balance,
  // support and settlement working — a wrongly-suspected agent stays reachable.
  async function applyRestriction(level: "none" | "soft" | "hard" | "freeze") {
    if (!agent) return;
    const reason = restrictReason.trim();
    setBusy(true);
    try {
      await api.post(`/admin/users/${agent.id}/restrict`, { level, reason });
      toast.success(level === "none" ? "Restrictions lifted" : `Restriction set to ${level}`);
      setRestrictReason("");
      setPendingConfirm(null);
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Update failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function setRestriction(level: "none" | "soft" | "hard" | "freeze") {
    if (!agent) return;
    const reason = restrictReason.trim();
    if (level !== "none" && reason.length < 8) {
      toast.error("Select or enter a reason — at least 8 characters");
      return;
    }
    if (level === "freeze") {
      setPendingConfirm({
        title: "Freeze this account?",
        message:
          "Freeze blocks login AND settlement. Confirmed fraud only. Continue?",
        confirmLabel: "Freeze account",
        tone: "warning",
        action: () => void applyRestriction("freeze"),
      });
      return;
    }
    void applyRestriction(level);
  }

  // The only way out of an AePS block or dormancy. Requires KYC to be verified first — that is
  // what RBI asks for before a dormant operator resumes, and the API enforces it too.
  async function reactivateAeps() {
    if (!agent) return;
    const reason = aepsReason.trim();
    if (reason.length < 8) {
      toast.error("Select or enter a reason — at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/users/${agent.id}/aeps/reactivate`, { reason });
      toast.success("AePS reactivated");
      setAepsReason("");
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Reactivation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  const rejectedReason = agent?.kycStatus === "rejected" ? agent.kyc.verification?.reviewReason ?? null : null;
  const rejectedAt =
    agent?.kycStatus === "rejected" && agent.kyc.verification?.reviewedAt
      ? new Date(agent.kyc.verification.reviewedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
      : null;
  const photoPath = agent?.documents?.personalPhoto;
  const kycPhotoSrc = photoPath && photoPath.includes("/kyc-documents/") ? `/api/proxy${photoPath}` : null;
  const photoSrc = agent?.profilePhotoUpdatedAt
    ? `/api/proxy/admin/users/${agent.id}/photo?v=${encodeURIComponent(agent.profilePhotoUpdatedAt)}`
    : kycPhotoSrc;
  const docsUploaded = agent
    ? Object.values(agent.documentFiles ?? {}).some(Boolean) || Object.keys(agent.documents ?? {}).length > 0
    : false;
  const kycSteps: Array<{ title: string; hint: string; state: StepState; icon: LucideIcon }> = agent
    ? [
        {
          title: "Signup KYC",
          hint: "PAN + Aadhaar numbers",
          state: agent.hasKycDocs || agent.kycStatus === "verified" ? "done" : "current",
          icon: IdCard,
        },
        {
          title: "Documents",
          hint: "Card photos uploaded",
          state: docsUploaded || agent.kycStatus === "verified" ? "done" : agent.hasKycDocs ? "current" : "todo",
          icon: FileCheck2,
        },
        {
          title: "Admin review",
          hint: "Approve or reject",
          state:
            agent.kycStatus === "verified"
              ? "done"
              : agent.kycStatus === "rejected"
                ? "failed"
                : agent.hasKycDocs
                  ? "current"
                  : "todo",
          icon: ShieldCheck,
        },
        { title: "Verified", hint: "Services unlock", state: agent.kycStatus === "verified" ? "done" : "todo", icon: BadgeCheck },
      ]
    : [];
  const lastTxn = recentTxns[0];
  const healthItems: Array<{ label: string; ok: boolean | null; status: string; hint?: string; icon: LucideIcon; tab: AgentTab }> = agent
    ? [
        {
          label: "KYC",
          ok: agent.kycStatus === "verified",
          status: kycPill(agent.kycStatus).text,
          hint: agent.kyc.panMasked ? `PAN ${agent.kyc.panMasked}` : "PAN not on file",
          icon: FileCheck2,
          tab: "kyc",
        },
        {
          label: "Settlement bank",
          ok: !!activeBank,
          status: activeBank ? `Active · ****${activeBank.accountNumberLast4}` : "None active",
          hint: activeBank ? `${activeBank.holderName} · ${activeBank.ifsc}` : undefined,
          icon: Landmark,
          tab: "wallet",
        },
        { label: "Fund requests", ok: agent.fundRequestEnabled, status: agent.fundRequestEnabled ? "On" : "Off", icon: Banknote, tab: "wallet" },
        { label: "Account", ok: !agent.isFrozen, status: agent.isFrozen ? "Frozen" : "Active", icon: KeyRound, tab: "controls" },
        {
          label: "Upline",
          ok: null,
          status: agent.parent?.name ?? "Top of network",
          hint: agent.parent ? `${agent.parent.role ? ROLE_LABEL[agent.parent.role] ?? agent.parent.role : ""} · ${agent.parent.uid ?? ""}` : undefined,
          icon: Network,
          tab: "overview",
        },
        {
          label: "Last transaction",
          ok: null,
          status: lastTxn ? `${inrText(lastTxn.amount)} · ${lastTxn.status}` : "No transactions",
          hint: lastTxn ? `${lastTxn.serviceName} · ${new Date(lastTxn.createdAt).toLocaleString("en-IN")}` : undefined,
          icon: History,
          tab: "overview",
        },
      ]
    : [];
  const healthMissing = healthItems.filter((h) => h.ok === false).length;
  const heroWallets = [...(agent?.wallets ?? [])].sort((a, b) => (a.walletType === "main" ? -1 : b.walletType === "main" ? 1 : 0));
  const toneColor = { green: "#16A34A", amber: "#D97706", red: "#DC2626", slate: "#64748B" } as const;

  function copyUid() {
    if (!agent) return;
    void navigator.clipboard.writeText(agent.uid).then(
      () => toast.success("UID copied"),
      () => toast.error("Could not copy the UID — select it and copy manually"),
    );
  }

  function copyText(value: string, what: string) {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(`${what} copied`),
      () => toast.error(`Could not copy the ${what.toLowerCase()} — select it and copy manually`),
    );
  }

  const profileSection = agent ? (
    <DetailSection title="Agent profile" icon={User}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ProfileTile icon={User} label="Name" value={agent.name} />
        <ProfileTile icon={Phone} label="Mobile" value={agent.mobile} onCopy={() => copyText(agent.mobile, "Mobile")} />
        <ProfileTile icon={Mail} label="Email" value={agent.email} onCopy={agent.email ? () => copyText(agent.email!, "Email") : undefined} />
        <ProfileTile icon={Hash} label="UID" value={agent.uid} onCopy={copyUid} />
        <ProfileTile icon={BadgeCheck} label="Role" value={ROLE_LABEL[agent.role] ?? agent.role} />
        <ProfileTile
          icon={CalendarDays}
          label="Joined"
          value={new Date(agent.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        />
      </div>
    </DetailSection>
  ) : null;

  const parentSection = agent ? (
    <DetailSection title="Network parent" icon={Network}>
      {agent.parent ? (
        <div>
          <Link href={`/users/${agent.parent.id}`} className="agent-lift group block rounded-2xl">
            <NetworkNode
              name={agent.parent.name ?? ""}
              role={agent.parent.role}
              uid={agent.parent.uid}
              photo={[
                `/api/proxy/admin/users/${agent.parent.id}/photo`,
                `/api/proxy/admin/users/${agent.parent.id}/kyc-documents/personalPhoto`,
              ]}
            />
          </Link>
          <div
            className="ml-[2.1rem] h-6 w-0.5 rounded-full"
            style={{ background: `linear-gradient(${roleTone(agent.parent.role).fg}, ${roleTone(agent.role).fg})` }}
          />
          <NetworkNode name={agent.name} role={agent.role} uid={agent.uid} photo={photoSrc} current />
        </div>
      ) : (
        <EmptyState icon={Network} title="Top of the network" hint="This Super Distributor has no upline." />
      )}
    </DetailSection>
  ) : null;

  const recentTxnSection = (
    <DetailSection title="Recent transactions" icon={History}>
      {recentTxns.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions yet" hint="The agent's latest 10 transactions show here once they start." />
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
          {recentTxns.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition hover:bg-[rgba(42,92,221,0.05)]"
              style={{ borderColor: B.border, background: i % 2 ? "rgba(42,92,221,0.03)" : undefined }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
                >
                  <Receipt size={16} />
                </span>
                <div className="min-w-0">
                <div className="truncate font-semibold" style={{ color: B.blue }}>
                  {t.serviceName}
                </div>
                <div className="truncate font-mono text-[11px]" style={{ color: B.muted }}>
                  {t.txnRef} · {new Date(t.createdAt).toLocaleString("en-IN")}
                </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-bold tabular-nums" style={{ color: B.blue }}>
                  {inrText(t.amount)}
                </span>
                <Badge status={t.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <Link
          href="/users"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
          style={{ color: B.blueMid }}
        >
          <ArrowLeft className="h-4 w-4" />
          All agents
        </Link>

        {!agent ? (
          <div className="rounded-3xl border p-8" style={{ borderColor: B.border, background: B.card }}>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              Agent details
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              {loading ? "Loading…" : loadError ?? "Agent not found"}
            </p>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="overflow-hidden rounded-3xl border shadow-sm" style={{ borderColor: B.border, background: B.card }}>
              <div className="relative overflow-hidden px-5 py-7 md:px-8" style={{ background: B.badgeGrad }}>
                <span
                  aria-hidden
                  className="agent-hero-blob pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)" }}
                />
                <span
                  aria-hidden
                  className="agent-hero-blob pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(120,180,255,0.30) 0%, rgba(120,180,255,0) 70%)", animationDelay: "-4s" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "18px 18px" }}
                />
                <div className="relative flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    onClick={() => setTab("kyc")}
                    title={
                      agent.profilePhotoUpdatedAt
                        ? "Profile photo set by the agent"
                        : photoSrc
                          ? "Photo from KYC — open KYC"
                          : "No photo yet — the agent can add one in Settings or KYC"
                    }
                    className="group relative shrink-0"
                  >
                    <AgentAvatar
                      src={photoSrc}
                      name={agent.name}
                      className="h-[72px] w-[72px] rounded-2xl bg-white text-2xl font-extrabold shadow-lg transition group-hover:scale-[1.03]"
                      style={{ color: B.blueLight, boxShadow: "0 0 0 4px rgba(255,255,255,0.25), 0 12px 24px -10px rgba(0,0,0,0.35)" }}
                    />
                    {!photoSrc ? (
                      <span
                        className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow"
                        style={{ background: "#F59E0B", color: "#fff" }}
                      >
                        <Camera size={12} />
                      </span>
                    ) : null}
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white"
                      style={{ background: agent.isFrozen ? toneColor.red : "#4ADE80" }}
                      title={agent.isFrozen ? "Frozen" : "Active"}
                    />
                  </button>
                  <div className="min-w-0 flex-1 text-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-[28px]">{agent.name}</h1>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold" style={{ color: B.blueLight }}>
                        <BadgeCheck size={12} />
                        {ROLE_LABEL[agent.role] ?? agent.role}
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <HeroFact icon={Hash} onClick={copyUid} title="Copy UID">
                        <span className="font-mono">{agent.uid}</span>
                        <Copy size={12} className="opacity-70" />
                      </HeroFact>
                      <HeroFact icon={Phone}>{agent.mobile}</HeroFact>
                      {agent.email ? <HeroFact icon={Mail}>{agent.email}</HeroFact> : null}
                      <HeroFact icon={CalendarDays}>
                        Joined {new Date(agent.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </HeroFact>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    {heroWallets.length ? (
                      <div className="flex flex-wrap gap-2">
                        {heroWallets.map((w) => (
                          <HeroWallet
                            key={w.walletType}
                            icon={w.walletType === "aeps" ? Fingerprint : Wallet}
                            label={w.walletType === "main" ? "Main wallet" : w.walletType === "aeps" ? "AEPS wallet" : w.walletType}
                            value={inrText(w.balance)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="relative mt-5 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/75">
                      <ShieldCheck size={12} /> Account health
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={
                        healthMissing
                          ? { background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.5)", color: "#FEF3C7" }
                          : { background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.5)", color: "#DCFCE7" }
                      }
                    >
                      {healthMissing ? <AlertTriangle size={12} /> : <CircleCheck size={12} />}
                      {healthMissing ? `${healthMissing} thing${healthMissing === 1 ? "" : "s"} to sort out` : "Fully set up"}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {healthItems.map((h) => {
                      const HIcon = h.icon;
                      return (
                        <button
                          key={h.label}
                          type="button"
                          onClick={() => setTab(h.tab)}
                          title={h.hint ?? h.label}
                          className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/12 px-3 py-2 text-left text-white backdrop-blur-sm transition hover:bg-white/20"
                          style={{ border: "1px solid rgba(255,255,255,0.22)" }}
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={
                              h.ok === null
                                ? { background: "rgba(255,255,255,0.18)", color: "#fff" }
                                : { background: h.ok ? "rgba(74,222,128,0.22)" : "rgba(251,191,36,0.25)", color: h.ok ? "#86EFAC" : "#FCD34D" }
                            }
                          >
                            <HIcon size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-semibold text-white/75">{h.label}</span>
                            <span className="flex min-w-0 items-center gap-1 text-sm font-bold">
                              {h.ok === null ? null : (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: h.ok ? "#4ADE80" : "#FBBF24" }} />
                              )}
                              <span className="truncate">{h.status}</span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {agent.kycStatus === "rejected" ? (
              <div
                className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: "#FCA5A5", background: "linear-gradient(90deg, #FEE2E2 0%, #FEF2F2 60%, var(--admin-card) 100%)" }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#FECACA", color: "#B91C1C" }}>
                  <CircleX size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: "#991B1B" }}>
                    KYC rejected{rejectedAt ? ` · ${rejectedAt}` : ""}
                  </p>
                  <p className="text-xs" style={{ color: "#B91C1C" }}>
                    {rejectedReason ? <>Reason: <strong>{rejectedReason}</strong></> : "No reason was recorded."} The agent sees this and can resubmit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("kyc")}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-white"
                  style={{ borderColor: "#FCA5A5", color: "#B91C1C" }}
                >
                  Open KYC <ChevronRight size={15} />
                </button>
              </div>
            ) : null}

            {agent.kycStatus === "pending" ? (
              <div
                className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: "#FCD34D", background: "linear-gradient(90deg, #FFF7E0 0%, #FFFBEB 60%, var(--admin-card) 100%)" }}
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "#FEF3C7", color: "#B45309" }}>
                  <span className="absolute inset-0 animate-ping rounded-xl opacity-30" style={{ background: "#FCD34D" }} />
                  <AlertTriangle size={18} className="relative" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: "#92400E" }}>
                    KYC is waiting for review
                  </p>
                  <p className="text-xs" style={{ color: "#B45309" }}>
                    {agent.hasKycDocs ? "Check the documents and approve or reject." : "PAN and Aadhaar are not on file yet."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("kyc")}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                  style={{ background: B.badgeGrad }}
                >
                  Review KYC <ChevronRight size={15} />
                </button>
              </div>
            ) : null}

            {/* Tabs */}
            <div
              className="sticky top-[76px] z-20 flex gap-1 overflow-x-auto rounded-2xl border p-1.5 shadow-sm backdrop-blur"
              style={{ borderColor: B.border, background: "color-mix(in srgb, var(--admin-card) 92%, transparent)" }}
              role="tablist"
              aria-label="Agent sections"
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 ${
                      active ? "shadow-md" : "hover:bg-[rgba(42,92,221,0.08)] hover:text-[var(--admin-text)]"
                    }`}
                    style={active ? { background: B.badgeGrad, color: "#fff" } : { color: B.muted }}
                  >
                    <Icon size={16} />
                    {t.label}
                    {t.id === "kyc" && agent.kycStatus === "pending" ? (
                      <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : "#F59E0B" }} />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {tab === "overview" ? (
              <div className="agent-tab-in grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  {profileSection}
                  {recentTxnSection}
                </div>
                <div className="space-y-5">
                  {parentSection}
                  <LinkedAccountsCard userId={agent.id} />
                  <DetailSection title="Quick actions" icon={SlidersHorizontal}>
                    <div className="grid gap-2">
                      <QuickAction icon={FileCheck2} label="Review KYC" hint="Documents, approve or reject" onClick={() => setTab("kyc")} />
                      <QuickAction icon={Percent} label="Custom commission" hint="Per-slab rate for this agent" onClick={() => setTab("commission")} />
                      <QuickAction icon={Wallet} label="Wallet & banks" hint="Balances and settlement banks" onClick={() => setTab("wallet")} />
                      <QuickAction icon={SlidersHorizontal} label="Services & limits" hint="Service on/off, limits, role, restrict" onClick={() => setTab("controls")} />
                    </div>
                  </DetailSection>
                </div>
              </div>
            ) : null}

            {tab === "kyc" ? (
              <div className="agent-tab-in space-y-5">
              <KycStepper steps={kycSteps} />
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <DetailSection title="KYC identity" icon={ShieldCheck}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ProfileTile icon={IdCard} label="PAN" value={agent.kyc.panMasked} />
                      <ProfileTile icon={Fingerprint} label="Aadhaar" value={agent.kyc.aadhaarMasked} />
                      <ProfileTile icon={kycPill(agent.kyc.status).icon} label="Status" value={kycPill(agent.kyc.status).text} />
                      <ProfileTile
                        icon={CalendarDays}
                        label="Submitted"
                        value={
                          agent.kyc.submittedAt
                            ? new Date(agent.kyc.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                            : "Not submitted"
                        }
                        missing={!agent.kyc.submittedAt}
                      />
                    </div>
                  </DetailSection>
                  {agent.kyc.verification ? (
                    <DetailSection title="Automatic checks" icon={BadgeCheck}>
                      <AutoChecks v={agent.kyc.verification} />
                    </DetailSection>
                  ) : null}
                  <DetailSection title="KYC address & bank" icon={MapPin}>
                    <div className="space-y-3">
                      <SectionIntro icon={Info}>From the KYC submission. Withdrawal banks are verified in Wallet &amp; bank.</SectionIntro>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ProfileTile icon={MapPin} label="City" value={agent.kyc.city} />
                        <ProfileTile icon={Hash} label="Pincode" value={agent.kyc.pincode} />
                        <ProfileTile icon={Landmark} label="Bank (KYC)" value={agent.kyc.bankName} />
                        <ProfileTile icon={agent.kyc.hasBank ? CircleCheck : CircleX} label="Bank on file" value={agent.kyc.hasBank ? "Yes" : "No"} missing={!agent.kyc.hasBank} />
                      </div>
                    </div>
                  </DetailSection>
                  <DetailSection title="KYC documents" icon={Banknote}>
                    {docsUploaded ? (
                      <KycDocumentGrid
                        documents={agent.documents}
                        documentFiles={agent.documentFiles}
                        checkLabels={agent.docCheckLabels}
                      />
                    ) : (
                      <EmptyState
                        icon={FileCheck2}
                        title="No KYC documents yet"
                        hint="PAN, Aadhaar, cheque and photos show here once the agent uploads them in the app or web."
                      />
                    )}
                  </DetailSection>
                </div>
                <div className="space-y-5">
                  <DetailSection title="KYC decision" icon={ShieldCheck}>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <StatusPill label="KYC" {...kycPill(agent.kycStatus)} />
                        <StatusPill
                          label="Account"
                          {...(agent.isFrozen
                            ? { text: "Frozen", tone: "red" as const, icon: Snowflake }
                            : { text: "Active", tone: "green" as const, icon: CircleCheck, live: true })}
                        />
                      </div>
                      {agent.kycStatus === "rejected" ? (
                        <div
                          className="rc-slab-in rounded-2xl border p-3"
                          style={{ borderColor: "#FCA5A5", background: "linear-gradient(180deg, #FEF2F2 0%, var(--admin-card) 100%)" }}
                        >
                          <div className="flex items-center gap-2">
                            <CircleX size={16} style={{ color: "#B91C1C" }} />
                            <p className="text-sm font-bold" style={{ color: "#991B1B" }}>
                              Rejected{rejectedAt ? ` · ${rejectedAt}` : ""}
                            </p>
                          </div>
                          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                            Reason sent to the agent
                          </p>
                          <p className="text-sm font-semibold" style={{ color: B.blue }}>
                            {rejectedReason ?? "No reason was recorded for this rejection."}
                          </p>
                          <p className="mt-1.5 text-[11px]" style={{ color: B.muted }}>
                            The agent can fix and resubmit. Use Reset KYC below to clear PAN / Aadhaar and start over.
                          </p>
                        </div>
                      ) : null}
                      {agent.kycStatus === "pending" ? (
                        <div>
                          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
                            Ready to approve?
                          </p>
                          <CheckList
                            items={[
                              { label: "PAN number", ok: !!agent.kyc.panMasked, okText: "On file", icon: IdCard },
                              { label: "Aadhaar number", ok: !!agent.kyc.aadhaarMasked, okText: "On file", icon: Fingerprint },
                              { label: "Documents uploaded", ok: docsUploaded, okText: "Uploaded", icon: FileCheck2 },
                              { label: "Personal photo", ok: !!kycPhotoSrc, okText: "On file", hint: "KYC selfie", icon: Camera },
                              { label: "Bank details", ok: agent.kyc.hasBank, okText: "On file", icon: Landmark },
                            ]}
                            allGood="Everything is on file — check the photos, then approve."
                            notReady={
                              agent.hasKycDocs
                                ? "{n} missing — you can still approve, but check with the agent first."
                                : "{n} missing — Approve unlocks once PAN and Aadhaar are on file."
                            }
                          />
                        </div>
                      ) : null}
                      {agent.kycStatus === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy || !agent.hasKycDocs}
                            onClick={() => void decideKyc("verified")}
                            className="admin-btn-success w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                          >
                            Approve KYC
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRejectOpen(true)}
                            className="w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                            style={{ borderColor: B.danger, color: B.danger }}
                          >
                            Reject KYC
                          </button>
                        </>
                      ) : null}
                      {agent.kycStatus !== "pending" || agent.hasKycDocs ? (
                        <div className="space-y-2.5 rounded-2xl border p-3" style={{ borderColor: "#FCA5A5", background: "linear-gradient(180deg, #FEF2F2 0%, var(--admin-card) 100%)" }}>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "#FEE2E2", color: B.danger }}>
                              <RotateCcw size={15} />
                            </span>
                            <div>
                              <p className="text-sm font-bold" style={{ color: B.blue }}>
                                Reset KYC
                              </p>
                              <p className="text-[11px]" style={{ color: B.muted }}>
                                Clears PAN / Aadhaar and asks the agent to submit KYC again (e.g. wrong photo).
                              </p>
                            </div>
                          </div>
                          <ReasonSelect
                            value={kycResetReason}
                            onChange={setKycResetReason}
                            presets={KYC_RESET_REASON_PRESETS}
                            placeholder="Select reset reason"
                          />
                          <button
                            type="button"
                            disabled={busy || kycResetReason.trim().length < 8}
                            onClick={askResetKyc}
                            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            style={{ background: B.danger }}
                          >
                            Reset KYC
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </DetailSection>
                </div>
              </div>
              </div>
            ) : null}

            {tab === "wallet" ? (
              <div className="agent-tab-in space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  {heroWallets.length === 0 ? (
                    <div className="md:col-span-2">
                      <EmptyState icon={Wallet} title="No wallets yet" hint="Wallets are created on the first credit to this agent." />
                    </div>
                  ) : (
                    heroWallets.map((w) => {
                      const aeps = w.walletType === "aeps";
                      const WIcon = aeps ? Fingerprint : Wallet;
                      return (
                        <div
                          key={w.walletType}
                          className="agent-lift relative overflow-hidden rounded-2xl px-5 py-4 text-white shadow-sm"
                          style={{ background: aeps ? "linear-gradient(135deg, #0E7490 0%, #0891B2 55%, #22D3EE 100%)" : B.badgeGrad }}
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full"
                            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 70%)" }}
                          />
                          <div className="relative flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                              {w.walletType === "main" ? "Main wallet" : aeps ? "AEPS wallet" : w.walletType}
                            </p>
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                              <WIcon size={17} />
                            </span>
                          </div>
                          <p className="relative mt-2 text-3xl font-extrabold tabular-nums tracking-tight">{inrText(w.balance)}</p>
                          <p className="relative mt-1 text-[11px] text-white/75">
                            {aeps ? "AePS cash withdrawals land here · settles to bank" : "Recharge, bills and transfers spend from here"}
                          </p>
                        </div>
                      );
                    })
                  )}
                  <div className="agent-lift flex flex-col rounded-2xl border px-5 py-4" style={{ borderColor: B.border, background: B.card }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-xl"
                          style={{
                            background: agent.fundRequestEnabled ? "rgba(22,163,74,0.12)" : "rgba(100,116,139,0.12)",
                            color: agent.fundRequestEnabled ? "#16A34A" : "#64748B",
                          }}
                        >
                          <Banknote size={17} />
                        </span>
                        <div>
                          <p className="text-sm font-bold" style={{ color: B.blue }}>
                            Fund requests
                          </p>
                          <p className="text-[11px] font-semibold" style={{ color: agent.fundRequestEnabled ? "#16A34A" : B.muted }}>
                            {agent.fundRequestEnabled ? "Agent can request funds" : "Turned off"}
                          </p>
                        </div>
                      </div>
                      <FundRequestSwitch
                        key={`${agent.id}:${agent.fundRequestEnabled}`}
                        userId={agent.id}
                        name={agent.name}
                        enabled={agent.fundRequestEnabled}
                        onChange={(enabled) => setAgent((a) => (a ? { ...a, fundRequestEnabled: enabled } : a))}
                      />
                    </div>
                    <p className="mt-auto pt-3 text-[11px] leading-relaxed" style={{ color: B.muted }}>
                      {agent.role === "retailer"
                        ? "Off by default for retailers — turn on when the sales manager asks."
                        : "On by default for Super Distributors and Distributors."}
                    </p>
                  </div>
                </div>
                <AgentSettlementBanksCard userId={agent.id} />
              </div>
            ) : null}

            {tab === "commission" ? (
              <div id="commission" className="agent-tab-in" style={{ "--rc-sticky-top": "140px" } as CSSProperties}>
                <AgentRateCard userId={agent.id} role={agent.role} agentName={agent.name} />
              </div>
            ) : null}

            {tab === "controls" ? (
              <div className="agent-tab-in grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  <ServiceAccessCard userId={agent.id} agentName={agent.name} />
                  <DetailSection title="Login" icon={KeyRound}>
                    <LoginEmailCard agent={agent} busy={busy} onResend={askResendLoginEmail} />
                    {agent.isFrozen ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setRestriction("none")}
                        className="admin-btn-primary mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Unfreeze agent
                      </button>
                    ) : null}
                  </DetailSection>

                  {agent.role !== "admin" ? (
                    <DetailSection title="Restrict services" icon={ShieldCheck}>
                      <div className="space-y-3">
                        <SectionIntro icon={Info}>
                          Soft and Hard keep login, balance and settlement working. Freeze stops everything — confirmed
                          fraud only. Pick a reason, then a level.
                        </SectionIntro>
                        <ReasonSelect
                          value={restrictReason}
                          onChange={setRestrictReason}
                          presets={RESTRICT_REASON_PRESETS}
                          placeholder="Select restriction reason"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {RESTRICT_LEVELS.map((lvl) => {
                            const LvlIcon = lvl.icon;
                            return (
                              <button
                                key={lvl.id}
                                type="button"
                                disabled={busy}
                                onClick={() => void setRestriction(lvl.id)}
                                className="agent-lift flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left disabled:opacity-50"
                                style={{
                                  borderColor: `color-mix(in srgb, ${lvl.tone} 40%, transparent)`,
                                  background: `color-mix(in srgb, ${lvl.tone} 6%, var(--admin-card))`,
                                }}
                              >
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{ background: `color-mix(in srgb, ${lvl.tone} 16%, transparent)`, color: lvl.tone }}
                                >
                                  <LvlIcon size={17} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-bold" style={{ color: lvl.tone }}>
                                    {lvl.label}
                                  </span>
                                  <span className="block truncate text-[11px]" style={{ color: B.muted }}>
                                    {lvl.hint}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </DetailSection>
                  ) : null}
                </div>

                <div className="space-y-5">
                  <NightAccessCard userId={agent.id} agentName={agent.name} />
                  <RoleAccountCard userId={agent.id} uid={agent.uid} agentName={agent.name} onChanged={() => void load()} />
                  {agent.role === "distributor" || agent.role === "retailer" ? (
                    <DetailSection title="Move in tree" icon={Network}>
                      <div className="mb-3">
                        <SectionIntro icon={ArrowRightLeft}>
                          Put this agent under a different upline. Their own balance and history stay with them.
                          {agent.parent ? (
                            <>
                              {" "}
                              Now under <strong>{agent.parent.name}</strong>.
                            </>
                          ) : null}
                        </SectionIntro>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setMoveOpen(true)}
                        className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Change upline
                      </button>
                    </DetailSection>
                  ) : null}

                  {agent.role === "retailer" ? (
                    <DetailSection title="Reactivate AePS" icon={Clock}>
                      <div className="space-y-3">
                        <SectionIntro icon={Fingerprint} tone={agent.kycStatus === "verified" ? B.blueLight : "#D97706"}>
                          Clears an AePS block and restarts the dormancy clock.{" "}
                          {agent.kycStatus === "verified" ? "KYC is verified, so this can run." : <strong>KYC must be verified first.</strong>}
                        </SectionIntro>
                        <ReasonSelect
                          value={aepsReason}
                          onChange={setAepsReason}
                          presets={AEPS_REACTIVATE_REASON_PRESETS}
                          placeholder="Select reactivation reason"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void reactivateAeps()}
                          className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        >
                          Reactivate AePS
                        </button>
                      </div>
                    </DetailSection>
                  ) : null}
                </div>

                <div className="lg:col-span-2">
                  <TxnLimitsCard userId={agent.id} agentName={agent.name} />
                </div>
              </div>
            ) : null}

            {moveOpen && (agent.role === "distributor" || agent.role === "retailer") ? (
              <MoveAgentModal
                agents={[{ id: agent.id, name: agent.name, mobile: agent.mobile, role: agent.role }]}
                onClose={() => setMoveOpen(false)}
                onMoved={() => void load()}
              />
            ) : null}
          </>
        )}
      </div>

      {rejectOpen && agent ? (
        <Modal
          title="Reject KYC"
          eyebrow={agent.name}
          subtitle="Pick what is wrong. The agent sees this reason and can resubmit."
          icon={<CircleX size={22} />}
          iconTone="red"
          onClose={() => {
            if (!busy) setRejectOpen(false);
          }}
        >
          <div className="space-y-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}>
              <p className="mb-1.5 text-xs font-semibold" style={{ color: B.muted }}>
                Rejection reason
              </p>
              <ReasonSelect value={rejectReason} onChange={setRejectReason} presets={KYC_REJECT_REASON_PRESETS} placeholder="Select what is wrong" />
              <p className="mt-1.5 text-[11px]" style={{ color: rejectReason.trim().length > 0 && rejectReason.trim().length < 8 ? B.danger : B.muted }}>
                {rejectReason.trim().length > 0 && rejectReason.trim().length < 8
                  ? "Reason must be at least 8 characters"
                  : "Shown to the agent on their dashboard and in the app"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejectOpen(false)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: B.border, color: B.blue, background: "var(--admin-card)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || rejectReason.trim().length < 8}
                onClick={() => void decideKyc("rejected", rejectReason.trim())}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: B.danger }}
              >
                {busy ? "Rejecting…" : "Reject KYC"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          busy={busy}
          onConfirm={() => void pendingConfirm.action()}
          onClose={() => {
            if (!busy) setPendingConfirm(null);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
