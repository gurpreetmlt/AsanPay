"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Crown, Network, Store, Tags, Percent, Plug, ScrollText, Scale, ShieldAlert, Wrench, LifeBuoy, IndianRupee } from "lucide-react";
import { AsanPayLogo } from "@/components/brand/Logo";
import { AnimatedNavIcon } from "@/components/ui/AnimatedNavIcon";
import type { NavIconDef } from "@/lib/iconTypes";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { MobileAdminNav } from "@/components/layout/MobileAdminNav";
import { useAdminTheme } from "@/components/theme/AdminThemeProvider";
import { cn } from "@/lib/utils";

type NavChild = { href: string; label: string; icon: NavIconDef };
type NavItem =
  | { type: "link"; href: string; label: string; icon: NavIconDef }
  | { type: "group"; id: string; label: string; icon: NavIconDef; children: NavChild[] };

const OPERATIONS: NavItem[] = [
  { type: "link", href: "/dashboard", label: "Dashboard", icon: { lib: "md", name: "MdDashboard" } },
  {
    type: "group",
    id: "users",
    label: "Network",
    icon: { lib: "fa", name: "FaUsers" },
    children: [
      { href: "/users", label: "All Agents", icon: { lib: "fa", name: "FaUsers" } },
      { href: "/users/super-distributors", label: "Super Distributor", icon: { lib: "lucide", icon: Crown } },
      { href: "/users/distributors", label: "Distributor", icon: { lib: "lucide", icon: Network } },
      { href: "/users/retailers", label: "Retailer", icon: { lib: "lucide", icon: Store } },
    ],
  },
  { type: "link", href: "/kyc", label: "KYC Queue", icon: { lib: "md", name: "MdVerifiedUser" } },
  { type: "link", href: "/fund-requests", label: "Fund requests", icon: { lib: "lucide", icon: IndianRupee } },
  { type: "link", href: "/transactions", label: "All Transactions", icon: { lib: "fa", name: "FaExchangeAlt" } },
];

/** Company money: funding, statements, provider match — kept together so ops never hunt. */
const TREASURY: NavItem[] = [
  {
    type: "group",
    id: "treasury",
    label: "Treasury & Wallet",
    icon: { lib: "md", name: "MdAccountBalanceWallet" },
    children: [
      { href: "/wallet", label: "Company wallet", icon: { lib: "md", name: "MdAccountBalanceWallet" } },
      { href: "/fund-requests", label: "Fund requests", icon: { lib: "lucide", icon: IndianRupee } },
      { href: "/passbook", label: "Wallet statement", icon: { lib: "fa", name: "FaHistory" } },
      { href: "/reconciliation", label: "Txn reconciliation", icon: { lib: "lucide", icon: Scale } },
    ],
  },
];

const SITE_CONTROL: NavItem[] = [
  {
    type: "group",
    id: "site",
    label: "Platform Control",
    icon: { lib: "fa", name: "FaGlobe" },
    children: [
      { href: "/site-control", label: "Service Badges", icon: { lib: "lucide", icon: Tags } },
      { href: "/commission", label: "Commissions", icon: { lib: "lucide", icon: Percent } },
      { href: "/risk-alerts", label: "Risk Alerts", icon: { lib: "lucide", icon: ShieldAlert } },
      { href: "/recovery-workbench", label: "Recovery Workbench", icon: { lib: "lucide", icon: Wrench } },
      { href: "/support-tickets", label: "Support Tickets", icon: { lib: "lucide", icon: LifeBuoy } },
    ],
  },
];

const DEVELOPER_OPTIONS: NavItem[] = [
  {
    type: "group",
    id: "developer",
    label: "Developer Options",
    icon: { lib: "lucide", icon: Plug },
    children: [
      { href: "/developer-options/providers", label: "Providers", icon: { lib: "lucide", icon: Plug } },
      { href: "/audit-logs", label: "Audit Log", icon: { lib: "lucide", icon: ScrollText } },
    ],
  },
];

