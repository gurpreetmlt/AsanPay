"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Users,
  Network,
  BarChart3,
  FileText,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  Star,
  RefreshCw,
} from "lucide-react";
import { AsanPayLogo, AdhikariIcon } from "@/components/brand/Logo";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import type { WalletBalance } from "@/lib/types";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";

const NAV_CORE = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard" },
  { icon: ArrowLeftRight, label: "Transactions", to: "/transactions" },
  { icon: Wallet, label: "Wallet", to: "/wallet" },
  { icon: Network, label: "Network", to: "/network" },
  { icon: BarChart3, label: "Reports", to: "/reports" },
  { icon: FileText, label: "Statements", to: "/statements" },
  { icon: Settings, label: "Settings", to: "/settings" },
  { icon: Shield, label: "KYC", to: "/kyc" },
] as const;

const NAV_CUSTOMERS = { icon: Users, label: "Customers", to: "/customers" } as const;

const MOBILE_CORE = [
  { icon: LayoutDashboard, label: "Home", to: "/dashboard" },
  { icon: ArrowLeftRight, label: "Txns", to: "/transactions" },
  { icon: Wallet, label: "Wallet", to: "/wallet" },
  { icon: Settings, label: "More", to: "/settings" },
] as const;

function sidebarNavForRole(role: string | undefined) {
  // Customers = retailer only. Distributor / Super Dist use Network.
  if (role === "retailer") {
    return [
      NAV_CORE[0],
      NAV_CORE[1],
      NAV_CORE[2],
      NAV_CORE[3],
      NAV_CUSTOMERS,
      NAV_CORE[4],
      NAV_CORE[5],
      NAV_CORE[6],
      NAV_CORE[7],
    ];
  }
  return [...NAV_CORE];
}

function mobileTabsForRole(role: string | undefined) {
  if (role === "retailer") {
    return [
      MOBILE_CORE[0],
      MOBILE_CORE[1],
      MOBILE_CORE[2],
      NAV_CUSTOMERS,
      MOBILE_CORE[3],
    ];
  }
  // Distributor / Super Dist: Network instead of Customers
  return [
    MOBILE_CORE[0],
    MOBILE_CORE[1],
    MOBILE_CORE[2],
    { icon: Network, label: "Network", to: "/network" },
    MOBILE_CORE[3],
  ];
}

