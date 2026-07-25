"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "react-hot-toast";
import { LayoutDashboard, LayoutGrid, History, UserCircle, LogOut, Fingerprint, Banknote, ListChecks, Network, ShieldCheck, PiggyBank, LifeBuoy } from "lucide-react";
import clsx from "clsx";
import { ROLE_LABELS } from "@asanpay/shared-types";
import { useAuthStore } from "@/lib/store";
import { brand } from "@/lib/brand";
import { isRetailerRole } from "@/lib/roles";

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const retailer = user ? isRetailerRole(user.role) : false;

  const navItems = retailer
    ? [
        { href: "/dashboard", label: "Services", icon: LayoutGrid },
        { href: "/aeps", label: "AePS", icon: Fingerprint },
        { href: "/dmt", label: "DMT", icon: Banknote },
        { href: "/passbook", label: "History", icon: History },
        { href: "/support", label: "Support", icon: LifeBuoy },
        { href: null, label: "Account", icon: UserCircle },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/network", label: "Network", icon: Network },
        { href: "/action-queue", label: "Action Queue", icon: ListChecks },
        { href: "/kyc-assistant", label: "KYC Assistant", icon: ShieldCheck },
        { href: "/float-planner", label: "Float & Earnings", icon: PiggyBank },
        { href: "/passbook", label: "Passbook", icon: History },
        { href: "/support", label: "Support", icon: LifeBuoy },
      ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-card px-3 py-6">
      <div className="mb-8 px-3">
        <h1 className="bg-gradient-to-r from-brand-700 to-green-600 bg-clip-text text-xl font-bold text-transparent">
          {brand.name}
        </h1>
        <p className="text-xs text-gray-500">
          {user ? ROLE_LABELS[user.role] : "Agent Portal"}
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = item.href !== null && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          if (item.href === null) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => toast(`${item.label} — coming soon`, { icon: "🚧" })}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-gray-600 transition hover:bg-surface"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-600"
                  : "border-transparent text-gray-600 hover:bg-surface",
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 px-1 pt-6">
        {user && (
          <p className="truncate px-2 text-xs text-gray-500">
            {user.name} · {user.uid}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            void import("@/lib/logout").then(({ logoutEverywhere }) =>
              logoutEverywhere().then(() => {
                window.location.href = "/login";
              }),
            );
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-surface"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
