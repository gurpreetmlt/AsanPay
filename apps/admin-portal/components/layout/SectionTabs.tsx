"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { B } from "@/lib/brand";

export type SectionGroup = "overview" | "reports";

type SectionTab = { href: string; label: string };

export const SECTION_GROUPS: Record<SectionGroup, { title: string; tabs: SectionTab[] }> = {
  overview: {
    title: "Treasury overview",
    tabs: [
      { href: "/treasury", label: "Overview" },
      { href: "/wallet", label: "Company balance" },
      { href: "/float", label: "Float" },
    ],
  },
  reports: {
    title: "Reports & recon",
    tabs: [
      { href: "/ledger-reports", label: "Ledger reports" },
      { href: "/passbook", label: "Balance statement" },
      { href: "/reconciliation", label: "Txn reconciliation" },
      { href: "/recon-adjustments", label: "Recon adjustments" },
    ],
  },
};

export function SectionTabs({ group }: { group: SectionGroup }) {
  const pathname = usePathname();
  const { title, tabs } = SECTION_GROUPS[group];

  return (
    <div>
      <nav className="mb-2 text-xs" style={{ color: B.muted }}>
        <span>Treasury</span>
        <span className="mx-1.5">/</span>
        <span className="font-semibold" style={{ color: B.blue }}>
          {title}
        </span>
      </nav>
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl border bg-white px-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        style={{ borderColor: B.border }}
      >
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`group relative my-1 inline-flex items-center whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out active:scale-95 ${
                active
                  ? "font-bold text-[#2A5CDD]"
                  : "font-medium text-[var(--admin-muted)] hover:-translate-y-px hover:bg-[#EEF3FF] hover:text-[#2A5CDD]"
              }`}
            >
              {t.label}
              <span
                className={`absolute inset-x-2 -bottom-1 h-[3px] origin-center rounded-t-full transition-all duration-300 ease-out ${
                  active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-40"
                }`}
                style={{ background: B.blueLight }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
