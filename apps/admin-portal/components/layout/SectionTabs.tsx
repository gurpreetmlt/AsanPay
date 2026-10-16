"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { B } from "@/lib/brand";

export type SectionGroup = "overview" | "reports" | "taxCommission";

type SectionTab = { href: string; label: string };

const TAX_COMMISSION_CRUMB: Record<string, string> = {
  "/tax-commission": "Overview",
  "/tax-commission/schemes": "Schemes",
  "/tax-commission/overrides": "Overrides",
  "/tax-commission/tax": "Tax settings",
  "/tax-commission/registers": "Tax registers",
  "/tax-commission/payouts": "Payouts",
  "/tax-commission/what-if": "What-if",
  "/tax-commission/underwater": "Underwater",
  "/tax-commission/ca-pack": "CA pack",
  "/tax-commission/pan-gaps": "PAN gaps",
  "/tax-commission/rate-audit": "Rate audit",
  "/tax-commission/recon": "Recon",
  "/tax-commission/month-lock": "Month lock",
};

export const SECTION_GROUPS: Record<
  SectionGroup,
  { root: string; title: string; tabs: SectionTab[] }
> = {
  overview: {
    root: "Treasury",
    title: "Treasury overview",
    tabs: [
      { href: "/treasury", label: "Overview" },
      { href: "/wallet", label: "Company balance" },
      { href: "/float", label: "Float" },
    ],
  },
  reports: {
    root: "Treasury",
    title: "Reports & recon",
    tabs: [
      { href: "/ledger-reports", label: "Ledger reports" },
      { href: "/passbook", label: "Balance statement" },
      { href: "/reconciliation", label: "Txn reconciliation" },
      { href: "/recon-adjustments", label: "Recon adjustments" },
    ],
  },
  // Tabs removed — hub list on `/tax-commission` (sidebar is a single link).
  taxCommission: {
    root: "Tax & Commission",
    title: "Tax & Commission",
    tabs: [],
  },
};

export function SectionTabs({ group }: { group: SectionGroup }) {
  const pathname = usePathname();
  const { root, title, tabs } = SECTION_GROUPS[group];

  // Tax & Commission: breadcrumb only (back to hub). Tools are listed on the overview page.
  if (group === "taxCommission") {
    const pageLabel = TAX_COMMISSION_CRUMB[pathname] ?? "Overview";
    const onHub = pathname === "/tax-commission";
    return (
      <nav className="mb-2 text-xs" style={{ color: B.muted }}>
        {onHub ? (
          <span className="font-semibold" style={{ color: B.blue }}>
            Tax & Commission
          </span>
        ) : (
          <>
            <Link href="/tax-commission" className="font-medium hover:underline" style={{ color: B.muted }}>
              Tax & Commission
            </Link>
            <span className="mx-1.5">/</span>
            <span className="font-semibold" style={{ color: B.blue }}>
              {pageLabel}
            </span>
          </>
        )}
      </nav>
    );
  }

  return (
    <div>
      <nav className="mb-2 text-xs" style={{ color: B.muted }}>
        <span>{root}</span>
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
                  active
                    ? "scale-x-100 opacity-100"
                    : "scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-40"
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
