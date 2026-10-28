"use client";

// Deploy marker: treasury + fund-requests nav (rebuild if sidebar still says Wallet & Fund)
import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Calculator,
  ChevronDown,
  Crown,
  FileSpreadsheet,
  Fingerprint,
  GitBranch,
  History,
  IdCard,
  IndianRupee,
  Landmark,
  LayoutGrid,
  LifeBuoy,
  Lock,
  Mail,
  MailPlus,
  Megaphone,
  MessageCircle,
  Network,
  Package,
  Percent,
  Plug,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  Eye,
  Store,
  TableProperties,
  Tags,
  Trash2,
  Wrench,
} from "lucide-react";
import { AsanPayLockup } from "@/components/brand/Logo";
import { AnimatedNavIcon } from "@/components/ui/AnimatedNavIcon";
import type { NavIconDef } from "@/lib/iconTypes";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { MobileAdminNav } from "@/components/layout/MobileAdminNav";
import { AlertCountBadge } from "@/components/layout/AlertCountBadge";
import { AdminAlertsProvider, useAdminAlerts } from "@/components/layout/AdminAlertsProvider";
import { useAdminTheme } from "@/components/theme/AdminThemeProvider";
import { cn } from "@/lib/utils";

/** `match` = extra routes (tabs of a grouped page) that keep this item highlighted. */
type NavChild = { href: string; label: string; icon: NavIconDef; match?: string[] };
type NavItem =
  | { type: "link"; href: string; label: string; icon: NavIconDef }
  | { type: "group"; id: string; label: string; icon: NavIconDef; children: NavChild[] };

const TOP_LINKS: NavItem[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: { lib: "md", name: "MdDashboard" } },
];

const AGENTS: NavItem[] = [
  {
    type: "group",
    id: "agents",
    label: "Agents",
    icon: { lib: "fa", name: "FaUsers" },
    children: [
      { href: "/users", label: "All Agents", icon: { lib: "fa", name: "FaUsers" } },
      { href: "/users/super-distributors", label: "Super Distributors", icon: { lib: "lucide", icon: Crown } },
      { href: "/users/distributors", label: "Distributors", icon: { lib: "lucide", icon: Network } },
      { href: "/users/retailers", label: "Retailers", icon: { lib: "lucide", icon: Store } },
      { href: "/invites", label: "Invites", icon: { lib: "lucide", icon: MailPlus } },
      { href: "/kyc", label: "KYC Queue", icon: { lib: "md", name: "MdVerifiedUser" } },
      { href: "/settlements", label: "Agent bank accounts", icon: { lib: "lucide", icon: Landmark } },
    ],
  },
];

const TRANSACTIONS: NavItem[] = [
  {
    type: "group",
    id: "transactions",
    label: "Transactions",
    icon: { lib: "fa", name: "FaExchangeAlt" },
    children: [
      { href: "/transactions", label: "All transactions", icon: { lib: "fa", name: "FaExchangeAlt" } },
      { href: "/recovery-workbench", label: "Stuck & recovery", icon: { lib: "lucide", icon: Wrench } },
      { href: "/disputes", label: "Disputes", icon: { lib: "lucide", icon: ShieldAlert } },
    ],
  },
];

/** Company money: funding, fund-request queue, statements — under Treasury so ops never hunt. */
const TREASURY: NavItem[] = [
  {
    type: "group",
    id: "treasury",
    label: "Treasury & Balance",
    icon: { lib: "md", name: "MdAccountBalanceWallet" },
    children: [
      {
        href: "/treasury",
        label: "Treasury overview",
        icon: { lib: "lucide", icon: Landmark },
        match: ["/wallet", "/float"],
      },
      { href: "/treasury/bank", label: "Bank & deposits", icon: { lib: "lucide", icon: Building2 } },
      {
        href: "/ledger-reports",
        label: "Reports & recon",
        icon: { lib: "lucide", icon: Scale },
        match: ["/passbook", "/reconciliation", "/recon-adjustments"],
      },
      { href: "/treasury-settings", label: "Treasury settings", icon: { lib: "lucide", icon: Settings } },
    ],
  },
];

