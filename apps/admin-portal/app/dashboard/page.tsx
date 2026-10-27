"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  BadgePercent,
  CheckCircle2,
  Database,
  FileWarning,
  Hourglass,
  IdCard,
  IndianRupee,
  Landmark,
  LifeBuoy,
  PieChart,
  Receipt,
  Server,
  ShieldAlert,
  ShieldCheck,
  History,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { useAdminAlerts } from "@/components/layout/AdminAlertsProvider";
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
  users: { super_distributor: number; distributor: number; retailer: number; admin: number; total: number };
  kyc: { pending: number; verified: number; rejected: number };
  transactions: { success: number; failed: number; pending: number; total: number };
}

interface ProviderWallet {
  status: "ok" | "unsupported" | "error";
  balance: string | null;
  message: string | null;
  checkedAt: string;
}

type DayMoney = {
  txnCount: number;
  successCount: number;
  failedCount: number;
  volume: string;
  feeIncome: string;
  feeGst: string;
  commissionGross: string;
  commissionNet: string;
  commissionTds: string;
};

interface DashboardSummary {
  at: string;
  today: DayMoney;
  yesterday: DayMoney;
  queues: { stuckTxns: number; openDisputes: number };
  commission: { servicesLosing: number; servicesMissingRole: number } | null;
  health: {
    api: "ok";
    database: { status: "ok" | "down"; latencyMs: number | null };
    redis: "ok" | "down" | "off";
  };
}

const POLL_MS = 60_000;

function inr(v: string | number): string {
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken || !user) return null;

  return (
    <AdminShell>
      <DashboardBody />
    </AdminShell>
  );
}

