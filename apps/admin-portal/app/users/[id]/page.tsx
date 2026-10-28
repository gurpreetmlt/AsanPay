"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
} from "@/components/users/ReasonSelect";
import { AgentRateCard } from "@/components/users/AgentRateCard";
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
  { id: "controls", label: "Controls", icon: SlidersHorizontal },
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
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  onCopy?: () => void;
}) {
  return (
    <div
      className="agent-lift flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3"
      style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "rgba(42,92,221,0.10)", color: B.blueLight }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="truncate text-sm font-semibold" style={{ color: B.blue }} title={value ?? undefined}>
          {value || "—"}
        </p>
      </div>
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

/** White pill on the blue hero: small label + value with a coloured dot. */
function HeroChip({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-2 text-white backdrop-blur-sm" style={{ border: "1px solid rgba(255,255,255,0.25)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold capitalize">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {value}
      </p>
    </div>
  );
}

/** Stat tile under the hero: coloured icon, label, value, optional sub line. */
function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="agent-lift relative flex min-w-0 items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3.5"
      style={{ borderColor: B.border, background: "var(--admin-card)" }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tone, opacity: 0.85 }} />
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 22%, transparent), color-mix(in srgb, ${tone} 8%, transparent))`,
          color: tone,
        }}
      >
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {label}
        </p>
        <p className="truncate text-base font-bold" style={{ color: B.blue }}>
          {value}
        </p>
        {sub ? (
          <p className="truncate text-[11px]" style={{ color: B.muted }}>
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

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
        fetchApi<RecentTxn[]>("/admin/transactions", { userId: id, limit: "10" }),
        fetchApi<SettlementBankBrief[]>(`/settlements/banks/by-user/${id}`).catch(() => []),
      ]);
      setAgent(detail);
      setRecentTxns(txns);
      setActiveBank(banks.find((b) => b.isActive) ?? null);
    } catch {
      toast.error("Failed to load agent details");
      setAgent(null);
      setActiveBank(null);
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

  async function decideKyc(decision: "verified" | "rejected") {
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
      }>(`/admin/kyc/${agent.id}/decide`, { decision });
      const message = data.message ?? (decision === "verified" ? "KYC approved" : "KYC rejected");
      if (data.data?.loginEmail?.status === "failed") toast.error(message, { duration: 8000 });
      else toast.success(message);
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

  const heroWallets = [...(agent?.wallets ?? [])].sort((a, b) => (a.walletType === "main" ? -1 : b.walletType === "main" ? 1 : 0));
  const lastTxn = recentTxns[0];
  const kyc = agent ? kycPill(agent.kycStatus) : null;
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
          <Link
            href={`/users/${agent.parent.id}`}
            className="agent-lift group flex items-center gap-3 rounded-2xl border px-3.5 py-3"
            style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white shadow-sm"
              style={{ background: B.badgeGrad }}
            >
              {initialsOf(agent.parent.name ?? "")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                {agent.parent.name}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                {agent.parent.role ? ROLE_LABEL[agent.parent.role] ?? agent.parent.role : "—"} · {agent.parent.uid}
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 transition group-hover:translate-x-0.5" style={{ color: B.blueLight }} />
          </Link>
          <div className="ml-[1.85rem] h-5 w-px border-l-2 border-dashed" style={{ borderColor: B.border }} />
          <div className="flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3" style={{ borderColor: B.blueLight, background: "rgba(42,92,221,0.06)" }}>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-extrabold shadow-sm"
              style={{ color: B.blueLight }}
            >
              {initialsOf(agent.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                {agent.name}
              </p>
              <p className="text-xs" style={{ color: B.muted }}>
                {ROLE_LABEL[agent.role] ?? agent.role} · {agent.uid}
              </p>
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: B.badgeGrad }}>
              This agent
            </span>
          </div>
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

        {loading || !agent ? (
          <div className="rounded-3xl border p-8" style={{ borderColor: B.border, background: B.card }}>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              Agent details
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              {loading ? "Loading…" : "Agent not found"}
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
                  <span className="relative shrink-0">
                    <span
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-white text-2xl font-extrabold shadow-lg"
                      style={{ color: B.blueLight, boxShadow: "0 0 0 4px rgba(255,255,255,0.25), 0 12px 24px -10px rgba(0,0,0,0.35)" }}
                    >
                      {initialsOf(agent.name)}
                    </span>
                    <span
                      className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white"
                      style={{ background: agent.isFrozen ? toneColor.red : "#4ADE80" }}
                      title={agent.isFrozen ? "Frozen" : "Active"}
                    />
                  </span>
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
                    <div className="flex flex-wrap gap-2">
                      <HeroChip label="KYC" value={kyc!.text} dot={toneColor[kyc!.tone]} />
                      <HeroChip
                        label="Account"
                        value={agent.isFrozen ? "Frozen" : "Active"}
                        dot={agent.isFrozen ? toneColor.red : "#4ADE80"}
                      />
                    </div>
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
              </div>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--admin-bg)" }}>
                <StatTile icon={kyc!.icon} tone={toneColor[kyc!.tone]} label="KYC" value={kyc!.text} sub={agent.kyc.panMasked ? `PAN ${agent.kyc.panMasked}` : "PAN not on file"} />
                <StatTile
                  icon={Landmark}
                  tone={activeBank ? toneColor.green : toneColor.slate}
                  label="Settlement bank"
                  value={activeBank ? `${activeBank.holderName} · ****${activeBank.accountNumberLast4}` : "None active"}
                  sub={activeBank?.ifsc}
                />
                <StatTile
                  icon={Network}
                  tone={B.blueLight}
                  label="Upline"
                  value={agent.parent?.name ?? "Top of network"}
                  sub={agent.parent ? `${agent.parent.role ? ROLE_LABEL[agent.parent.role] ?? agent.parent.role : ""} · ${agent.parent.uid ?? ""}` : undefined}
                />
                <StatTile
                  icon={History}
                  tone={toneColor.slate}
                  label="Last transaction"
                  value={lastTxn ? `${inrText(lastTxn.amount)} · ${lastTxn.status}` : "No transactions"}
                  sub={lastTxn ? `${lastTxn.serviceName} · ${new Date(lastTxn.createdAt).toLocaleString("en-IN")}` : undefined}
                />
              </div>
            </div>

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
              className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-2xl border p-1.5 shadow-sm backdrop-blur"
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
                <div className="space-y-5">{parentSection}</div>
              </div>
            ) : null}

            {tab === "kyc" ? (
              <div className="agent-tab-in grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <DetailSection title="KYC identity" icon={ShieldCheck}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ProfileTile icon={IdCard} label="PAN" value={agent.kyc.panMasked ?? "Not on file"} />
                      <ProfileTile icon={Fingerprint} label="Aadhaar" value={agent.kyc.aadhaarMasked ?? "Not on file"} />
                      <ProfileTile icon={kycPill(agent.kyc.status).icon} label="Status" value={kycPill(agent.kyc.status).text} />
                      <ProfileTile
                        icon={CalendarDays}
                        label="Submitted"
                        value={
                          agent.kyc.submittedAt
                            ? new Date(agent.kyc.submittedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                            : "Not submitted"
                        }
                      />
                    </div>
                  </DetailSection>
                  <DetailSection title="KYC address & bank" icon={MapPin}>
                    <div className="space-y-3">
                      <SectionIntro icon={Info}>From the KYC submission. Withdrawal banks are verified in Wallet &amp; bank.</SectionIntro>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ProfileTile icon={MapPin} label="City" value={agent.kyc.city} />
                        <ProfileTile icon={Hash} label="Pincode" value={agent.kyc.pincode} />
                        <ProfileTile icon={Landmark} label="Bank (KYC)" value={agent.kyc.bankName} />
                        <ProfileTile icon={agent.kyc.hasBank ? CircleCheck : CircleX} label="Bank on file" value={agent.kyc.hasBank ? "Yes" : "No"} />
                      </div>
                    </div>
                  </DetailSection>
                  <DetailSection title="KYC documents" icon={Banknote}>
                    <KycDocumentGrid
                      documents={agent.documents}
                      documentFiles={agent.documentFiles}
                      checkLabels={agent.docCheckLabels}
                    />
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
                          {!agent.hasKycDocs ? (
                            <SectionIntro icon={AlertTriangle} tone="#D97706">
                              PAN and Aadhaar numbers are missing — the agent must complete signup KYC before you can approve.
                            </SectionIntro>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decideKyc("rejected")}
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
              <div id="commission" className="agent-tab-in">
                <AgentRateCard userId={agent.id} role={agent.role} agentName={agent.name} />
              </div>
            ) : null}

            {tab === "controls" ? (
              <div className="agent-tab-in grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
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