/** What agents earn and what customers pay. URLs stay under /tax-commission so old links keep working. */
const COMMISSION: NavItem[] = [
  {
    type: "group",
    id: "commission",
    label: "Commission",
    icon: { lib: "lucide", icon: Percent },
    children: [
      {
        href: "/tax-commission/setup",
        label: "Commission overview",
        icon: { lib: "lucide", icon: Eye },
        match: ["/tax-commission", "/commission", "/commissions"],
      },
      { href: "/tax-commission/rate-card", label: "Rate card", icon: { lib: "lucide", icon: TableProperties } },
      { href: "/service-charges", label: "Customer fees", icon: { lib: "lucide", icon: IndianRupee } },
      { href: "/tax-commission/overrides", label: "Agent custom rates", icon: { lib: "lucide", icon: GitBranch } },
      { href: "/tax-commission/payouts", label: "Payouts", icon: { lib: "lucide", icon: ScrollText } },
      { href: "/tax-commission/recon", label: "Commission check", icon: { lib: "lucide", icon: Scale } },
      { href: "/tax-commission/rate-audit", label: "Rate history", icon: { lib: "lucide", icon: History } },
      { href: "/tax-commission/schemes", label: "Schemes (advanced)", icon: { lib: "lucide", icon: Percent } },
    ],
  },
];

/** TDS on agent commission, GST on customer fee, filing registers. */
const TAX: NavItem[] = [
  {
    type: "group",
    id: "tax",
    label: "Tax",
    icon: { lib: "lucide", icon: Receipt },
    children: [
      { href: "/tax-commission/tax", label: "Tax settings", icon: { lib: "lucide", icon: Calculator } },
      {
        href: "/tax-commission/registers",
        label: "Tax registers",
        icon: { lib: "lucide", icon: FileSpreadsheet },
      },
      { href: "/tax-commission/pan-gaps", label: "PAN gaps", icon: { lib: "lucide", icon: IdCard } },
      { href: "/tax-commission/ca-pack", label: "CA pack", icon: { lib: "lucide", icon: Package } },
      { href: "/tax-commission/month-lock", label: "Month lock", icon: { lib: "lucide", icon: Lock } },
    ],
  },
];

/** Agent-facing help queues + the contacts agents see on their Support screen. */
const SUPPORT: NavItem[] = [
  {
    type: "group",
    id: "support",
    label: "Support",
    icon: { lib: "lucide", icon: LifeBuoy },
    children: [
      { href: "/support-tickets", label: "Support tickets", icon: { lib: "lucide", icon: LifeBuoy } },
      { href: "/whatsapp", label: "WhatsApp", icon: { lib: "lucide", icon: MessageCircle } },
      { href: "/device-repairs", label: "Device repairs", icon: { lib: "lucide", icon: Fingerprint } },
      { href: "/risk-alerts", label: "Risk alerts", icon: { lib: "lucide", icon: AlertTriangle } },
      { href: "/platform-settings", label: "Support contacts", icon: { lib: "lucide", icon: Settings } },
    ],
  },
];

/** What agents can use: services on / off + which provider handles each one. */
const SERVICES: NavItem[] = [
  {
    type: "group",
    id: "services",
    label: "Services",
    icon: { lib: "lucide", icon: LayoutGrid },
    children: [
      { href: "/site-control", label: "Services & badges", icon: { lib: "lucide", icon: Tags } },
      { href: "/developer-options/providers", label: "Providers & routing", icon: { lib: "lucide", icon: Plug } },
    ],
  },
];

const AGENT_MESSAGES: NavItem[] = [
  {
    type: "group",
    id: "messages",
    label: "Agent messages",
    icon: { lib: "lucide", icon: Megaphone },
    children: [
      { href: "/promotions", label: "Promotions", icon: { lib: "lucide", icon: Megaphone } },
      { href: "/announcements", label: "Announcements", icon: { lib: "lucide", icon: Mail } },
    ],
  },
];

const SYSTEM: NavItem[] = [
  {
    type: "group",
    id: "system",
    label: "System",
    icon: { lib: "lucide", icon: Settings },
    children: [
      { href: "/audit-logs", label: "Audit log", icon: { lib: "lucide", icon: ScrollText } },
      { href: "/settings/security", label: "Security", icon: { lib: "lucide", icon: Lock } },
      { href: "/developer-options/safety", label: "Safety", icon: { lib: "lucide", icon: Trash2 } },
    ],
  },
];