/** Rendered inside AdminShell so it can read the shared alert badges. */
function DashboardBody() {
  const { badges, loading: badgesLoading } = useAdminAlerts();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [providerWallet, setProviderWallet] = useState<ProviderWallet | null>(null);
  const [showOnboard, setShowOnboard] = useState(false);
  const [showFundSelf, setShowFundSelf] = useState(false);

  const loadAll = useCallback(async () => {
    const [s, sum, act, pw] = await Promise.allSettled([
      fetchApi<AdminStats>("/admin/stats"),
      fetchApi<DashboardSummary>("/admin/dashboard"),
      fetchApi<{ rows: ActivityRow[] }>("/admin/audit-logs", { limit: "8" }),
      fetchApi<ProviderWallet>("/admin/provider-wallet"),
    ]);
    if (s.status === "fulfilled") setStats(s.value);
    if (sum.status === "fulfilled") {
      setSummary(sum.value);
      setSummaryError(false);
    } else {
      setSummaryError(true);
    }
    if (act.status === "fulfilled") setActivity(act.value.rows);
    setProviderWallet(
      pw.status === "fulfilled"
        ? pw.value
        : { status: "error", balance: null, message: "Could not load the provider wallet balance", checkedAt: new Date().toISOString() },
    );
  }, []);

  useEffect(() => {
    void loadAll();
    const t = setInterval(() => void loadAll(), POLL_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  const q = summary?.queues;
  const c = summary?.commission;
  const actions: ActionTile[] = [
    { label: "Fund requests", count: badges.fundRequestsPending, href: "/treasury/bank?tab=fund-requests", icon: IndianRupee },
    { label: "KYC to review", count: badges.kycPending, href: "/kyc", icon: ShieldCheck },
    { label: "Agent banks to verify", count: badges.settlementBanksPending, href: "/settlements", icon: Landmark },
    { label: "Open support tickets", count: badges.supportTicketsOpen, href: "/support-tickets", icon: LifeBuoy },
    { label: "Open disputes", count: q?.openDisputes ?? null, href: "/disputes", icon: ShieldAlert },
    { label: "Stuck txns (30 min+)", count: q?.stuckTxns ?? null, href: "/recovery-workbench", icon: Hourglass },
    { label: "PAN missing (TDS)", count: badges.panGapCount ?? 0, href: "/tax-commission/pan-gaps", icon: IdCard },
    { label: "Services losing money", count: c ? c.servicesLosing : null, href: "/tax-commission/rate-card?view=loss", icon: AlertTriangle, danger: true },
    { label: "Services with a role on ₹0", count: c ? c.servicesMissingRole : null, href: "/tax-commission/rate-card?view=loss", icon: FileWarning },
  ];
  const pending = actions.filter((a) => (a.count ?? 0) > 0);
  const loadingQueues = badgesLoading && !summary;

  const t = summary?.today;
  const y = summary?.yesterday;
  const successRate = t && t.txnCount > 0 ? Math.round((t.successCount / t.txnCount) * 1000) / 10 : null;
  const totalAgents = (stats?.users.super_distributor ?? 0) + (stats?.users.distributor ?? 0) + (stats?.users.retailer ?? 0);

  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Admin Dashboard
            </h1>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              What needs action, today&apos;s money and system health. Refreshes every minute.
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
              Onboard {ROLE_LABEL.super_distributor}
            </button>
          </div>
        </div>

        {/* Needs action */}
        <Section
          icon={<Zap size={16} style={{ color: "#D97706" }} />}
          title="Needs action"
          right={
            !loadingQueues ? (
              <span className="text-xs font-semibold" style={{ color: pending.length ? "#B45309" : B.greenDark }}>
                {pending.length ? `${pending.length} item${pending.length === 1 ? "" : "s"} waiting` : "All clear"}
              </span>
            ) : null
          }
        >
          {summaryError ? (
            <p className="mb-3 text-xs font-semibold" style={{ color: B.danger }}>
              Disputes, stuck txns and commission checks could not load. The other counts are live.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {actions.map((a) => (
              <ActionCard key={a.label} tile={a} loading={a.count === null && !summaryError} />
            ))}
          </div>
        </Section>

        {/* Today */}
        <Section
          icon={<IndianRupee size={16} style={{ color: B.green }} />}
          title="Today"
          right={
            <span className="text-xs" style={{ color: B.muted }}>
              vs same time yesterday · IST
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MoneyCard
              icon={ArrowLeftRight}
              label="Transactions"
              value={t ? t.txnCount.toLocaleString("en-IN") : "…"}
              sub={t ? `${successRate ?? 0}% success · ${t.failedCount} failed` : ""}
              now={t?.txnCount}
              before={y?.txnCount}
            />
            <MoneyCard icon={Wallet} label="Success volume" value={t ? inr(t.volume) : "…"} now={t ? Number(t.volume) : undefined} before={y ? Number(y.volume) : undefined} />
            <MoneyCard
              icon={IndianRupee}
              label="Fee income (excl. GST)"
              value={t ? inr(t.feeIncome) : "…"}
              now={t ? Number(t.feeIncome) : undefined}
              before={y ? Number(y.feeIncome) : undefined}
            />
            <MoneyCard
              icon={BadgePercent}
              label="Commission paid (net)"
              value={t ? inr(t.commissionNet) : "…"}
              sub={t ? `Gross ${inr(t.commissionGross)} · TDS ${inr(t.commissionTds)}` : ""}
              now={t ? Number(t.commissionNet) : undefined}
              before={y ? Number(y.commissionNet) : undefined}
              lowerIsBetter
            />
            <MoneyCard
              icon={Receipt}
              label="GST on fees"
              value={t ? inr(t.feeGst) : "…"}
              sub="Owed to government"
              now={t ? Number(t.feeGst) : undefined}
              before={y ? Number(y.feeGst) : undefined}
            />
          </div>
        </Section>

        {/* Provider + health + agents */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Link href="/treasury" className="block">
            <Section icon={<Wallet size={16} style={{ color: B.green }} />} title="Provider wallet" className="h-full">
              <p className="text-3xl font-bold tabular-nums" style={{ color: providerWallet?.status === "error" ? B.danger : B.blue }}>
                {providerWallet?.status === "ok" && providerWallet.balance != null ? inr(providerWallet.balance) : providerWallet ? "—" : "…"}
              </p>
              <p className="mt-1 text-xs" style={{ color: B.muted }}>
                {providerWallet?.status === "ok"
                  ? `Live · checked ${new Date(providerWallet.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                  : providerWallet?.status === "unsupported"
                    ? "Live balance not available for this provider"
                    : (providerWallet?.message ?? "Live balance with the service provider")}
              </p>
            </Section>
          </Link>

          <Section icon={<Server size={16} style={{ color: B.blueLight }} />} title="System health">
            <div className="space-y-2">
              <HealthRow icon={Server} label="API server" state={summary ? "ok" : summaryError ? "down" : "loading"} />
              <HealthRow
                icon={Database}
                label="PostgreSQL"
                state={summary ? summary.health.database.status : summaryError ? "unknown" : "loading"}
                detail={summary?.health.database.latencyMs != null ? `${summary.health.database.latencyMs} ms` : undefined}
              />
              <HealthRow
                icon={Database}
                label="Redis cache"
                state={summary ? (summary.health.redis === "off" ? "off" : summary.health.redis) : summaryError ? "unknown" : "loading"}
                detail={summary?.health.redis === "off" ? "Not configured (optional)" : undefined}
              />
            </div>
          </Section>

          <Section
            icon={<PieChart size={16} style={{ color: B.blueLight }} />}
            title="Agents"
            right={
              <Link href="/users" className="text-xs font-semibold" style={{ color: B.green }}>
                All agents →
              </Link>
            }
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: B.blue }}>
              {stats ? totalAgents.toLocaleString("en-IN") : "…"}
            </p>
            <div className="mt-3 space-y-2.5">
              <BreakdownRow label="Super Distributors" value={stats?.users.super_distributor ?? 0} color={B.blueLight} total={totalAgents} />
              <BreakdownRow label="Distributors" value={stats?.users.distributor ?? 0} color="#5B93F5" total={totalAgents} />
              <BreakdownRow label="Retailers" value={stats?.users.retailer ?? 0} color={B.green} total={totalAgents} />
            </div>
            {stats ? (
              <p className="mt-3 text-[11px]" style={{ color: B.muted }}>
                All time: {stats.transactions.total.toLocaleString("en-IN")} txns ·{" "}
                {stats.transactions.total > 0
                  ? `${Math.round((stats.transactions.success / stats.transactions.total) * 1000) / 10}% success`
                  : "no txns yet"}
              </p>
            ) : null}
          </Section>
        </div>

        {/* Recent activity */}
        <Section
          icon={<History size={16} style={{ color: B.blueLight }} />}
          title="Recent admin activity"
          right={
            <Link href="/audit-logs" className="text-xs font-semibold" style={{ color: B.green }}>
              View full log →
            </Link>
          }
        >
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: B.muted }}>
              No recent admin activity
            </p>
          ) : (
            <div className="space-y-2">
              {activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: B.secondary }}>
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold" style={{ color: B.blueLight }}>
                      {a.action}
                    </span>{" "}
                    <span style={{ color: B.muted }}>on {a.entityType}</span>
                    {a.actorName && <span style={{ color: B.muted }}> — by {a.actorName}</span>}
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: B.muted }}>
                    {new Date(a.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {showOnboard && (
        <OnboardForm
          childRole="super_distributor"
          childRoleLabel={ROLE_LABEL.super_distributor}
          onClose={() => setShowOnboard(false)}
          onSuccess={() => void loadAll()}
        />
      )}
      {showFundSelf && <FundSelfForm onClose={() => setShowFundSelf(false)} onSuccess={() => void loadAll()} />}
    </>
  );
}

type ActionTile = {
  label: string;
  count: number | null;
  href: string;
  icon: typeof Zap;
  danger?: boolean;
};

function Section({
  icon,
  title,
  right,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border p-5 ${className}`} style={{ borderColor: B.border, background: B.card }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-bold" style={{ color: B.blue }}>
            {title}
          </h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function ActionCard({ tile, loading }: { tile: ActionTile; loading: boolean }) {
  const { label, count, href, icon: Icon, danger } = tile;
  const active = (count ?? 0) > 0;
  const tone = !active ? B.greenDark : danger ? B.danger : "#B45309";
  const bg = !active ? "rgba(18,183,106,0.06)" : danger ? "#FEF2F2" : "#FFF7ED";
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border px-3 py-3 transition hover:-translate-y-px hover:shadow-sm"
      style={{ borderColor: active ? (danger ? "#FCA5A5" : "#FDBA74") : B.border, background: bg }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--admin-card)", color: tone }}>
        {active ? <Icon size={18} /> : <CheckCircle2 size={18} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold tabular-nums leading-tight" style={{ color: tone }}>
          {loading ? "…" : count == null ? "—" : count.toLocaleString("en-IN")}
        </span>
        <span className="block truncate text-xs font-medium" style={{ color: B.muted }}>
          {label}
        </span>
      </span>
    </Link>
  );
}

function MoneyCard({
  icon: Icon,
  label,
  value,
  sub,
  now,
  before,
  lowerIsBetter = false,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sub?: string;
  now?: number;
  before?: number;
  lowerIsBetter?: boolean;
}) {
  let delta: ReactNode = null;
  if (now != null && before != null) {
    if (before === 0) {
      delta = now > 0 ? <span style={{ color: B.muted }}>No data yesterday</span> : <span style={{ color: B.muted }}>Same as yesterday</span>;
    } else {
      const pct = Math.round(((now - before) / before) * 1000) / 10;
      const up = pct >= 0;
      const good = lowerIsBetter ? !up : up;
      const Arrow = up ? ArrowUpRight : ArrowDownRight;
      delta = (
        <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: pct === 0 ? B.muted : good ? B.greenDark : B.danger }}>
          <Arrow size={12} /> {Math.abs(pct)}% vs yesterday
        </span>
      );
    }
  }
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: B.border, background: "var(--admin-secondary)" }}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: B.muted }}>
        <Icon size={14} /> {label}
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: B.blue }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[11px]" style={{ color: B.muted }}>
          {sub}
        </p>
      ) : null}
      {delta ? <p className="mt-1 text-[11px]">{delta}</p> : null}
    </div>
  );
}

function BreakdownRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: B.muted }}>
          {label}
        </span>
        <span className="text-sm font-bold" style={{ color }}>
          {value} <span className="text-xs font-normal" style={{ color: B.muted }}>({pct}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: B.secondary }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function HealthRow({
  icon: Icon,
  label,
  state,
  detail,
}: {
  icon: typeof Server;
  label: string;
  state: "ok" | "down" | "off" | "unknown" | "loading";
  detail?: string;
}) {
  const view = {
    ok: { color: B.green, text: "Operational" },
    down: { color: B.danger, text: "Down" },
    off: { color: "var(--admin-muted)", text: "Off" },
    unknown: { color: "#D97706", text: "Unknown" },
    loading: { color: "var(--admin-muted)", text: "Checking…" },
  }[state];
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: B.secondary }}>
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: B.muted }} />
        <span className="text-xs font-medium" style={{ color: B.blue }}>
          {label}
        </span>
        {detail ? (
          <span className="text-[11px]" style={{ color: B.muted }}>
            · {detail}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: view.color }} />
        <span className="text-xs font-semibold" style={{ color: view.color }}>
          {view.text}
        </span>
      </div>
    </div>
  );
}
