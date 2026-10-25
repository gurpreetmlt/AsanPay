"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Wallet,
  Activity,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  Bell,
  ShieldCheck,
  PlusCircle,
  Share2,
  RotateCcw,
  LifeBuoy,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { fetchApi } from "@/lib/api";
import { B, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { maskBalance, useBalanceVisibility } from "@/lib/balanceVisibility";
import { useHomeWalletPins } from "@/lib/homeWalletPins";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ServiceCards } from "@/components/services/ServiceCards";
import { TodayEarningsChip } from "@/components/dashboard/TodayEarningsChip";
import { PanMissingBanner } from "@/components/dashboard/PanMissingBanner";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import type { TxnRow, WalletBalance } from "@/lib/types";

interface RetailerStats {
  role: "retailer";
  today: {
    txnCount: number;
    volume: string;
    successRate: number;
    commissionEarned: string;
    commissionGross?: string;
    commissionTds?: string;
  };
  todayCommissionGross?: string;
  todayCommissionTds?: string;
}

const AEPS_TAB_MAP: Record<string, string> = {
  CASH_WITHDRAW: "Withdraw",
  MINI_STATEMENT: "Mini Statement",
  CASH_DEPOSIT: "Deposit",
  BALANCE_ENQUIRY: "Balance Enquiry",
  AADHAAR_PAY: "Withdraw",
};