function pathActive(pathname: string, href: string) {
  if (href === "/users") return pathname === "/users";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupActive(pathname: string, children: NavChild[]) {
  return children.some((c) => pathActive(pathname, c.href));
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
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavIconDef;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={label}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
      style={{
        background: active ? "var(--admin-sidebar-active)" : "transparent",
        borderLeft: active ? `3px solid ${B.green}` : "3px solid transparent",
        color: active ? "var(--admin-sidebar-text-active)" : "var(--admin-sidebar-text)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--admin-sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <AnimatedNavIcon def={icon} active={active} size={18} className={active ? "opacity-100" : "opacity-70"} />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function NavDropdown({
  item,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: Extract<NavItem, { type: "group" }>;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = groupActive(pathname, item.children);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
        style={{
          background: active ? "var(--admin-sidebar-active)" : "transparent",
          borderLeft: active ? `3px solid ${B.green}` : "3px solid transparent",
          color: active ? "var(--admin-sidebar-text-active)" : "var(--admin-sidebar-text)",
        }}
      >
        <AnimatedNavIcon def={item.icon} active={active} size={18} className={active ? "opacity-100" : "opacity-70"} />
        <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200", expanded && "rotate-180")}
          style={{ color: "var(--admin-sidebar-muted)" }}
        />
      </button>

      {expanded && (
        <div className="ml-3 space-y-0.5 border-l pl-2" style={{ borderColor: "var(--admin-sidebar-border)" }}>
          {item.children.map((child) => {
            const childActive = pathActive(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition"
                style={{
                  background: childActive ? "var(--admin-sidebar-active)" : "transparent",
                  color: childActive
                    ? "var(--admin-sidebar-text-active)"
                    : "var(--admin-sidebar-text)",
                }}
              >
                <AnimatedNavIcon def={child.icon} active={childActive} size={15} />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
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
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {(
        [
          { title: "Full Control", items: OPERATIONS },
          { title: "Treasury", items: TREASURY },
          { title: "Platform", items: SITE_CONTROL },
          { title: "Developer", items: DEVELOPER_OPTIONS },
        ] as const
      ).map((section) => (
        <div key={section.title}>
          <p
            className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--admin-sidebar-muted)" }}
          >
            {section.title}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) =>
              item.type === "link" ? (
                <NavLink key={item.href} {...item} onNavigate={onNavigate} />
              ) : (
                <NavDropdown
                  key={item.id}
                  item={item}
                  expanded={!!openGroups[item.id]}
                  onToggle={() => onToggleGroup(item.id)}
                  onNavigate={onNavigate}
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
        style={{ minHeight: 68, borderColor: "var(--admin-sidebar-border)" }}
      >
        <AsanPayLogo width={152} variant="light" />
      </div>
      {userCard}
      <SidebarNav openGroups={openGroups} onToggleGroup={onToggleGroup} onNavigate={onNavigate} />
    </aside>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    users: true,
    treasury: true,
    site: false,
  });
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { isDark } = useAdminTheme();
  const name = user?.name ?? "Admin";
  const uid = user?.uid ?? "—";
  const av = initials(name);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of [...OPERATIONS, ...TREASURY, ...SITE_CONTROL, ...DEVELOPER_OPTIONS]) {
      if (item.type === "group" && groupActive(pathname, item.children)) {
        next[item.id] = true;
      }
    }
    if (Object.keys(next).length) setOpenGroups((g) => ({ ...g, ...next }));
    setDrawer(false);
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
            className="truncate text-sm font-semibold"
            style={{ color: "var(--admin-sidebar-text-active)" }}
          >
            {name}
          </div>
          <div className="text-xs" style={{ color: "var(--admin-sidebar-muted)" }}>
            {uid} · Platform Admin
          </div>
        </div>
      </div>
    </div>
  );

  return (
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
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>

      <MobileAdminNav />
    </div>
  );
}
