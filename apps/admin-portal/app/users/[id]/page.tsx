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
  type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { DetailSection, InfoRow } from "@/components/users/DetailSection";
import { AgentSettlementBanksCard } from "@/components/users/AgentSettlementBanksCard";
import { KycDocumentGrid } from "@/components/users/KycDocumentGrid";
import type { DocCheckLabelMap } from "@/components/users/DocCheckLabels";
import {
  ReasonSelect,
  RESTRICT_REASON_PRESETS,
  AEPS_REACTIVATE_REASON_PRESETS,
  KYC_RESET_REASON_PRESETS,
} from "@/components/users/ReasonSelect";
import { AgentCommissionPanel } from "@/components/users/AgentCommissionPanel";
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
    <div className="flex min-w-0 items-start gap-3 px-5 py-4" style={{ background: "var(--admin-card)" }}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
      >
        <Icon size={18} />
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
  if (!le || (!le.pending && !le.status && !le.mustChangePassword)) return null;

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

  const mainBal = agent?.wallets.find((w) => w.walletType === "main")?.balance;
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

  const profileSection = agent ? (
    <DetailSection title="Agent profile" icon={User}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoRow label="Name" value={agent.name} />
        <InfoRow label="Mobile" value={agent.mobile} />
        <InfoRow label="Email" value={agent.email} />
        <InfoRow label="UID" value={agent.uid} />
        <InfoRow label="Role" value={ROLE_LABEL[agent.role] ?? agent.role} />
        <InfoRow label="Joined" value={new Date(agent.createdAt).toLocaleString("en-IN")} />
      </div>
    </DetailSection>
  ) : null;

  const parentSection = agent ? (
    <DetailSection title="Network parent" icon={Network}>
      {agent.parent ? (
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
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
          <Link
            href={`/users/${agent.parent.id}`}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:brightness-105"
            style={{ borderColor: B.border, color: B.blueLight }}
          >
            Open →
          </Link>
        </div>
      ) : (
        <p className="text-sm" style={{ color: B.muted }}>
          No parent (top-level Super Distributor)
        </p>
      )}
    </DetailSection>
  ) : null;

  const recentTxnSection = (
    <DetailSection title="Recent transactions" icon={History}>
      {recentTxns.length === 0 ? (
        <p className="text-sm" style={{ color: B.muted }}>
          No transactions yet
        </p>
      ) : (
        <div className="divide-y rounded-xl border" style={{ borderColor: B.border }}>
          {recentTxns.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm" style={{ borderColor: B.border }}>
              <div className="min-w-0">
                <div className="truncate font-semibold" style={{ color: B.blue }}>
                  {t.serviceName}
                </div>
                <div className="truncate font-mono text-[11px]" style={{ color: B.muted }}>
                  {t.txnRef} · {new Date(t.createdAt).toLocaleString("en-IN")}
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
              <div className="px-5 py-6 md:px-7" style={{ background: B.badgeGrad }}>
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl font-extrabold shadow-md"
                    style={{ color: B.blueLight }}
                  >
                    {initialsOf(agent.name)}
                  </span>
                  <div className="min-w-0 flex-1 text-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-2xl font-extrabold">{agent.name}</h1>
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                        {ROLE_LABEL[agent.role] ?? agent.role}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/85">
                      <button
                        type="button"
                        onClick={copyUid}
                        className="inline-flex items-center gap-1 font-mono font-semibold hover:text-white"
                        title="Copy UID"
                      >
                        {agent.uid} <Copy size={13} />
                      </button>
                      <span className="inline-flex items-center gap-1">
                        <Phone size={13} /> {agent.mobile}
                      </span>
                      {agent.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail size={13} /> {agent.email}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={13} /> Joined {new Date(agent.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <HeroChip label="KYC" value={kyc!.text} dot={toneColor[kyc!.tone]} />
                    <HeroChip
                      label="Account"
                      value={agent.isFrozen ? "Frozen" : "Active"}
                      dot={agent.isFrozen ? toneColor.red : "#4ADE80"}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: B.border }}>
                <StatTile icon={kyc!.icon} tone={toneColor[kyc!.tone]} label="KYC" value={kyc!.text} sub={agent.kyc.panMasked ? `PAN ${agent.kyc.panMasked}` : "PAN not on file"} />
                <StatTile
                  icon={Landmark}
                  tone={activeBank ? toneColor.green : toneColor.slate}
                  label="Settlement bank"
                  value={activeBank ? `${activeBank.holderName} · ****${activeBank.accountNumberLast4}` : "None active"}
                  sub={activeBank?.ifsc}
                />
                <StatTile icon={Wallet} tone={B.blueLight} label="Main balance" value={mainBal != null ? inrText(mainBal) : "—"} />
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
                style={{ borderColor: "#FCD34D", background: "#FFFBEB" }}
              >
                <AlertTriangle size={18} style={{ color: "#B45309" }} />
                <p className="flex-1 text-sm font-semibold" style={{ color: "#92400E" }}>
                  KYC is waiting for review.{" "}
                  <span className="font-normal">
                    {agent.hasKycDocs ? "Check the documents and approve or reject." : "PAN and Aadhaar are not on file yet."}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setTab("kyc")}
                  className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
                  style={{ background: B.badgeGrad }}
                >
                  Review KYC
                </button>
              </div>
            ) : null}

            {/* Tabs */}
            <div
              className="flex gap-1 overflow-x-auto rounded-2xl border p-1.5"
              style={{ borderColor: B.border, background: B.card }}
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
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition"
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
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  {profileSection}
                  {recentTxnSection}
                </div>
                <div className="space-y-5">{parentSection}</div>
              </div>
            ) : null}

            {tab === "kyc" ? (
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <DetailSection title="KYC identity" icon={ShieldCheck}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoRow label="PAN" value={agent.kyc.panMasked} />
                      <InfoRow label="Aadhaar" value={agent.kyc.aadhaarMasked} />
                      <InfoRow label="Status" value={agent.kyc.status} />
                      <InfoRow
                        label="Submitted"
                        value={agent.kyc.submittedAt ? new Date(agent.kyc.submittedAt).toLocaleString("en-IN") : null}
                      />
                    </div>
                  </DetailSection>
                  <DetailSection title="KYC address & bank" icon={MapPin}>
                    <p className="mb-4 text-sm" style={{ color: B.muted }}>
                      From the KYC submission. Withdrawal banks are verified in Wallet & bank.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoRow label="City" value={agent.kyc.city} />
                      <InfoRow label="Pincode" value={agent.kyc.pincode} />
                      <InfoRow label="Bank (KYC)" value={agent.kyc.bankName} />
                      <InfoRow label="Bank on file" value={agent.kyc.hasBank ? "Yes" : "No"} />
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
                            <p className="text-xs" style={{ color: B.muted }}>
                              PAN and Aadhaar numbers missing — agent must complete signup KYC first.
                            </p>
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
                        <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: B.border }}>
                          <div className="text-sm font-semibold" style={{ color: B.blue }}>
                            Reset KYC
                          </div>
                          <p className="text-xs" style={{ color: B.muted }}>
                            Clears PAN / Aadhaar and asks the agent to submit KYC again (e.g. wrong photo uploaded).
                          </p>
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
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <DetailSection title="Balances" icon={Wallet}>
                    {agent.wallets.length === 0 ? (
                      <p className="text-sm" style={{ color: B.muted }}>
                        No balances yet
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {agent.wallets.map((w) => (
                          <div
                            key={w.walletType}
                            className="rounded-2xl border px-4 py-4"
                            style={{ borderColor: B.border, background: "linear-gradient(180deg, #F7F9FF 0%, var(--admin-card) 100%)" }}
                          >
                            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                              {w.walletType === "main" ? "Main wallet" : w.walletType === "aeps" ? "AEPS wallet" : w.walletType}
                            </p>
                            <p className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: B.blue }}>
                              {inrText(w.balance)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailSection>
                  <AgentSettlementBanksCard userId={agent.id} />
                </div>
                <div className="space-y-5">
                  <DetailSection title="Fund requests" icon={Banknote}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs" style={{ color: B.muted }}>
                        {agent.role === "retailer"
                          ? "Off by default for retailers — turn on when the sales manager asks"
                          : "On by default for Super Distributors and Distributors"}
                      </p>
                      <FundRequestSwitch
                        key={`${agent.id}:${agent.fundRequestEnabled}`}
                        userId={agent.id}
                        name={agent.name}
                        enabled={agent.fundRequestEnabled}
                        showLabel
                        onChange={(enabled) => setAgent((a) => (a ? { ...a, fundRequestEnabled: enabled } : a))}
                      />
                    </div>
                  </DetailSection>
                </div>
              </div>
            ) : null}

            {tab === "commission" ? (
              <div id="commission">
                <AgentCommissionPanel userId={agent.id} />
              </div>
            ) : null}

            {tab === "controls" ? (
              <div className="grid gap-5 lg:grid-cols-2">
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
                      <div className="space-y-2">
                        <p className="text-xs" style={{ color: B.muted }}>
                          Soft: AePS + money transfer off, bill payments still work. Hard: adds no top-ups. Both keep
                          login, balance and settlement working. Freeze stops everything — confirmed fraud only.
                        </p>
                        <ReasonSelect
                          value={restrictReason}
                          onChange={setRestrictReason}
                          presets={RESTRICT_REASON_PRESETS}
                          placeholder="Select restriction reason"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          {(["soft", "hard", "freeze", "none"] as const).map((lvl) => (
                            <button
                              key={lvl}
                              type="button"
                              disabled={busy}
                              onClick={() => void setRestriction(lvl)}
                              className="rounded-xl border-2 px-3 py-2 text-xs font-bold capitalize disabled:opacity-50"
                              style={{
                                borderColor: lvl === "freeze" ? B.danger : lvl === "none" ? B.green : B.border,
                                color: lvl === "freeze" ? B.danger : lvl === "none" ? B.green : "var(--admin-text)",
                                background: "var(--admin-bg)",
                              }}
                            >
                              {lvl === "none" ? "Lift all" : lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </DetailSection>
                  ) : null}
                </div>

                <div className="space-y-5">
                  {agent.role === "distributor" || agent.role === "retailer" ? (
                    <DetailSection title="Move in tree" icon={Network}>
                      <p className="mb-3 text-xs" style={{ color: B.muted }}>
                        Put this agent under a different upline. Their own balance and history stay with them.
                      </p>
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
                      <div className="space-y-2">
                        <p className="text-xs" style={{ color: B.muted }}>
                          Clears an AePS block and restarts the dormancy clock. KYC must be verified first.
                        </p>
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