function resolveServiceRoute(code: string): string | null {
  const aepsTab = AEPS_TAB_MAP[code];
  if (aepsTab) return `/aeps?tab=${encodeURIComponent(aepsTab)}`;
  if (code === "UPI_CASH_POINT" || code === "UPI_QR" || code === "UPIQR") return "/upi-cash-point";
  if (["CASH_COLLECTION", "AGENT_COLLECTION", "CMS", "AIRTEL_CMS"].includes(code)) return "/cms";
  if (code === "MONEY_TRANSFER" || code === "DMT") return "/dmt";
  if (code === "NEPAL" || code === "NEPAL_REMITTANCE") return "/nepal";
  if (code === "MOBILE_PREPAID") return "/recharge?service=MOBILE_PREPAID";
  if (code === "DTH") return "/recharge?service=DTH";
  return null;
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

function openPrintableReceipt(t: TxnRow) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>AsanPay receipt</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a;max-width:420px;margin:0 auto}
  h1{font-size:18px;margin:0 0 4px} .muted{color:#64748b;font-size:12px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px}
  .amt{font-size:22px;font-weight:700;margin:16px 0}
  @media print{button{display:none}}
</style></head><body>
  <h1>AsanPay receipt</h1>
  <p class="muted">${new Date(t.createdAt).toLocaleString("en-IN")}</p>
  <div class="amt">${formatInr(t.amount)}</div>
  <div class="row"><span>Service</span><strong>${t.serviceName}</strong></div>
  <div class="row"><span>Status</span><strong>${t.status}</strong></div>
  ${t.txnRef ? `<div class="row"><span>Ref</span><strong>${t.txnRef}</strong></div>` : ""}
  <p class="muted" style="margin-top:24px">Thank you for using AsanPay.</p>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Print / Save PDF</button>
  <script>setTimeout(function(){window.print()},400)</script>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  const pinMain = useHomeWalletPins((s) => s.pins.main);
  const pinAeps = useHomeWalletPins((s) => s.pins.aeps);

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
      } catch {
        if (alive) toast.error("Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const mainWallet = wallets.find((w) => w.walletType === "main");
  const aepsWallet = wallets.find((w) => w.walletType === "aeps");
  const totalPending = wallets.reduce(
    (s, w) => s + (parseFloat(w.pendingBalance ?? "0") || 0), 0,
  );

  const kycDone = user?.kycStatus === "verified";
  const todayEarn = stats?.today.commissionEarned ?? "0";

  function shareReceipt(t: TxnRow) {
    const lines = [
      "AsanPay receipt",
      `Service: ${t.serviceName}`,
      `Amount: ${formatInr(t.amount)}`,
      `Status: ${t.status}`,
      `When: ${new Date(t.createdAt).toLocaleString("en-IN")}`,
      t.txnRef ? `Ref: ${t.txnRef}` : null,
    ].filter(Boolean);
    const text = lines.join("\n");
    openPrintableReceipt(t);
    void (async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: "AsanPay receipt", text });
          return;
        }
      } catch {
        /* fall through to copy */
      }
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Receipt opened · text copied");
      } catch {
        toast.success("Printable receipt opened");
      }
    })();
  }

  function retryOrSupport(t: TxnRow) {
    const route = resolveServiceRoute(t.serviceCode);
    if (route) {
      router.push(route);
      return;
    }
    router.push("/support");
  }

  return (
    <div className="dash-page-stagger space-y-4">
      <TodayEarningsChip
        net={todayEarn}
        gross={stats?.todayCommissionGross ?? stats?.today.commissionGross}
        tds={stats?.todayCommissionTds ?? stats?.today.commissionTds}
        loading={loading}
        onReport={() => {
          const d = new Date();
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          router.push(`/earnings?from=${ymd}&to=${ymd}`);
        }}
      />
      <PanMissingBanner />

      {/* Wallet cards pinned from Settings → Home page (off by default) */}
      {pinMain || (pinAeps && aepsWallet) ? (
          <div className="dash-stagger grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
            {pinMain ? (
            <div
              className="dash-card-hover relative flex h-full min-h-[108px] flex-col overflow-hidden rounded-xl p-3.5 text-white"
              style={{ background: role.gradient, boxShadow: `0 2px 10px ${role.color}22` }}
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/70">
                <Wallet size={12} />
                {walletDisplayName("main")}
              </div>
              <div className="mb-2.5 text-2xl font-bold leading-none tracking-tight">
                {loading ? "…" : maskBalance(balanceVisible, formatInr(mainWallet?.balance ?? "0"))}
              </div>
              <div className="mt-auto flex min-h-[28px] items-center gap-1.5 border-t border-white/15 pt-2">
                <Activity size={11} className="text-white/80" />
                <span className="text-[11px] text-white/90">Ready to use</span>
              </div>
            </div>
            ) : null}

            {pinAeps && aepsWallet ? (
              <div
                className="dash-card-hover relative flex h-full min-h-[108px] flex-col overflow-hidden rounded-xl p-3.5 text-white"
                style={{ background: B.green, boxShadow: `0 2px 10px ${B.green}22` }}
              >
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white opacity-10" />
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/70">
                  <Wallet size={12} />
                  {walletDisplayName(aepsWallet.walletType)}
                </div>
                <div className="mb-2.5 text-2xl font-bold leading-none tracking-tight">
                  {loading ? "…" : maskBalance(balanceVisible, formatInr(aepsWallet.balance))}
                </div>
                <div className="mt-auto flex min-h-[28px] items-center gap-1.5 border-t border-white/15 pt-2">
                  <Activity size={11} className="text-white/80" />
                  <span className="text-[11px] text-white/90">
                    Pending: {balanceVisible ? formatInr(totalPending) : "••••"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
      ) : null}

      {/* All services — favourites pin removed from home */}
      <ServiceCards title="All Services" enableFavorites={false} />

      {/* Today's Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Txns Today" value={String(stats?.today.txnCount ?? 0)} />
        <MiniStat label="Volume" value={formatInr(stats?.today.volume ?? "0")} />
        <MiniStat label="Success" value={`${stats?.today.successRate ?? 0}%`} />
        <MiniStat
          label="Commission"
          value={formatInr(todayEarn)}
          highlight
        />
      </div>
      <p className="text-center text-[11px]" style={{ color: B.muted }}>
        Daily detail is on{" "}
        <button
          type="button"
          className="font-semibold underline"
          style={{ color: B.blue }}
          onClick={() => router.push("/earnings")}
        >
          My Earnings
        </button>
        {" · "}
        <button
          type="button"
          className="font-semibold underline"
          style={{ color: B.blue }}
          onClick={() => router.push("/reports")}
        >
          Business Report
        </button>
      </p>

      {/* Announcements + KYC row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            {recent.map((t) => {
              const failed = !["success", "pending", "initiated"].includes(t.status);
              const canRetry = !!resolveServiceRoute(t.serviceCode);
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 transition-colors hover:bg-slate-50"
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: B.blue }}>{formatInr(t.amount)}</span>
                    <StatusBadge status={badgeStatus(t.status)} />
                    {failed ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold"
                        style={{
                          color: canRetry ? B.blue : "#B45309",
                          background: canRetry ? "#fff" : "#FFFBEB",
                        }}
                        onClick={() => retryOrSupport(t)}
                      >
                        {canRetry ? <RotateCcw size={12} /> : <LifeBuoy size={12} />}
                        {canRetry ? "Retry" : "Support"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-tooltip rounded-lg p-1.5"
                      style={{ color: B.blueLight, background: "#fff" }}
                      aria-label="Share receipt"
                      data-tooltip="Share / print receipt"
                      onClick={() => shareReceipt(t)}
                    >
                      <Share2 size={14} strokeWidth={2.25} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