function SidebarContent({
  open,
  onClose,
  onLogout,
  name,
  uid,
  roleLabel,
  av,
}: {
  open: boolean;
  onClose?: () => void;
  onLogout: () => void;
  name: string;
  uid: string;
  roleLabel: string;
  av: string;
}) {
  const pathname = usePathname();
  const authRole = useAuthStore((s) => s.user?.role);
  const items = sidebarNavForRole(authRole);

  return (
    <>
      <div
        className="flex items-center gap-2 overflow-hidden border-b border-white/10 px-4 py-4"
        style={{ minHeight: 68 }}
      >
        <Link href="/dashboard" className="flex items-center">
          {open ? <AsanPayLogo width={152} variant="light" /> : <AdhikariIcon size={36} />}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex-shrink-0 text-white/40 transition-colors hover:text-white md:hidden"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {open && (
        <div className="mx-3 mb-1 mt-4 rounded-xl bg-white/10 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
              {av}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{name}</div>
              <div className="text-xs text-white/50">
                {uid} · {roleLabel}
              </div>
            </div>
            <Star size={13} className="flex-shrink-0 text-amber-400" fill="#FBBF24" />
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {items.map(({ icon: Icon, label, to }) => {
          const isActive = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              href={to}
              onClick={onClose}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                isActive ? "bg-white/15" : "hover:bg-white/8"
              }`}
              style={{ borderLeft: isActive ? `3px solid ${B.green}` : "3px solid transparent" }}
            >
              <Icon
                size={18}
                className={isActive ? "text-white" : "text-white/50 group-hover:text-white"}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {open && (
                <span
                  className={`text-sm font-medium ${isActive ? "text-white" : "text-white/60 group-hover:text-white"}`}
                >
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-2 py-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} />
          {open && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </>
  );
}

function HeaderWalletBalances({
  wallets,
  loading,
  onRefresh,
}: {
  wallets: WalletBalance[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const ordered = [...wallets].sort((a, b) => {
    if (a.walletType === "main") return -1;
    if (b.walletType === "main") return 1;
    return a.walletType.localeCompare(b.walletType);
  });

  if (!loading && ordered.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {loading && ordered.length === 0 ? (
        <div
          className="rounded-xl px-3 py-1.5 text-xs font-semibold"
          style={{ background: B.bg, color: B.muted }}
        >
          …
        </div>
      ) : (
        ordered.map((w) => (
          <Link
            key={w.id}
            href="/wallet"
            className="hidden items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors hover:bg-secondary sm:flex"
            style={{ borderColor: B.border, background: B.bg }}
            title={`${walletDisplayName(w.walletType)} balance`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              {walletDisplayName(w.walletType)}
            </span>
            <span className="text-sm font-bold tabular-nums" style={{ color: B.blue }}>
              {formatInr(w.balance)}
            </span>
          </Link>
        ))
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="flex h-9 w-9 items-center justify-center rounded-xl disabled:opacity-50"
        style={{ background: B.bg, color: B.green }}
        aria-label="Refresh wallet balances"
      >
        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useOnboardingGate();
  const [drawer, setDrawer] = useState(false);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const role = roleFromUserRole(user?.role);
  const name = user?.name ?? "Agent";
  const uid = user?.uid ?? "—";
  const av = initials(name);

  const loadWallets = useCallback(async () => {
    if (!accessToken) return;
    setWalletsLoading(true);
    try {
      const data = await fetchApi<WalletBalance[]>("/wallet/me");
      setWallets(data);
    } catch {
      // Header balance is non-blocking — page-level loaders surface errors
    } finally {
      setWalletsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    void loadWallets();
    // Intentionally excludes `pathname` — refetching the header balance on every route change
    // duplicated the page-level wallet fetches already done by dashboard/wallet screens and
    // added avoidable latency to navigation. The header's manual refresh button covers the case
    // where a balance needs to be re-checked mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWallets]);

  async function handleLogout() {
    const { logoutEverywhere } = await import("@/lib/logout");
    await logoutEverywhere();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen overflow-x-hidden font-sans" style={{ background: B.bg }}>
      {/* Desktop sidebar */}
      <aside
        className="fixed left-0 top-0 z-40 hidden h-screen w-[248px] flex-col md:flex"
        style={{ background: B.badgeGrad, boxShadow: "4px 0 28px rgba(11,42,154,0.2)" }}
      >
        <SidebarContent
          open
          onLogout={handleLogout}
          name={name}
          uid={uid}
          roleLabel={role.label}
          av={av}
        />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          />
          <aside
            className="absolute left-0 top-0 flex h-full w-[248px] flex-col shadow-2xl"
            style={{ background: B.badgeGrad }}
          >
            <SidebarContent
              open
              onClose={() => setDrawer(false)}
              onLogout={handleLogout}
              name={name}
              uid={uid}
              roleLabel={role.label}
              av={av}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col overflow-x-hidden pb-20 md:ml-[248px] md:pb-0">
        <header
          className="sticky top-0 z-30 flex flex-shrink-0 items-center gap-3 border-b bg-white px-4 md:gap-4 md:px-6"
          style={{ height: 68, borderColor: B.border }}
        >
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden"
            style={{ background: B.bg, color: B.muted }}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          <div
            className="hidden flex-1 items-center gap-3 rounded-xl px-4 py-2 lg:flex"
            style={{ background: B.bg, maxWidth: 320 }}
          >
            <Search size={15} style={{ color: B.muted }} />
            <input
              placeholder="Search transactions, customers…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: B.blue }}
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <HeaderWalletBalances wallets={wallets} loading={walletsLoading} onRefresh={() => void loadWallets()} />
            <div className="relative">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: B.bg }}
              >
                <Bell size={17} style={{ color: B.blue }} />
              </button>
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: B.green }} />
            </div>
            <div className="flex items-center gap-2 border-l pl-3" style={{ borderColor: B.border }}>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
                style={{ background: role.gradient }}
              >
                {av}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold" style={{ color: B.blue }}>
                  {name}
                </div>
                <div className="text-xs" style={{ color: B.muted }}>
                  {role.label}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile: wallet chips under header so retailers always see both balances */}
        {(walletsLoading || wallets.length > 0) && (
          <div
            className="flex items-center gap-2 overflow-x-auto border-b px-4 py-2 sm:hidden"
            style={{ borderColor: B.border, background: "#fff" }}
          >
            {walletsLoading && wallets.length === 0 ? (
              <span className="text-xs" style={{ color: B.muted }}>
                Loading balances…
              </span>
            ) : (
              [...wallets]
                .sort((a, b) => {
                  if (a.walletType === "main") return -1;
                  if (b.walletType === "main") return 1;
                  return a.walletType.localeCompare(b.walletType);
                })
                .map((w) => (
                  <Link
                    key={w.id}
                    href="/wallet"
                    className="flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <span className="text-[10px] font-bold uppercase" style={{ color: B.muted }}>
                      {walletDisplayName(w.walletType)}
                    </span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: B.blue }}>
                      {formatInr(w.balance)}
                    </span>
                  </Link>
                ))
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>

      {/* Bottom tabs — mobile pattern */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/95 backdrop-blur-xl md:hidden"
        style={{ borderColor: B.border }}
      >
        <nav className="flex items-stretch justify-around px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {mobileTabsForRole(user?.role).map(({ icon: Icon, label, to }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                href={to}
                className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium"
                style={{ color: active ? B.blueLight : B.muted }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
