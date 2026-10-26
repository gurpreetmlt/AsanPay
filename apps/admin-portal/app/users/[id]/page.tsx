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
      await api.post(`/admin/kyc/${agent.id}/decide`, { decision });
      toast.success(decision === "verified" ? "KYC approved" : "KYC rejected");
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

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/users"
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium transition hover:opacity-80"
              style={{ color: B.blueMid }}
            >
              <ArrowLeft className="h-4 w-4" />
              All Agents
            </Link>
            {loading || !agent ? (
              <>
                <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                  Agent Details
                </h1>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  {loading ? "Loading…" : "Agent not found"}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                  {agent.name}
                </h1>
                <p className="mt-1 text-sm" style={{ color: B.muted }}>
                  {ROLE_LABEL[agent.role] ?? agent.role} · UID {agent.uid}
                </p>
              </>
            )}
          </div>
          {agent ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={agent.role} />
              <Badge status={agent.kycStatus} />
              <Badge status={agent.isFrozen ? "inactive" : "active"} />
            </div>
          ) : null}
        </div>

        {!loading && agent ? (
          <div
            className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-2 lg:grid-cols-4"
            style={{ borderColor: B.border, background: B.card }}
          >
            {(() => {
              const mainBal = agent.wallets.find((w) => w.walletType === "main")?.balance;
              const last = recentTxns[0];
              const chips: {
                key: string;
                label: string;
                value: string;
                sub?: string;
                icon: typeof ShieldCheck;
              }[] = [
                {
                  key: "kyc",
                  label: "KYC",
                  value: agent.kycStatus
                    .split("_")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" "),
                  icon: ShieldCheck,
                },
                {
                  key: "bank",
                  label: "Active settlement bank",
                  value: activeBank
                    ? `${activeBank.holderName} · ****${activeBank.accountNumberLast4}`
                    : "None active",
                  sub: activeBank ? activeBank.ifsc : undefined,
                  icon: Landmark,
                },
                {
                  key: "balance",
                  label: "Main balance",
                  value:
                    mainBal != null
                      ? `₹${Number(mainBal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                      : "—",
                  icon: Wallet,
                },
                {
                  key: "txn",
                  label: "Last txn",
                  value: last
                    ? `₹${Number(last.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} · ${last.status}`
                    : "No transactions",
                  sub: last
                    ? `${last.serviceName} · ${new Date(last.createdAt).toLocaleString("en-IN")}`
                    : undefined,
                  icon: History,
                },
              ];
              return chips.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.key}
                    className="flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(42,92,221,0.1)", color: B.blueLight }}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: B.muted }}>
                        {c.label}
                      </p>
                      <p className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                        {c.value}
                      </p>
                      {c.sub ? (
                        <p className="truncate text-[11px]" style={{ color: B.muted }}>
                          {c.sub}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : null}

        {!loading && agent ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <DetailSection title="Agent Profile" icon={User}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Name" value={agent.name} />
                  <InfoRow label="Mobile" value={agent.mobile} />
                  <InfoRow label="Email" value={agent.email} />
                  <InfoRow label="UID" value={agent.uid} />
                  <InfoRow label="Role" value={ROLE_LABEL[agent.role] ?? agent.role} />
                  <InfoRow
                    label="Joined"
                    value={new Date(agent.createdAt).toLocaleString("en-IN")}
                  />
                </div>
              </DetailSection>

              <DetailSection title="KYC Identity" icon={ShieldCheck}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="PAN" value={agent.kyc.panMasked} />
                  <InfoRow label="Aadhaar" value={agent.kyc.aadhaarMasked} />
                  <InfoRow label="Status" value={agent.kyc.status} />
                  <InfoRow
                    label="Submitted"
                    value={
                      agent.kyc.submittedAt
                        ? new Date(agent.kyc.submittedAt).toLocaleString("en-IN")
                        : null
                    }
                  />
                </div>
              </DetailSection>

              <DetailSection title="KYC address & bank" icon={MapPin}>
                <p className="mb-4 text-sm" style={{ color: B.muted }}>
                  From KYC submission (identity). Withdrawal banks are verified in the next section.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="City" value={agent.kyc.city} />
                  <InfoRow label="Pincode" value={agent.kyc.pincode} />
                  <InfoRow label="Bank (KYC)" value={agent.kyc.bankName} />
                  <InfoRow label="Bank on file" value={agent.kyc.hasBank ? "Yes" : "No"} />
                </div>
              </DetailSection>

              <AgentSettlementBanksCard userId={agent.id} />

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
                        className="rounded-xl border px-4 py-3"
                        style={{ borderColor: B.border, background: B.bg }}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: B.muted }}>
                          {w.walletType === "main"
                            ? "Main"
                            : w.walletType === "aeps"
                              ? "AEPS"
                              : w.walletType}
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums" style={{ color: B.blue }}>
                          ₹{Number(w.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title="Recent Transactions" icon={History}>
                {recentTxns.length === 0 ? (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No transactions yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentTxns.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                        style={{ borderColor: B.border }}
                      >
                        <div className="min-w-0">
                          <div className="font-medium" style={{ color: B.blue }}>
                            {t.serviceName}
                          </div>
                          <div className="font-mono text-xs" style={{ color: B.muted }}>
                            {t.txnRef} · {new Date(t.createdAt).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums" style={{ color: B.blue }}>
                            ₹{Number(t.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                          <Badge status={t.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <div id="commission">
                <AgentCommissionPanel userId={agent.id} />
              </div>
            </div>

            <div className="space-y-6">
              <DetailSection title="Verification" icon={ShieldCheck}>
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
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                    style={{ borderColor: B.border }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: B.blue }}>
                        Fund requests
                      </div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {agent.role === "retailer"
                          ? "Off by default for retailers — turn on when the sales manager asks"
                          : "On by default for Super Distributors and Distributors"}
                      </div>
                    </div>
                    <FundRequestSwitch
                      key={`${agent.id}:${agent.fundRequestEnabled}`}
                      userId={agent.id}
                      name={agent.name}
                      enabled={agent.fundRequestEnabled}
                      showLabel
                      onChange={(enabled) => setAgent((a) => (a ? { ...a, fundRequestEnabled: enabled } : a))}
                    />
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
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
                          className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
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
                    {agent.isFrozen ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setRestriction("none")}
                        className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Unfreeze agent
                      </button>
                    ) : (
                      <p className="text-xs" style={{ color: B.muted }}>
                        Use "Restrict services" below to freeze this account — soft/hard leave
                        login working, freeze does not.
                      </p>
                    )}
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Network Parent" icon={Network}>
                {agent.parent ? (
                  <div className="space-y-3">
                    <InfoRow label="Name" value={agent.parent.name} />
                    <InfoRow label="UID" value={agent.parent.uid} />
                    <InfoRow
                      label="Role"
                      value={
                        agent.parent.role
                          ? ROLE_LABEL[agent.parent.role] ?? agent.parent.role
                          : null
                      }
                    />
                    <Link
                      href={`/users/${agent.parent.id}`}
                      className="inline-block text-sm font-semibold hover:underline"
                      style={{ color: B.blueLight }}
                    >
                      Open parent →
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: B.muted }}>
                    No parent (top-level Super Distributor)
                  </p>
                )}
                {agent.role === "distributor" || agent.role === "retailer" ? (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: B.border }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                      Move in tree
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setMoveOpen(true)}
                      className="admin-btn-primary w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      Change upline
                    </button>
                  </div>
                ) : null}
                {moveOpen && (agent.role === "distributor" || agent.role === "retailer") ? (
                  <MoveAgentModal
                    agents={[{ id: agent.id, name: agent.name, mobile: agent.mobile, role: agent.role }]}
                    onClose={() => setMoveOpen(false)}
                    onMoved={() => void load()}
                  />
                ) : null}

                {agent.role !== "admin" ? (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: B.border }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                      Restrict services
                    </p>
                    <p className="text-xs" style={{ color: B.muted }}>
                      Soft: AePS + money transfer off, bill payments still work. Hard: adds no
                      top-ups. Both keep login, balance and settlement working. Freeze stops
                      everything — confirmed fraud only.
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
                            borderColor:
                              lvl === "freeze" ? B.danger : lvl === "none" ? B.green : B.border,
                            color:
                              lvl === "freeze"
                                ? B.danger
                                : lvl === "none"
                                  ? B.green
                                  : "var(--admin-text)",
                            background: "var(--admin-bg)",
                          }}
                        >
                          {lvl === "none" ? "Lift all" : lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {agent.role === "retailer" ? (
                  <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: B.border }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
                      Reactivate AePS
                    </p>
                    <p className="text-xs" style={{ color: B.muted }}>
                      Clears an AePS block and restarts the dormancy clock. KYC must be verified
                      first.
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
                ) : null}
              </DetailSection>

              <DetailSection title="KYC Documents" icon={Banknote}>
                <KycDocumentGrid
                  documents={agent.documents}
                  documentFiles={agent.documentFiles}
                  checkLabels={agent.docCheckLabels}
                />
              </DetailSection>
            </div>
          </div>
        ) : null}
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
