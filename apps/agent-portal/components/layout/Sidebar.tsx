"use client";

/**
 * Legacy compact sidebar — production nav is AppShell SidebarContent only.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { ROLE_LABELS } from "@asanpay/shared-types";
import { useAuthStore } from "@/lib/store";
import { brand } from "@/lib/brand";
import { CHILD_ROLE, ROLE_LABEL, isRetailerRole } from "@/lib/roles";

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const retailer = user ? isRetailerRole(user.role) : false;
  const childRole = user ? CHILD_ROLE[user.role] : null;
  const childLabel = childRole ? ROLE_LABEL[childRole] : "Agent";

  const navItems = retailer
    ? [
        { href: "/dashboard", label: "Services" },
        { href: "/wallet", label: "Balance" },
        { href: "/passbook", label: "History" },
        { href: "/support", label: "Support" },
        { href: "/settings", label: "Settings" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/network", label: `My ${childLabel}s` },
        { href: "/wallet", label: "Balance" },
        { href: "/support", label: "Support" },
        { href: "/settings", label: "Settings" },
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
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