function pathActive(pathname: string, href: string) {
  // Exact match for hub roots so nested children don't all light up the Overview row.
  if (href === "/users" || href === "/treasury" || href === "/tax-commission") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function childActive(pathname: string, child: NavChild) {
  return pathActive(pathname, child.href) || (child.match ?? []).some((m) => pathActive(pathname, m));
}

function groupActive(pathname: string, children: NavChild[]) {
  return children.some((c) => childActive(pathname, c));
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function NavLink({
  href,
  label,
  icon,
  badgeCount = 0,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavIconDef;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={label}
      data-active={active}
      className="side-nav-link group flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{
        background: active ? "var(--admin-sidebar-active)" : "transparent",
        borderLeft: active ? `3px solid ${B.green}` : "3px solid transparent",
        color: active ? "var(--admin-sidebar-text-active)" : "var(--admin-sidebar-text)",
      }}
    >
      <AnimatedNavIcon def={icon} active={active} size={18} className={active ? "opacity-100" : "opacity-70"} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <AlertCountBadge count={badgeCount} />
    </Link>
  );
}

function NavDropdown({
  item,
  expanded,
  onToggle,
  onNavigate,
  groupBadge = 0,
  childBadge,
}: {
  item: Extract<NavItem, { type: "group" }>;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  groupBadge?: number;
  childBadge?: (href: string) => number;
}) {
  const pathname = usePathname();
  const active = groupActive(pathname, item.children);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        data-active={active}
        className="side-nav-link flex w-full items-center gap-3 rounded-xl px-3 py-2.5"
        style={{
          background: active ? "var(--admin-sidebar-active)" : "transparent",
          borderLeft: active ? `3px solid ${B.green}` : "3px solid transparent",
          color: active ? "var(--admin-sidebar-text-active)" : "var(--admin-sidebar-text)",
        }}
      >
        <AnimatedNavIcon def={item.icon} active={active} size={18} className={active ? "opacity-100" : "opacity-70"} />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{item.label}</span>
        <AlertCountBadge count={groupBadge} />
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-300", expanded && "rotate-180")}
          style={{ color: "var(--admin-sidebar-muted)" }}
        />
      </button>

      <div className="side-nav-collapse" data-open={expanded} inert={!expanded}>
        <div className="ml-3 space-y-0.5 border-l pl-2" style={{ borderColor: "var(--admin-sidebar-border)" }}>
          {item.children.map((child) => {
            const isChildActive = childActive(pathname, child);
            const count = childBadge?.(child.href) ?? 0;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                data-active={isChildActive}
                data-bar=""
                className="side-nav-link flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium"
                style={{
                  background: isChildActive ? "var(--admin-sidebar-active)" : "transparent",
                  color: isChildActive
                    ? "var(--admin-sidebar-text-active)"
                    : "var(--admin-sidebar-text)",
                }}
              >
                <AnimatedNavIcon def={child.icon} active={isChildActive} size={15} />
                <span className="min-w-0 flex-1 truncate">{child.label}</span>
                <AlertCountBadge count={count} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function badgeForHref(
  href: string,
  badges: {
    kycPending: number;
    kycPendingByRole: { super_distributor: number; distributor: number; retailer: number };
    fundRequestsPending: number;
    supportTicketsOpen: number;
    settlementBanksPending: number;
    panGapCount?: number;
  },
): number {
  switch (href) {
    case "/kyc":
    case "/users":
      return badges.kycPending + badges.settlementBanksPending;
    case "/users/super-distributors":
      return badges.kycPendingByRole.super_distributor;
    case "/users/distributors":
      return badges.kycPendingByRole.distributor;
    case "/users/retailers":
      return badges.kycPendingByRole.retailer + badges.settlementBanksPending;
    case "/settlements":
      return badges.settlementBanksPending;
    case "/treasury/bank":
      return badges.fundRequestsPending;
    case "/support-tickets":
      return badges.supportTicketsOpen;
    case "/tax-commission/pan-gaps":
      return badges.panGapCount ?? 0;
    default:
      return 0;
  }
}

function groupBadgeFor(
  id: string,
  badges: {
    kycPending: number;
    fundRequestsPending: number;
    supportTicketsOpen: number;
    settlementBanksPending: number;
    panGapCount?: number;
  },
): number {
  if (id === "agents") return badges.kycPending + badges.settlementBanksPending;
  if (id === "treasury") return badges.fundRequestsPending;
  if (id === "tax") return badges.panGapCount ?? 0;
  if (id === "support") return badges.supportTicketsOpen;
  return 0;
}

function SidebarNav({
  openGroups,
  onToggleGroup,
  onNavigate,
}: {
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  onNavigate?: () => void;
}) {
  const { badges } = useAdminAlerts();

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {(
        [
          { title: "Daily work", items: [...TOP_LINKS, ...AGENTS, ...TRANSACTIONS, ...SUPPORT] },
          { title: "Money", items: [...TREASURY, ...COMMISSION, ...TAX] },
          { title: "Setup", items: [...SERVICES, ...AGENT_MESSAGES, ...SYSTEM] },
        ] as const
      ).map((section) => (
        <div key={section.title}>
          <p
            className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--admin-sidebar-muted)" }}
          >
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) =>
              item.type === "link" ? (
                <NavLink
                  key={item.href}
                  {...item}
                  badgeCount={badgeForHref(item.href, badges)}
                  onNavigate={onNavigate}
                />
              ) : (
                <NavDropdown
                  key={item.id}
                  item={item}
                  expanded={!!openGroups[item.id]}
                  onToggle={() => onToggleGroup(item.id)}
                  onNavigate={onNavigate}
                  groupBadge={groupBadgeFor(item.id, badges)}
                  childBadge={(href) => badgeForHref(href, badges)}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarPanel({
  openGroups,
  onToggleGroup,
  onNavigate,
  userCard,
}: {
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  onNavigate?: () => void;
  userCard: ReactNode;
}) {
  return (
    <aside
      className="flex h-full w-64 flex-col transition-[background,box-shadow] duration-300"
      style={{
        background: "var(--admin-sidebar-bg)",
        boxShadow: "var(--admin-sidebar-shadow)",
      }}
    >
      <div
        className="flex items-center gap-2 overflow-hidden border-b px-4 py-4"
        style={{ minHeight: 88, borderColor: "var(--admin-sidebar-border)" }}
      >
        <AsanPayLockup width={168} light animate showTagline />
      </div>
      {userCard}
      <SidebarNav openGroups={openGroups} onToggleGroup={onToggleGroup} onNavigate={onNavigate} />
    </aside>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    agents: true,
    treasury: true,
    transactions: false,
    support: false,
    commission: true,
    tax: false,
    services: false,
    messages: false,
    system: false,
  });
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { isDark } = useAdminTheme();
  const name = user?.name ?? "Admin";
  const uid = user?.uid ?? "—";
  const av = initials(name);

  const ALL_NAV: NavItem[] = [
    ...TOP_LINKS,
    ...AGENTS,
    ...TRANSACTIONS,
    ...TREASURY,
    ...SUPPORT,
    ...COMMISSION,
    ...TAX,
    ...SERVICES,
    ...AGENT_MESSAGES,
    ...SYSTEM,
  ];

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of ALL_NAV) {
      if (item.type === "group" && groupActive(pathname, item.children)) {
        next[item.id] = true;
      }
    }
    if (Object.keys(next).length) setOpenGroups((g) => ({ ...g, ...next }));
    setDrawer(false);
    // ALL_NAV is module-level constant shape — only pathname drives reopen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggleGroup(id: string) {
    setOpenGroups((g) => ({ ...g, [id]: !g[id] }));
  }

  const userCard = (
    <div
      className="mx-3 mb-1 mt-4 rounded-xl p-3"
      style={{ background: "var(--admin-sidebar-user-bg)" }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{
            background: isDark ? "rgba(42,92,221,0.25)" : "rgba(255,255,255,0.2)",
            color: "var(--admin-sidebar-text-active)",
          }}
        >
          {av}
        </div>
        <div className="min-w-0">
          <div
            className="truncate text-[14px] font-semibold"
            style={{ color: "var(--admin-sidebar-text-active)" }}
          >
            {name}
          </div>
          <div className="text-[11px]" style={{ color: "var(--admin-sidebar-muted)" }}>
            {uid} · Platform Admin
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminAlertsProvider>
    <div className="min-h-screen overflow-x-hidden font-sans" style={{ background: B.bg }}>
      <div className="fixed left-0 top-0 z-40 hidden h-screen md:block">
        <SidebarPanel
          openGroups={openGroups}
          onToggleGroup={toggleGroup}
          userCard={userCard}
        />
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 shadow-2xl">
            <SidebarPanel
              openGroups={openGroups}
              onToggleGroup={toggleGroup}
              onNavigate={() => setDrawer(false)}
              userCard={userCard}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col overflow-x-hidden pb-20 md:ml-64 md:pb-0">
        <AdminHeader onOpenMobileNav={() => setDrawer(true)} />
        <main
          key={pathname}
          className="dash-page-animate flex-1 overflow-x-hidden"
        >
          {children}
        </main>
      </div>

      <MobileAdminNav />
    </div>
    </AdminAlertsProvider>
  );
}
