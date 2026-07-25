"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "react-hot-toast";
import { LayoutGrid, History, HelpCircle, UserCircle } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Services", icon: LayoutGrid },
  { href: "/passbook", label: "History", icon: History },
  { href: null, label: "Help", icon: HelpCircle },
  { href: null, label: "Account", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border-subtle bg-card px-3 py-6">
      <div className="mb-8 px-3">
        <h1 className="bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-xl font-bold text-transparent">
          AsanPay
        </h1>
        <p className="text-xs font-medium text-gray-500">वो Business बढ़े</p>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href !== null && pathname === item.href;
          const Icon = item.icon;

          if (item.href === null) {
            return (
              <button
                key={item.label}
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

      <div className="mt-auto space-y-3 px-1 pt-6">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            toast("Mobile app — coming soon", { icon: "📱" });
          }}
          className="flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 hover:bg-surface"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-900 text-[10px] font-bold text-white">
            ▶
          </span>
          <span className="leading-tight">
            <span className="block text-[10px] text-gray-500">GET APP ON</span>
            <span className="block text-xs font-semibold text-gray-800">Google Play</span>
          </span>
        </a>
        <p className="px-1 text-[10px] leading-tight text-gray-400">
          © Copyright 2026 AsanPay Limited. All rights reserved.
        </p>
      </div>
    </aside>
  );
}
