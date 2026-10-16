"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, Calculator, FileSpreadsheet, Percent, ScrollText } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type TdsSummary = {
  summary: { totalGross: string; totalTds: string; totalNet: string; count: number };
};

type DmtGstSummary = {
  summary: { totalFee: string; totalGst: string; count: number };
};

type PayoutSummary = {
  summary: { total: string; count: number };
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TaxCommissionOverviewPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const month = currentMonth();
  const today = todayYmd();
  const [loading, setLoading] = useState(true);
  const [tds, setTds] = useState<TdsSummary["summary"] | null>(null);
  const [gst, setGst] = useState<DmtGstSummary["summary"] | null>(null);
  const [payoutsMonth, setPayoutsMonth] = useState<PayoutSummary["summary"] | null>(null);
  const [payoutsToday, setPayoutsToday] = useState<PayoutSummary["summary"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = new Date(`${month}-01T00:00:00`);
      const [tdsRes, gstRes, payMonth, payToday] = await Promise.all([
        fetchApi<TdsSummary>("/admin/commission/tax-registers/tds", { month, limit: "1" }),
        fetchApi<DmtGstSummary>("/admin/commission/tax-registers/dmt-gst", {
          since: monthStart.toISOString(),
          limit: "1",
        }),
        fetchApi<PayoutSummary>("/admin/commission/payouts", {
          since: monthStart.toISOString(),
          limit: "1",
        }),
        fetchApi<PayoutSummary>("/admin/commission/payouts", {
          since: new Date(`${today}T00:00:00`).toISOString(),
          limit: "1",
        }),
      ]);
      setTds(tdsRes.summary);
      setGst(gstRes.summary);
      setPayoutsMonth(payMonth.summary);
      setPayoutsToday(payToday.summary);
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [month, today]);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  if (!hydrated || !accessToken) return null;

  const links = [
    {
      href: "/tax-commission/schemes",
      label: "Schemes",
      hint: "Role slabs + preview",
      icon: Percent,
    },
    {
      href: "/tax-commission/overrides",
      label: "Overrides",
      hint: "Per-agent rates",
      icon: Percent,
    },
    {
      href: "/tax-commission/tax",
      label: "Tax settings",
      hint: "TDS % · fee GST flags",
      icon: Calculator,
    },
    {
      href: "/tax-commission/registers",
      label: "Tax registers",
      hint: "TDS + DMT GST CSV",
      icon: FileSpreadsheet,
    },
    {
      href: "/tax-commission/payouts",
      label: "Payouts",
      hint: "Commission ledger",
      icon: ScrollText,
    },
    {
      href: "/tax-commission/what-if",
      label: "What-if",
      hint: "Gross / TDS / Net by role",
      icon: Calculator,
    },
    {
      href: "/tax-commission/underwater",
      label: "Underwater",
      hint: "Scheme vs provider pool",
      icon: AlertTriangle,
    },
  ] as const;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Tax & Commission
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Agent commercials, TDS, and fee GST — separate from Treasury cash.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Commission paid today",
              value: loading ? "…" : `₹${payoutsToday?.total ?? "0"}`,
              sub: loading ? "" : `${payoutsToday?.count ?? 0} credits`,
            },
            {
              label: `Commission paid (${month})`,
              value: loading ? "…" : `₹${payoutsMonth?.total ?? "0"}`,
              sub: loading ? "" : `${payoutsMonth?.count ?? 0} credits`,
            },
            {
              label: `TDS this month (${month})`,
              value: loading ? "…" : `₹${tds?.totalTds ?? "0"}`,
              sub: loading ? "" : `Gross ₹${tds?.totalGross ?? "0"}`,
            },
            {
              label: `DMT fee GST (${month})`,
              value: loading ? "…" : `₹${gst?.totalGst ?? "0"}`,
              sub: loading ? "" : `${gst?.count ?? 0} txns`,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border bg-white px-4 py-4 shadow-sm"
              style={{ borderColor: B.border }}
            >
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {c.label}
              </p>
              <p className="mt-2 text-2xl font-extrabold" style={{ color: B.blue }}>
                {c.value}
              </p>
              {c.sub ? (
                <p className="mt-1 text-xs font-semibold" style={{ color: B.muted }}>
                  {c.sub}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center gap-3 rounded-2xl border bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderColor: B.border }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105"
                style={{ background: "#EEF2FF", color: B.blueLight }}
              >
                <l.icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold" style={{ color: B.blue }}>
                  {l.label}
                </span>
                <span className="block text-xs" style={{ color: B.muted }}>
                  {l.hint}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
