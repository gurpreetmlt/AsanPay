"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type ComponentType } from "react";
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
  Eye,
  EyeOff,
  TrendingUp,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { isFundRequestEnabled, type UserRole } from "@asanpay/shared-types";
import { AsanPayLockup } from "@/components/brand/Logo";
import { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import type { WalletBalance } from "@/lib/types";
import { useOnboardingGate } from "@/lib/useOnboardingGate";
import { formatInr, walletDisplayName } from "@/lib/walletLabels";
import { maskBalance, useBalanceVisibility } from "@/lib/balanceVisibility";
import { CHILD_ROLE, ROLE_LABEL, isRetailerRole } from "@/lib/roles";
import { AlertCountBadge } from "@/components/layout/AlertCountBadge";

const ACTION_QUEUE_POLL_MS = 60_000;
const LOW_BALANCE_THRESHOLD = 200;

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

function buildAgentNav(role: UserRole | undefined, fundRequestOn: boolean): NavItem[] {
  if (!role) return [];

  const moneyExtra: NavChild[] = fundRequestOn
    ? [{ to: "/fund-request", label: "Add Money", icon: PlusCircle }]
    : [];

  if (isRetailerRole(role)) {
    // Money = wallet cash. Business = earnings, reports, settlements, customers (admin-style groups).
    return [
      {
        type: "group",
        id: "services",
        label: "Services",
        icon: LayoutDashboard,
        children: [
          { to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
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
          ...moneyExtra,
          { to: "/passbook", label: "History", icon: History },
        ],
      },
      {
        type: "group",
        id: "business",
        label: "Business",
        icon: BarChart3,
        children: [
          { to: "/earnings", label: "My Earnings", icon: BarChart3 },
          { to: "/reports", label: "Business Report", icon: TrendingUp },
          { to: "/statements", label: "Statements", icon: FileText },
          { to: "/settlements", label: "Earnings & Settlement", icon: Landmark },
          { to: "/customers", label: "Customers", icon: Users },
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
        { to: "/network?invite=1", label: `Invite ${childLabel}`, icon: UserCheck },
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
        ...moneyExtra,
        { to: "/passbook", label: "History", icon: History },
        { to: "/float-planner", label: "Float & Earnings", icon: PiggyBank },
      ],
    },
    {
      type: "group",
      id: "business",
      label: "Business",
      icon: BarChart3,
      children: [
        { to: "/earnings", label: "My Earnings", icon: BarChart3 },
        { to: "/reports", label: "Business Report", icon: TrendingUp },
        { to: "/statements", label: "Statements", icon: FileText },
        { to: "/settlements", label: "Settlements", icon: Landmark },
      ],
    },
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
    { icon: BarChart3, label: "My Earnings", to: "/earnings" },
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
  const authUser = useAuthStore((s) => s.user);
  const authRole = authUser?.role;
  const accessToken = useAuthStore((s) => s.accessToken);
  const fundRequestOn = authUser ? isFundRequestEnabled(authUser.role, authUser.fundRequestEnabled) : false;
  const nav = useMemo(() => buildAgentNav(authRole, fundRequestOn), [authRole, fundRequestOn]);
  const isPartner = authRole === "super_distributor" || authRole === "distributor";

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [actionQueueCount, setActionQueueCount] = useState(0);
  const [kycPendingCount, setKycPendingCount] = useState(0);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of nav) {
      if (item.type === "group" && groupActive(pathname, item.children)) {
        next[item.id] = true;
      }
    }
    if (Object.keys(next).length) setOpenGroups((g) => ({ ...g, ...next }));
  }, [pathname, nav]);

  useEffect(() => {
    if (!accessToken || !isPartner) {
      setActionQueueCount(0);
      setKycPendingCount(0);
      return;
    }
    let alive = true;
    async function loadAlerts() {
      try {
        const data = await fetchApi<{
          downline: { isActive: boolean; mainBalance: string; kycStatus?: string }[];
        }>("/users/network");
        if (!alive) return;
        let action = 0;
        let kyc = 0;
        for (const m of data.downline) {
          if (m.kycStatus && m.kycStatus !== "verified") {
            action += 1;
            kyc += 1;
          }
          if (Number(m.mainBalance) < LOW_BALANCE_THRESHOLD) action += 1;
          if (!m.isActive) action += 1;
        }
        setActionQueueCount(action);
        setKycPendingCount(kyc);
      } catch {
        /* keep last good count */
      }
    }
    void loadAlerts();
    const t = setInterval(() => void loadAlerts(), ACTION_QUEUE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [accessToken, isPartner]);

  function toggleGroup(id: string) {
    setOpenGroups((g) => ({ ...g, [id]: !g[id] }));
  }

  function badgeForChild(to: string): number {
    if (to === "/action-queue") return actionQueueCount;
    if (to.startsWith("/network") && !to.includes("invite")) return kycPendingCount;
    return 0;
  }

  function badgeForGroup(id: string): number {
    if (id === "network") return actionQueueCount;
    return 0;
  }

  return (
    <>
      <div
        className="flex items-center gap-2 border-b border-white/10 px-3 py-3"
        style={{ minHeight: 88 }}
      >
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center py-0.5">
          {open ? (
            <AsanPayLockup width={188} light animate showTagline />
          ) : (
            <AsanPayLockup width={188} wordmark={false} light animate showTagline={false} />
          )}
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
                data-active={isActive}
                className={`side-nav-link group flex items-center gap-3 rounded-xl px-3 py-2.5 ${
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
                data-active={gActive}
                className={`side-nav-link group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 ${
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
                    <AlertCountBadge count={badgeForGroup(item.id)} />
                    <ChevronDown
                      size={14}
                      className={`text-white/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>
              {open && (
                <div className="side-nav-collapse" data-open={expanded} inert={!expanded}>
                <div className="ml-3 space-y-0.5 border-l border-white/10 pl-2">
                  {item.children.map((child) => {
                    const childActive = pathActive(pathname, child.to, child.exact);
                    const CIcon = child.icon;
                    return (
                      <Link
                        key={`${child.label}-${child.to}`}
                        href={child.to}
                        onClick={onClose}
                        data-active={childActive}
                        data-bar=""
                        className={`side-nav-link group flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                          childActive ? "bg-white/15" : "hover:bg-white/8"
                        }`}
                      >
                        <CIcon
                          size={15}
                          className={childActive ? "text-white" : "text-white/45 group-hover:text-white"}
                          strokeWidth={childActive ? 2.5 : 2}
                        />
                        <span
                          className={`flex-1 text-sm font-medium ${
                            childActive ? "text-white" : "text-white/55 group-hover:text-white"
                          }`}
                        >
                          {child.label}
                        </span>
                        <AlertCountBadge count={badgeForChild(child.to)} />
                      </Link>
                    );
                  })}
                </div>
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
  const user = useAuthStore((s) => s.user);
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

  const fundOn = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;
  const goAddMoney = () => {
    if (!fundOn) {
      toast.error("Fund requests are not enabled for your account. Contact your sales manager to enable them.");
      return;
    }
    router.push("/fund-request");
  };

  const balanceVisible = useBalanceVisibility((s) => s.visible);

  // Same actions on Main and AEPS — Add Money (fund request) credits Main; keep entry points consistent.
  const actions = [
    ...(fundOn ? [{ icon: PlusCircle, label: "Add Money", action: goAddMoney }] : []),
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
          {maskBalance(balanceVisible, formatInr(wallet.balance))}
        </span>
        <ChevronDown size={13} style={{ color: B.muted }} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div
          className="dropdown-pop-in absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-2xl border bg-white p-1.5 shadow-lg"
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
  const balanceVisible = useBalanceVisibility((s) => s.visible);
  const toggleBalance = useBalanceVisibility((s) => s.toggle);

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
        onClick={toggleBalance}
        className="icon-tooltip flex h-9 w-9 items-center justify-center rounded-2xl"
        style={{ background: B.bg, color: B.blue }}
        aria-label={balanceVisible ? "Hide balances" : "Show balances"}
        data-tooltip={balanceVisible ? "Hide balances" : "Show balances"}
      >
        {balanceVisible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="icon-tooltip flex h-9 w-9 items-center justify-center rounded-2xl disabled:opacity-50"
        style={{ background: B.bg, color: B.green }}
        aria-label="Refresh balances"
        data-tooltip="Refresh balances"
      >
        <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

const HEADER_SEARCH_SERVICES = [
  { label: "AePS Cash Withdraw", href: "/aeps?tab=Withdraw", q: "aeps withdraw cash banking" },
  { label: "AePS Deposit", href: "/aeps?tab=Deposit", q: "aeps deposit banking" },
  { label: "AePS Balance Enquiry", href: "/aeps?tab=Balance%20Enquiry", q: "aeps balance enquiry banking" },
  { label: "AePS Mini Statement", href: "/aeps?tab=Mini%20Statement", q: "aeps mini statement banking" },
  { label: "DMT Money Transfer", href: "/dmt", q: "dmt money transfer remittance" },
  { label: "Nepal Remittance", href: "/nepal", q: "nepal remittance" },
  { label: "UPI Cash Point", href: "/upi-cash-point", q: "upi cash point" },
  { label: "Add Money", href: "/fund-request", q: "fund add money wallet" },
  { label: "Settlements", href: "/settlements", q: "settlement bank withdraw" },
  { label: "My Earnings", href: "/earnings", q: "earnings commission report today" },
  { label: "Business Report", href: "/reports", q: "reports earnings commission business volume" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  useOnboardingGate();
  const [drawer, setDrawer] = useState(false);
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = roleFromUserRole(user?.role);
  const name = user?.name ?? "Agent";
  const uid = user?.uid ?? "—";
  const av = initials(name);
  const balanceVisible = useBalanceVisibility((s) => s.visible);
  const toggleBalance = useBalanceVisibility((s) => s.toggle);
  const isPartner = user?.role === "super_distributor" || user?.role === "distributor";

  const fundRequestOn = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;

  const alertItems = useMemo(() => {
    const r = user?.role;
    if (r === "retailer") {
      return [
        { href: "/settings", title: "KYC & profile", body: "Complete KYC, bank, and MPIN" },
        ...(fundRequestOn
          ? [{ href: "/fund-request", title: "Add money", body: "Top up main wallet for services" }]
          : []),
        { href: "/settlements", title: "Settlement banks", body: "Add or check bank for withdrawals" },
        { href: "/support", title: "Support", body: "Open a ticket if a txn failed" },
      ];
    }
    return [
      { href: "/network", title: "Network", body: "Review downline activity and KYC" },
      { href: "/onboarding/outlet", title: "Onboard partner", body: "Add a new distributor or retailer" },
      { href: "/wallet", title: "Fund transfer", body: "Send float to your network" },
      ...(fundRequestOn
        ? [{ href: "/fund-request", title: "Add money", body: "Request float for your wallet" }]
        : []),
      { href: "/settlements", title: "Settlements", body: "Bank verify and withdrawals" },
    ];
  }, [user?.role, fundRequestOn]);

  const searchMatches = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    const items: { href: string; label: string; group: string }[] = [];
    if (!q) return items;

    for (const s of HEADER_SEARCH_SERVICES) {
      if (s.href === "/fund-request" && !fundRequestOn) continue;
      if (s.label.toLowerCase().includes(q) || s.q.includes(q)) {
        items.push({ href: s.href, label: s.label, group: "Services" });
      }
    }
    items.push({
      href: `/transactions?q=${encodeURIComponent(headerSearch.trim())}`,
      label: `Transactions matching “${headerSearch.trim()}”`,
      group: "Transactions",
    });
    if (isPartner) {
      items.push({
        href: `/network?q=${encodeURIComponent(headerSearch.trim())}`,
        label: `Retailers / partners matching “${headerSearch.trim()}”`,
        group: "Network",
      });
    }
    return items.slice(0, 12);
  }, [headerSearch, isPartner, fundRequestOn]);

  const loadWallets = useCallback(async () => {
    if (!accessToken) return;
    setWalletsLoading(true);
    try {
      const data = await fetchApi<WalletBalance[]>("/wallet/me");
      setWallets(isPartner ? data.filter((w) => w.walletType === "main") : data);
    } catch {
      // Header balance is non-blocking — page-level loaders surface errors
    } finally {
      setWalletsLoading(false);
    }
  }, [accessToken, isPartner]);

  useEffect(() => {
    setDrawer(false);
    setNotifOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false);
      if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    void loadWallets();
    // Intentionally excludes `pathname` — refetching the header balance on every route change
    // duplicated the page-level wallet fetches already done by dashboard/wallet screens and
    // added avoidable latency to navigation. The header's manual refresh button covers the case
    // where a balance needs to be re-checked mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWallets]);

  function goSearch(href: string) {
    setHeaderSearch("");
    setSearchOpen(false);
    router.push(href);
  }

  function submitHeaderSearch(e: FormEvent) {
    e.preventDefault();
    const q = headerSearch.trim();
    if (!q) return;
    if (searchMatches[0]) {
      goSearch(searchMatches[0].href);
      return;
    }
    goSearch(
      isPartner
        ? `/network?q=${encodeURIComponent(q)}`
        : `/transactions?q=${encodeURIComponent(q)}`,
    );
  }

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
            className="drawer-backdrop-in absolute inset-0 bg-black/50"
            aria-label="Close menu"
            data-tooltip="Close menu"
            onClick={() => setDrawer(false)}
          />
          <aside
            className="drawer-slide-in absolute left-0 top-0 flex h-full w-[248px] flex-col shadow-2xl"
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
          className="sticky top-0 z-30 flex flex-shrink-0 items-center gap-3 overflow-visible border-b bg-white px-4 md:gap-4 md:px-6"
          style={{ height: 68, borderColor: B.border }}
        >
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:hidden icon-tooltip"
            style={{ background: B.bg, color: B.muted }}
            aria-label="Open menu"
            data-tooltip="Open menu"
          >
            <Menu size={18} />
          </button>

          <div className="relative hidden max-w-[360px] flex-1 lg:block" ref={searchRef}>
            <form
              onSubmit={submitHeaderSearch}
              className="flex items-center gap-3 rounded-xl px-4 py-2"
              style={{ background: B.bg }}
            >
              <Search size={15} style={{ color: B.muted }} />
              <input
                value={headerSearch}
                onChange={(e) => {
                  setHeaderSearch(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder={
                  isPartner
                    ? "Search services, transactions, retailers…"
                    : "Search services or transactions…"
                }
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: B.blue }}
                aria-label="Search services, transactions, or retailers"
              />
            </form>
            {searchOpen && headerSearch.trim() && searchMatches.length > 0 ? (
              <div
                className="dropdown-pop-in absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-white shadow-lg"
                style={{ borderColor: B.border }}
              >
                {searchMatches.map((m) => (
                  <button
                    key={m.href + m.label}
                    type="button"
                    onClick={() => goSearch(m.href)}
                    className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                      {m.group}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: B.blue }}>
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <HeaderWalletBalances wallets={wallets} loading={walletsLoading} onRefresh={() => void loadWallets()} />
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: B.bg }}
                aria-label="Notifications"
              >
                <Bell size={17} style={{ color: B.blue }} />
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: B.green }} />
              </button>
              {notifOpen ? (
                <div
                  className="dropdown-pop-in absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border bg-white shadow-xl"
                  style={{ borderColor: B.border }}
                >
                  <div className="border-b px-4 py-3" style={{ borderColor: B.border }}>
                    <p className="text-sm font-bold" style={{ color: B.blue }}>
                      Alerts
                    </p>
                    <p className="text-[11px]" style={{ color: B.muted }}>
                      KYC, bank, fund and settlement shortcuts
                    </p>
                  </div>
                  <ul className="max-h-80 overflow-y-auto py-1">
                    {alertItems.map((item) => (
                      <li key={item.href + item.title}>
                        <Link
                          href={item.href}
                          onClick={() => setNotifOpen(false)}
                          className="block px-4 py-2.5 hover:bg-slate-50"
                        >
                          <p className="text-sm font-semibold" style={{ color: B.blue }}>
                            {item.title}
                          </p>
                          <p className="text-[11px]" style={{ color: B.muted }}>
                            {item.body}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
              <>
                {[...wallets]
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
                        {maskBalance(balanceVisible, formatInr(w.balance))}
                      </span>
                    </Link>
                  ))}
                <button
                  type="button"
                  onClick={toggleBalance}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: B.bg, color: B.blue }}
                  aria-label={balanceVisible ? "Hide balances" : "Show balances"}
                >
                  {balanceVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </>
            )}
          </div>
        )}

        <main
          key={pathname}
          className="dash-page-animate flex-1 overflow-y-auto overflow-x-hidden"
        >
          {children}
        </main>
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
