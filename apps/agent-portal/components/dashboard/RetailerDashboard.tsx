"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  ChevronRight,
  Wallet,
  Activity,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  Bell,
  ShieldCheck,
  PlusCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { maskBalance, useBalanceVisibility } from "@/lib/balanceVisibility";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ServiceCards } from "@/components/services/ServiceCards";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import type { TxnRow, WalletBalance } from "@/lib/types";

interface RetailerStats {
  role: "retailer";
  today: {
    txnCount: number;
    volume: string;
    successRate: number;
    commissionEarned: string;
  };
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function badgeStatus(status: string) {
  if (status === "success") return "success" as const;
  if (status === "pending" || status === "initiated") return "pending" as const;
  return "failed" as const;
}

export function RetailerDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = roleFromUserRole(user?.role);

  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [recent, setRecent] = useState<TxnRow[]>([]);
  const [stats, setStats] = useState<RetailerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const balanceVisible = useBalanceVisibility((s) => s.visible);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [walletRows, txns, dashStats] = await Promise.all([
          fetchApi<WalletBalance[]>("/wallet/me"),
          fetchApi<TxnRow[]>("/txn", { limit: 5 }),
          fetchApi<RetailerStats>("/dashboard/stats"),
        ]);
        if (!alive) return;
        setWallets(walletRows);
        setRecent(txns);
        setStats(dashStats);
      } catch (err: unknown) {
        if (alive) toast.error("Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const orderedWallets = [...wallets].sort((a, b) => {
    if (a.walletType === "main") return -1;
    if (b.walletType === "main") return 1;
    return a.walletType.localeCompare(b.walletType);
  });
  const primary = orderedWallets[0];
  const secondary = orderedWallets[1];
  const totalPending = wallets.reduce(
    (s, w) => s + (parseFloat(w.pendingBalance ?? "0") || 0), 0,
  );

  const kycDone = user?.kycStatus === "verified";

  return (
    <div className="dash-page-stagger space-y-4">
      {/* Wallet Summary */}
      <div className="dash-stagger grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Main Wallet */}
        <div
          className="dash-card-hover relative overflow-hidden rounded-2xl p-3.5 text-white"
          style={{ background: role.gradient, boxShadow: `0 2px 10px ${role.color}22` }}
        >
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/70">
            <Wallet size={12} />
            {primary ? walletDisplayName(primary.walletType) : "Main"}
          </div>
          <div className="mb-2 text-2xl font-bold leading-none tracking-tight">
            {loading ? "…" : maskBalance(balanceVisible, formatInr(primary?.balance ?? "0"))}
          </div>
          <div className="relative z-10 mb-2 flex items-center gap-1.5 border-t border-white/15 pt-2">
            <TrendingUp size={11} style={{ color: B.greenLight }} />
            <span className="text-[11px] font-semibold" style={{ color: B.greenLight }}>
              Today: {balanceVisible ? formatInr(stats?.today.commissionEarned ?? "0") : "••••"} earned
            </span>
          </div>
          <div className="relative z-10">
            <PrimaryButton
              type="button"
              variant="success"
              onClick={() => router.push("/fund-request")}
              size="sm"
              showArrow={false}
              className="btn-pill--wallet-cta !w-auto"
            >
              <PlusCircle size={14} />
              Add Money
            </PrimaryButton>
          </div>
        </div>

        {/* AEPS Wallet */}
        {secondary && (
          <div
            className="dash-card-hover relative overflow-hidden rounded-2xl p-3.5 text-white"
            style={{ background: B.green, boxShadow: `0 2px 10px ${B.green}22` }}
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/70">
              <Wallet size={12} />
              {walletDisplayName(secondary.walletType)}
            </div>
            <div className="mb-2 text-2xl font-bold leading-none tracking-tight">
              {loading ? "…" : maskBalance(balanceVisible, formatInr(secondary.balance))}
            </div>
            <div className="mb-2 flex items-center gap-1.5 border-t border-white/15 pt-2">
              <Activity size={11} className="text-white/80" />
              <span className="text-[11px] text-white/90">
                Pending: {balanceVisible ? formatInr(totalPending) : "••••"}
              </span>
            </div>
            <p className="rounded-xl bg-white/15 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-snug text-white/95">
              Credits from AePS cash-out only — no Add Money here
            </p>
          </div>
        )}


        {/* Today's Stats Cards */}
        <StatCard
          icon={<Activity size={18} />}
          label="Transactions"
          value={loading ? "…" : String(stats?.today.txnCount ?? 0)}
          sub={`${formatInr(stats?.today.volume ?? "0")} volume`}
          accent={B.blue}
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Success Rate"
          value={loading ? "…" : `${stats?.today.successRate ?? 0}%`}
          sub={Number(stats?.today.successRate ?? 0) >= 90 ? "Excellent" : "Track carefully"}
          accent={B.green}
        />
      </div>

      {/* Quick Services */}
      <ServiceCards title="Quick Services" />

      {/* Today's Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Txns Today" value={String(stats?.today.txnCount ?? 0)} />
        <MiniStat label="Volume" value={formatInr(stats?.today.volume ?? "0")} />
        <MiniStat label="Success" value={`${stats?.today.successRate ?? 0}%`} />
        <MiniStat label="Commission" value={formatInr(stats?.today.commissionEarned ?? "0")} highlight />
      </div>

      {/* Announcements + KYC row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Announcements */}
        <div className="ui-card dash-card-hover p-5">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Bell size={16} /> Notices & Announcements
              </span>
            }
            subtitle="Updates from AsanPay"
          />
          <EmptyState
            icon={<Bell size={22} strokeWidth={1.75} />}
            title="No announcements"
            description="Nothing new right now. Check back later."
            className="!py-4"
          />
        </div>

        {/* KYC Status */}
        <div className="ui-card dash-card-hover p-5">
          <SectionHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: kycDone ? B.green : "#D97706" }} />
                KYC Status
              </span>
            }
            subtitle={kycDone ? "Verified" : "Action may be required"}
          />

          {kycDone ? (
            <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: `${B.blue}10` }}>
              <CheckCircle2 size={24} style={{ color: B.blue }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: B.blue }}>Verified</p>
                <p className="text-xs" style={{ color: B.muted }}>Your KYC is complete. All services active.</p>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: user?.kycStatus === "rejected"
                  ? "#FEF2F2"
                  : user?.hasKycDocs
                    ? "#F0FDF4"
                    : "#FFF7ED",
              }}
            >
              <AlertTriangle
                size={24}
                style={{
                  color: user?.kycStatus === "rejected"
                    ? "#DC2626"
                    : user?.hasKycDocs
                      ? "#16A34A"
                      : "#EA580C",
                }}
              />
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{
                    color: user?.kycStatus === "rejected"
                      ? "#991B1B"
                      : user?.hasKycDocs
                        ? "#14532D"
                        : "#9A3412",
                  }}
                >
                  {user?.hasKycDocs
                    ? user?.kycStatus === "rejected"
                      ? "KYC Rejected"
                      : "Pending Verification"
                    : "KYC Incomplete"}
                </p>
                <p
                  className="text-xs"
                  style={{
                    color: user?.kycStatus === "rejected"
                      ? "#B91C1C"
                      : user?.hasKycDocs
                        ? "#15803D"
                        : "#C2410C",
                  }}
                >
                  {user?.hasKycDocs
                    ? "Services unlock after admin approval."
                    : "Complete signup KYC to submit for approval."}
                </p>
                {!user?.hasKycDocs || user?.kycStatus === "rejected" ? (
                  <PrimaryButton
                    type="button"
                    variant="primary"
                    size="sm"
                    showArrow={false}
                    className="mt-3 !w-auto"
                    onClick={() => router.push("/signup")}
                  >
                    Complete KYC
                  </PrimaryButton>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="ui-card dash-card-hover p-5">
        <SectionHeader
          title="Recent Transactions"
          subtitle="Latest activity on your account"
          action={
            <PrimaryButton
              type="button"
              variant="ghost"
              size="sm"
              showArrow={false}
              className="!w-auto"
              onClick={() => router.push("/transactions")}
            >
              View all <ChevronRight size={12} />
            </PrimaryButton>
          }
        />
        {loading && recent.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: B.muted }}>Loading…</p>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<IndianRupee size={22} strokeWidth={1.75} />}
            title="No transactions yet"
            description="Your recent transfers and AePS activity will show up here."
            action={
              <PrimaryButton
                type="button"
                variant="secondary"
                size="sm"
                showArrow={false}
                className="!w-auto"
                onClick={() => router.push("/transactions")}
              >
                Open transactions
              </PrimaryButton>
            }
          />
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-slate-50"
                style={{ background: B.secondary }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: `${B.blue}12` }}
                  >
                    <IndianRupee size={16} style={{ color: B.blue }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: B.blue }}>{t.serviceName}</p>
                    <p className="text-xs" style={{ color: B.muted }}>{timeAgo(t.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: B.blue }}>{formatInr(t.amount)}</span>
                  <StatusBadge status={badgeStatus(t.status)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string; accent: string;
}) {
  return (
    <div className="ui-card dash-card-hover p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: B.muted }}>{label}</span>
      </div>
      <div className="text-xl font-bold leading-tight" style={{ color: B.blue }}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium" style={{ color: B.muted }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl border p-4 text-center"
      style={{ borderColor: highlight ? B.green : B.border, background: highlight ? `${B.green}08` : "white" }}
    >
      <div className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color: highlight ? B.green : B.blue }}>{value}</div>
    </div>
  );
}
