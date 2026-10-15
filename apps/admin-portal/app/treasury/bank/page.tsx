"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, IndianRupee, Landmark, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { FundRequestsPanel } from "@/components/bank-deposits/FundRequestsPanel";
import { ReconciliationPanel } from "@/components/bank-deposits/ReconciliationPanel";
import { BankEntriesPanel } from "@/components/bank-deposits/BankEntriesPanel";
import { BankingPanel } from "@/components/bank-deposits/BankingPanel";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type TabKey = "fund-requests" | "reconciliation" | "bank-entries" | "bank-accounts" | "virtual-accounts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "fund-requests", label: "Fund requests" },
  { key: "reconciliation", label: "Reconciliation" },
  { key: "bank-entries", label: "Bank entries" },
  { key: "bank-accounts", label: "Bank accounts" },
  { key: "virtual-accounts", label: "Virtual accounts" },
];

interface Summary {
  pendingFundRequests: number;
  unmatchedLines: number;
  creditedToday: string;
  bankTotal: string;
  banks: { bankName: string; last4: string; balance: string }[];
}

function inr(v: string, decimals = 2) {
  const n = Number(v);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
}

function StatCard({
  icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  tint: { bg: string; fg: string };
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
      style={{ borderColor: B.border }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full"
        style={{ background: tint.bg, opacity: 0.55 }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: tint.bg, color: tint.fg }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: B.muted }}>
            {label}
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: B.blue }}>
            {value}
          </p>
          <p className="truncate text-[11px]" style={{ color: B.muted }}>
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}

function BankDepositsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [summary, setSummary] = useState<Summary | null>(null);

  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "fund-requests";

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchApi<Summary>("/banking/summary"));
    } catch {
      // Cards are informational; the tab content still works without them.
    }
  }, []);

  useEffect(() => {
    if (hydrated && accessToken) void loadSummary();
  }, [hydrated, accessToken, loadSummary]);

  const goTab = useCallback(
    (key: TabKey) => router.replace(`${pathname}?tab=${key}`, { scroll: false }),
    [router, pathname],
  );

  if (!hydrated || !accessToken) return null;

  const pending = summary?.pendingFundRequests ?? 0;
  const unmatched = summary?.unmatchedLines ?? 0;
  const credited = summary ? Number(summary.creditedToday) : 0;
  const banks = summary?.banks ?? [];
  const bankSub =
    banks.length === 1 ? `${banks[0]!.bankName} ••${banks[0]!.last4}` : `${banks.length} company bank accounts`;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div>
          <nav className="mb-2 text-xs" style={{ color: B.muted }}>
            <Link href="/treasury" className="hover:underline">
              Treasury
            </Link>
            <span className="mx-1.5">/</span>
            <span>Bank &amp; deposits</span>
          </nav>
          <h1 className="text-2xl font-bold md:text-3xl" style={{ color: B.blue }}>
            Bank &amp; deposits
          </h1>
          <p className="mt-1 text-sm" style={{ color: B.muted }}>
            Company bank money, agent deposits and statement matching in one place
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<TriangleAlert size={18} />}
            tint={{ bg: "#FEF3C7", fg: "#D97706" }}
            label="Pending fund requests"
            value={String(pending)}
            sub={pending ? "Awaiting review" : "Nothing waiting"}
          />
          <StatCard
            icon={<ArrowLeftRight size={18} />}
            tint={{ bg: "#E0E9FD", fg: B.blueLight }}
            label="Unmatched bank lines"
            value={String(unmatched)}
            sub={unmatched ? "Credits not tied to any record" : "Statements are clear"}
          />
          <StatCard
            icon={<IndianRupee size={18} />}
            tint={{ bg: "#DCFCE7", fg: "#16A34A" }}
            label="Credited today"
            value={inr(String(credited), 0)}
            sub={credited ? "Via fund requests" : "No credits yet"}
          />
          <StatCard
            icon={<Landmark size={18} />}
            tint={{ bg: "#E0E9FD", fg: B.blueLight }}
            label="Bank balance"
            value={inr(summary?.bankTotal ?? "0")}
            sub={summary ? bankSub : "Loading…"}
          />
        </div>

        <div
          className="overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{ borderColor: B.border }}
        >
          <div className="flex gap-1 overflow-x-auto border-b px-2" style={{ borderColor: B.border }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => goTab(t.key)}
                  className="relative inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-3.5 text-sm transition"
                  style={{ color: active ? B.blueLight : B.muted, fontWeight: active ? 700 : 500 }}
                >
                  {t.label}
                  {t.key === "fund-requests" && pending > 0 ? (
                    <span
                      className="rounded-full px-1.5 text-[10px] font-bold"
                      style={{ background: "#DBEAFE", color: B.blueLight }}
                    >
                      {pending}
                    </span>
                  ) : null}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full" style={{ background: B.blueLight }} />
                  ) : null}
                </button>
              );
            })}
          </div>

          {tab === "fund-requests" ? (
            <FundRequestsPanel onChanged={loadSummary} onGoToReconciliation={() => goTab("reconciliation")} />
          ) : tab === "reconciliation" ? (
            <ReconciliationPanel onChanged={loadSummary} />
          ) : tab === "bank-entries" ? (
            <BankEntriesPanel />
          ) : tab === "bank-accounts" ? (
            <BankingPanel section="accounts" />
          ) : (
            <BankingPanel section="van" />
          )}
        </div>
      </div>
    </AdminShell>
  );
}

export default function BankDepositsPage() {
  return (
    <Suspense fallback={null}>
      <BankDepositsContent />
    </Suspense>
  );
}
