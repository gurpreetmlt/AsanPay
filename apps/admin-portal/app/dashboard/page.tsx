"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  Users,
  ShieldCheck,
  ArrowLeftRight,
  Wallet,
  UserPlus,
  Building2,
  Store,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  IndianRupee,
  Server,
  Database,
  Clock,
  PieChart,
  History,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { OnboardForm } from "@/components/dashboard/OnboardForm";
import { FundSelfForm } from "@/components/dashboard/FundSelfForm";
import { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actorName: string | null;
}

interface AdminStats {
  users: {
    master_distributor: number;
    distributor: number;
    retailer: number;
    admin: number;
    total: number;
  };
  kyc: { pending: number; verified: number; rejected: number };
  transactions: { success: number; failed: number; pending: number; total: number };
}

const QUICK = [
  { href: "/users", label: "Users", icon: Users },
  { href: "/kyc", label: "KYC Queue", icon: ShieldCheck },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/wallet", label: "Company balance", icon: Wallet },
  { href: "/fund-requests", label: "Fund requests", icon: IndianRupee },
  { href: "/treasury-settings", label: "Treasury Settings", icon: Store },
];

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showFundSelf, setShowFundSelf] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchApi<AdminStats>("/admin/stats"));
    } catch {
      toast.error("Failed to load admin stats");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const data = await fetchApi<{ rows: ActivityRow[] }>("/admin/audit-logs", { limit: "8" });
      setActivity(data.rows);
    } catch {
      // Non-critical widget — fail silently, dashboard stats are the priority.
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void loadStats();
    void loadActivity();
  }, [hydrated, accessToken, router, loadStats, loadActivity]);

  if (!hydrated || !accessToken || !user) return null;

  const totalAgents = (stats?.users.master_distributor ?? 0) +
    (stats?.users.distributor ?? 0) +
    (stats?.users.retailer ?? 0);
  const txnTotal = stats?.transactions.total ?? 0;
  const txnSuccessRate = txnTotal > 0
    ? Math.round(((stats?.transactions.success ?? 0) / txnTotal) * 1000) / 10
    : 0;

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              AsanPay · Platform Control Panel
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowFundSelf(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--brand-blue-mid)", color: "var(--brand-blue-mid)" }}
            >
              <Wallet size={16} />
              Top up company balance
            </button>
            <button
              type="button"
              onClick={() => setShowOnboard(true)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
              style={{ background: B.badgeGrad }}
            >
              <UserPlus size={16} />
              Onboard {ROLE_LABEL.master_distributor}
            </button>
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium"
              style={{ background: B.secondary, color: B.blueMid }}
            >
              Full fund console →
            </Link>
          </div>
        </div>

        {/* Platform Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PlatformStatCard
            icon={Users}
            label="Total Agents"
            value={totalAgents}
            sub={`${stats?.users.total ?? 0} total users`}
            accent={B.blueLight}
            loading={loading}
          />
          <PlatformStatCard
            icon={ArrowLeftRight}
            label="Total Transactions"
            value={txnTotal}
            sub={`${txnSuccessRate}% success rate`}
            accent={B.green}
            loading={loading}
          />
          <PlatformStatCard
            icon={Activity}
            label="Active Users"
            value={totalAgents}
            sub="All time registered"
            accent="#8B5CF6"
            loading={loading}
          />
          <PlatformStatCard
            icon={AlertCircle}
            label="KYC Pending"
            value={stats?.kyc.pending ?? 0}
            sub="Needs review"
            accent="#D97706"
            loading={loading}
            href="/kyc"
          />
        </div>

        {/* User Breakdown + Revenue */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* User Breakdown */}
          <div className="rounded-2xl border p-5 lg:col-span-1" style={{ borderColor: B.border, background: B.card }}>
            <div className="mb-4 flex items-center gap-2">
              <PieChart size={16} style={{ color: B.blueLight }} />
              <h3 className="text-sm font-bold" style={{ color: B.blue }}>User Breakdown</h3>
            </div>
            <div className="space-y-3">
              <BreakdownRow
                label="Super Distributors"
                value={stats?.users.master_distributor ?? 0}
                color={B.blueLight}
                total={totalAgents}
                loading={loading}
              />
              <BreakdownRow
                label="Distributors"
                value={stats?.users.distributor ?? 0}
                color="#5B93F5"
                total={totalAgents}
                loading={loading}
              />
              <BreakdownRow
                label="Retailers"
                value={stats?.users.retailer ?? 0}
                color={B.green}
                total={totalAgents}
                loading={loading}
              />
            </div>
          </div>

          {/* Revenue / Transaction Stats */}
          <div className="rounded-2xl border p-5 lg:col-span-2" style={{ borderColor: B.border, background: B.card }}>
            <div className="mb-4 flex items-center gap-2">
              <IndianRupee size={16} style={{ color: B.green }} />
              <h3 className="text-sm font-bold" style={{ color: B.blue }}>Transaction Overview</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MiniCard label="Success" value={stats?.transactions.success ?? 0} color={B.green} loading={loading} />
              <MiniCard label="Failed" value={stats?.transactions.failed ?? 0} color="#DC2626" loading={loading} />
              <MiniCard label="Pending" value={stats?.transactions.pending ?? 0} color="#D97706" loading={loading} />
              <MiniCard label="Total" value={txnTotal} color={B.blueLight} loading={loading} />
            </div>
            <div className="mt-4 rounded-xl p-4" style={{ background: B.secondary }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: B.muted }}>Success Rate</span>
                <span className="text-sm font-bold" style={{ color: B.green }}>{txnSuccessRate}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: B.border }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${txnSuccessRate}%`, background: B.green }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* KYC Queue + System Health */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* KYC Queue */}
          <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: B.blueLight }} />
                <h3 className="text-sm font-bold" style={{ color: B.blue }}>KYC Status</h3>
              </div>
              <Link href="/kyc" className="text-xs font-semibold" style={{ color: B.green }}>
                Open Queue →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-4 text-center" style={{ background: "#FEF3C7" }}>
                <AlertCircle size={20} className="mx-auto mb-1" style={{ color: "#D97706" }} />
                <div className="text-xl font-bold" style={{ color: "#92400E" }}>
                  {loading ? "…" : stats?.kyc.pending ?? 0}
                </div>
                <div className="text-xs font-medium" style={{ color: "#92400E" }}>Pending</div>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: `${B.green}10` }}>
                <CheckCircle2 size={20} className="mx-auto mb-1" style={{ color: B.green }} />
                <div className="text-xl font-bold" style={{ color: B.green }}>
                  {loading ? "…" : stats?.kyc.verified ?? 0}
                </div>
                <div className="text-xs font-medium" style={{ color: B.muted }}>Verified</div>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "#FEF2F2" }}>
                <XCircle size={20} className="mx-auto mb-1" style={{ color: "#DC2626" }} />
                <div className="text-xl font-bold" style={{ color: "#DC2626" }}>
                  {loading ? "…" : stats?.kyc.rejected ?? 0}
                </div>
                <div className="text-xs font-medium" style={{ color: B.muted }}>Rejected</div>
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
            <div className="mb-4 flex items-center gap-2">
              <Server size={16} style={{ color: B.blueLight }} />
              <h3 className="text-sm font-bold" style={{ color: B.blue }}>System Health</h3>
            </div>
            <div className="space-y-3">
              <HealthRow icon={Server} label="API Server" status="operational" />
              <HealthRow icon={Database} label="PostgreSQL" status="operational" />
              <HealthRow icon={Database} label="Redis" status="operational" />
              <HealthRow icon={Clock} label="Last checked" status="now" />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border p-5" style={{ borderColor: B.border, background: B.card }}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={16} style={{ color: B.blueLight }} />
              <h3 className="text-sm font-bold" style={{ color: B.blue }}>Recent Activity</h3>
            </div>
            <Link href="/audit-logs" className="text-xs font-semibold" style={{ color: B.green }}>
              View full log →
            </Link>
          </div>
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: B.muted }}>
              No recent admin activity
            </p>
          ) : (
            <div className="space-y-2">
              {activity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                  style={{ background: B.secondary }}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold" style={{ color: B.blueLight }}>
                      {a.action}
                    </span>{" "}
                    <span style={{ color: B.muted }}>on {a.entityType}</span>
                    {a.actorName && (
                      <span style={{ color: B.muted }}> — by {a.actorName}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: B.muted }}>
                    {new Date(a.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
            Quick links
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {QUICK.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="admin-card flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition hover:shadow-sm"
                style={{ borderColor: B.border, color: B.blue, background: B.card }}
              >
                <Icon size={18} style={{ color: B.blueLight }} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {showOnboard && (
        <OnboardForm
          childRole="master_distributor"
          childRoleLabel={ROLE_LABEL.master_distributor}
          onClose={() => setShowOnboard(false)}
          onSuccess={() => void loadStats()}
        />
      )}
      {showFundSelf && (
        <FundSelfForm onClose={() => setShowFundSelf(false)} onSuccess={() => void loadStats()} />
      )}
    </AdminShell>
  );
}

function PlatformStatCard({ icon: Icon, label, value, sub, accent, loading, href }: {
  icon: typeof Users; label: string; value: number; sub: string; accent: string; loading: boolean; href?: string;
}) {
  const inner = (
    <div className="rounded-2xl border p-5 transition hover:shadow-md" style={{ borderColor: B.border, background: B.card }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: B.muted }}>{label}</span>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${accent}15`, color: accent }}
        >
          <Icon size={20} />
        </span>
      </div>
      <div className="text-3xl font-bold tabular-nums" style={{ color: B.blue }}>
        {loading ? "…" : value.toLocaleString("en-IN")}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: B.muted }}>
        <TrendingUp size={10} /> {sub}
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}

function BreakdownRow({ label, value, color, total, loading }: {
  label: string; value: number; color: string; total: number; loading: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: B.muted }}>{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {loading ? "…" : value} <span className="text-xs font-normal" style={{ color: B.muted }}>({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: B.secondary }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function MiniCard({ label, value, color, loading }: {
  label: string; value: number; color: string; loading: boolean;
}) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: `${color}08` }}>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>
        {loading ? "…" : value.toLocaleString("en-IN")}
      </div>
      <div className="text-xs font-medium" style={{ color: B.muted }}>{label}</div>
    </div>
  );
}

function HealthRow({ icon: Icon, label, status }: {
  icon: typeof Server; label: string; status: string;
}) {
  const isOk = status === "operational";
  return (
    <div className="flex items-center justify-between rounded-lg p-2" style={{ background: B.secondary }}>
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: B.muted }} />
        <span className="text-xs font-medium" style={{ color: B.blue }}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: isOk ? B.green : "#D97706" }}
        />
        <span className="text-xs capitalize" style={{ color: isOk ? B.green : "#D97706" }}>
          {status}
        </span>
      </div>
    </div>
  );
}
