"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, History } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/passbook", label: "Passbook", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-card px-3 py-6">
      <div className="mb-8 px-3">
        <h1 className="bg-gradient-to-r from-[#c8102e] to-brand-600 bg-clip-text text-xl font-bold text-transparent">
          AsanPay
        </h1>
        <p className="text-xs text-gray-500">Partner Portal</p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
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
    </aside>
  );
}
