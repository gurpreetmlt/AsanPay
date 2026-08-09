"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
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
  PlusCircle,
  SendHorizonal,
  Download,
  ChevronDown,
  Landmark,
  LifeBuoy,
  PiggyBank,
  ListTodo,
  UserCheck,
  Fingerprint,
  Banknote,
  MapPin,
  History,
} from "lucide-react";
import { toast } from "react-hot-toast";
import type { UserRole } from "@asanpay/shared-types";
import { AsanPayLogo, AsanIcon } from "@/components/brand/Logo";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import type { WalletBalance } from "@/lib/types";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import { CHILD_ROLE, ROLE_LABEL, isRetailerRole } from "@/lib/roles";

type LucideIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

type NavChild = { to: string; label: string; icon: LucideIcon; exact?: boolean };
type NavItem =
  | { type: "link"; to: string; label: string; icon: LucideIcon }
  | { type: "group"; id: string; label: string; icon: LucideIcon; children: NavChild[] };

function pathActive(pathname: string, to: string, exact?: boolean) {
  if (exact) return pathname === to || pathname === `${to}/`;
  if (to === "/dashboard") return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function groupActive(pathname: string, children: NavChild[]) {
  return children.some((c) => pathActive(pathname, c.to, c.exact));
}

function buildAgentNav(role: UserRole | undefined): NavItem[] {
  if (!role) return [];

  if (isRetailerRole(role)) {
    return [
      {
        type: "group",
        id: "services",
        label: "Services",
        icon: LayoutDashboard,
        children: [
          { to: "/dashboard", label: "Services", icon: LayoutDashboard, exact: true },
          { to: "/aeps", label: "AePS", icon: Fingerprint },
          { to: "/dmt", label: "DMT", icon: Banknote },
          { to: "/upi-cash-point", label: "UPI Cash Point", icon: MapPin },
          { to: "/nepal", label: "Nepal", icon: MapPin },
        ],
      },
      {
        type: "group",
        id: "money",
        label: "Money",
        icon: Wallet,
        children: [
          { to: "/wallet", label: "Balance", icon: Wallet, exact: true },
          { to: "/fund-request", label: "Add Money", icon: PlusCircle },
          { to: "/settlements", label: "Earnings & Settlement", icon: Landmark },
          { to: "/passbook", label: "History", icon: History },
          { to: "/statements", label: "Statements", icon: FileText },
        ],
      },
      {
        type: "group",
        id: "business",
        label: "Business",
        icon: Users,
        children: [
          { to: "/customers", label: "Customers", icon: Users },
          { to: "/reports", label: "Reports", icon: BarChart3 },
        ],
      },
      { type: "link", to: "/support", label: "Support", icon: LifeBuoy },
      { type: "link", to: "/settings", label: "Settings", icon: Settings },
    ];
  }

  const childRole = CHILD_ROLE[role];
  const childLabel = childRole ? ROLE_LABEL[childRole] : "Agent";

  return [
    { type: "link", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      type: "group",
      id: "network",
      label: "Network",
      icon: Network,
      children: [
        { to: "/network", label: `My ${childLabel}s`, icon: Network },
        { to: "/onboarding/outlet", label: `Onboard ${childLabel}`, icon: UserCheck },
        { to: "/action-queue", label: "Action Queue", icon: ListTodo },
        { to: "/kyc-assistant", label: "KYC Assistant", icon: Shield },
      ],
    },
    {
      type: "group",
      id: "money",
      label: "Money",
      icon: Wallet,
      children: [
        { to: "/wallet", label: "Balance", icon: Wallet, exact: true },
        { to: "/fund-request", label: "Add Money", icon: PlusCircle },
        { to: "/settlements", label: "Settlements", icon: Landmark },
        { to: "/float-planner", label: "Float & Earnings", icon: PiggyBank },
        { to: "/passbook", label: "History", icon: History },
        { to: "/statements", label: "Statements", icon: FileText },
      ],
    },
    { type: "link", to: "/reports", label: "Reports", icon: BarChart3 },
    { type: "link", to: "/support", label: "Support", icon: LifeBuoy },
    { type: "link", to: "/settings", label: "Settings", icon: Settings },
  ];
}

const MOBILE_CORE = [
  { icon: LayoutDashboard, label: "Home", to: "/dashboard" },
  { icon: Wallet, label: "Balance", to: "/wallet" },
  { icon: History, label: "History", to: "/passbook" },
  { icon: Settings, label: "More", to: "/settings" },
] as const;

function mobileTabsForRole(role: string | undefined) {
  if (role === "retailer") {
    return [
      MOBILE_CORE[0],
      MOBILE_CORE[1],
      MOBILE_CORE[2],
      { icon: Users, label: "Customers", to: "/customers" },
      MOBILE_CORE[3],
    ];
  }
  return [
    MOBILE_CORE[0],
    { icon: Network, label: "Network", to: "/network" },
    MOBILE_CORE[1],
    { icon: BarChart3, label: "Reports", to: "/reports" },
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
  const nav = useMemo(() => buildAgentNav(authRole), [authRole]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of nav) {
      if (item.type === "group" && groupActive(pathname, item.children)) {
        next[item.id] = true;
      }
    }
    if (Object.keys(next).length) setOpenGroups((g) => ({ ...g, ...next }));
  }, [pathname, nav]);

  function toggleGroup(id: string) {
    setOpenGroups((g) => ({ ...g, [id]: !g[id] }));
  }

  return (
    <>
      <div
        className="flex items-center gap-2 overflow-hidden border-b border-white/10 px-4 py-4"
        style={{ minHeight: 68 }}
      >
        <Link href="/dashboard" className="flex items-center">
          {open ? <AsanPayLogo width={152} variant="light" /> : <AsanIcon size={36} />}
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
              <div className="truncate text-[14px] font-semibold text-white">{name}</div>
              <div className="text-[11px] text-white/60">
                {uid} · {roleLabel}
              </div>
            </div>
            <Star size={13} className="flex-shrink-0 text-amber-400" fill="#FBBF24" />
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {nav.map((item) => {
          if (item.type === "link") {
            const isActive = pathActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                href={item.to}
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
                    {item.label}
                  </span>
                )}
              </Link>
            );
          }

          const gActive = groupActive(pathname, item.children);
          const expanded = openGroups[item.id] ?? gActive;
          const Icon = item.icon;
          return (
            <div key={item.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  gActive ? "bg-white/15" : "hover:bg-white/8"
                }`}
                style={{ borderLeft: gActive ? `3px solid ${B.green}` : "3px solid transparent" }}
              >
                <Icon
                  size={18}
                  className={gActive ? "text-white" : "text-white/50 group-hover:text-white"}
                  strokeWidth={gActive ? 2.5 : 2}
                />
                {open && (
                  <>
                    <span
                      className={`flex-1 text-left text-sm font-medium ${
                        gActive ? "text-white" : "text-white/60 group-hover:text-white"
                      }`}
                    >
                      {item.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>
              {open && expanded && (
                <div className="ml-3 space-y-0.5 border-l border-white/10 pl-2">
                  {item.children.map((child) => {
                    const childActive = pathActive(pathname, child.to, child.exact);
                    const CIcon = child.icon;
                    return (
                      <Link
                        key={`${child.label}-${child.to}`}
                        href={child.to}
                        onClick={onClose}
                        className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all ${
                          childActive ? "bg-white/15" : "hover:bg-white/8"
                        }`}
                      >
                        <CIcon
                          size={15}
                          className={childActive ? "text-white" : "text-white/45 group-hover:text-white"}
                          strokeWidth={childActive ? 2.5 : 2}
                        />
                        <span
                          className={`text-sm font-medium ${
                            childActive ? "text-white" : "text-white/55 group-hover:text-white"
                          }`}
                        >
                          {child.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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

function WalletPill({
  wallet,
  onRefresh,
  loading,
}: {
  wallet: WalletBalance;
  onRefresh: () => void;
  loading: boolean;
}) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function closeSoon() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  const goAddMoney = () => {
    if (role === "retailer") router.push("/fund-request");
    else toast("Ask your upline to fund your balance, or use Collect on Balance");
  };

  // Same actions on Main and AEPS — Add Money (fund request) credits Main; keep entry points consistent.
  const actions = [
    { icon: PlusCircle, label: "Add Money", action: goAddMoney },
    { icon: SendHorizonal, label: "Transfer", action: () => router.push("/wallet") },
    { icon: RefreshCw, label: "Refresh", action: onRefresh },
    { icon: Download, label: "Statement", action: () => router.push("/statements") },
  ];

  return (
    <div
      className="relative hidden sm:block"
      ref={ref}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 transition-colors hover:bg-secondary"
        style={{ borderColor: B.border, background: B.bg }}
        title={walletDisplayName(wallet.walletType)}
      >
        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
          {walletDisplayName(wallet.walletType)}
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color: B.blue }}>
          {formatInr(wallet.balance)}
        </span>
        <ChevronDown size={13} style={{ color: B.muted }} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-2xl border bg-white p-1.5 shadow-lg"
          style={{ borderColor: B.border }}
        >
          {actions.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                action();
                setOpen(false);
              }}
              disabled={label === "Refresh" && loading}
              className="flex w-full items-center gap-2 rounded-2xl px-2.5 py-2 text-left text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
              style={{ color: B.blue }}
            >
              <Icon size={14} className={label === "Refresh" && loading ? "animate-spin" : ""} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
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
          className="rounded-2xl px-3 py-1.5 text-xs font-semibold"
          style={{ background: B.bg, color: B.muted }}
        >
          …
        </div>
      ) : (
        ordered.map((w) => <WalletPill key={w.id} wallet={w} onRefresh={onRefresh} loading={loading} />)
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="flex h-9 w-9 items-center justify-center rounded-2xl disabled:opacity-50"
        style={{ background: B.bg, color: B.green }}
        aria-label="Refresh balances"
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
                <div className="text-sm font-bold" style={{ color: B.blue }}>
                  {name}
                </div>
                <div className="text-[11px]" style={{ color: B.muted }}>
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
                    className="flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-1.5"
                    style={{ borderColor: B.border, background: B.bg }}
                  >
                    <span className="text-[12px] font-bold uppercase" style={{ color: B.muted }}>
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

        <main className="dash-page-animate flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
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
                className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[12px] font-medium"
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
