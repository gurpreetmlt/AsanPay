"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, IndianRupee, Landmark, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { AlertCountBadge } from "@/components/layout/AlertCountBadge";
import { FundRequestsPanel } from "@/components/bank-deposits/FundRequestsPanel";
import { ReconciliationPanel } from "@/components/bank-deposits/ReconciliationPanel";
import { BankEntriesPanel, type OpenReconciliation } from "@/components/bank-deposits/BankEntriesPanel";
import { BankingPanel } from "@/components/bank-deposits/BankingPanel";
import { ActivityPanel } from "@/components/bank-deposits/ActivityPanel";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type TabKey =
  | "fund-requests"
  | "reconciliation"
  | "bank-entries"
  | "activity"
  | "bank-accounts"
  | "virtual-accounts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "fund-requests", label: "Fund requests" },
  { key: "reconciliation", label: "Reconciliation" },
  { key: "bank-entries", label: "Bank entries" },
  { key: "activity", label: "Activity" },
  { key: "bank-accounts", label: "Bank accounts" },
  { key: "virtual-accounts", label: "Virtual accounts" },
];

interface CashPicture {
  bank: string | null;
  books: string;
  difference: string | null;
  pendingAmount: string;
  asOf: string | null;
  banksWithStatement: number;
  activeBanks: number;
}

interface SummaryBank {
  bankName: string;
  last4: string;
  balance: string;
  statementBalance?: string | null;
  statementAsOf?: string | null;
  statementDifference?: string | null;
}

interface Summary {
  pendingFundRequests: number;
  unmatchedLines: number;
  creditedToday: string;
  bankTotal: string;
  cashPicture?: CashPicture;
  banks: SummaryBank[];
}

function inr(v: string | number | null | undefined, decimals = 2) {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  const neg = s.startsWith("-");
  const n = Number(neg ? s.slice(1) : s);
  if (!Number.isFinite(n)) return "—";
  const text = `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
  return neg ? `-${text}` : text;
}

function signedInr(v: string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  if (v.startsWith("-")) return inr(v);
  if (Number(v) === 0) return inr(v);
  return `+${inr(v)}`;
}

function asOfLabel(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y}`;
}

function CashCell({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs font-medium" style={{ color: B.muted }}>
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: valueColor ?? B.blue }}>
        {value}
      </p>
      <p className="truncate text-[11px]" style={{ color: B.muted }}>
        {sub}
      </p>
    </div>
  );
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

  // history.replaceState stays on the client (Next syncs useSearchParams from it); router.replace
  // round-trips to the server and silently does nothing if that request fails.
  const goTab = useCallback(
    (key: TabKey) => window.history.replaceState(null, "", `${pathname}?tab=${key}`),
    [pathname],
  );

  const openReconciliation = useCallback<OpenReconciliation>(
    ({ bankAccountId, date, lineId }) => {
      const q = new URLSearchParams({ tab: "reconciliation", bank: bankAccountId, from: date, to: date });
      if (lineId) q.set("line", lineId);
      window.history.replaceState(null, "", `${pathname}?${q.toString()}`);
    },
    [pathname],
  );

  if (!hydrated || !accessToken) return null;

  const pending = summary?.pendingFundRequests ?? 0;
  const unmatched = summary?.unmatchedLines ?? 0;
  const credited = summary ? Number(summary.creditedToday) : 0;
  const banks = summary?.banks ?? [];
  const bankSub =
    banks.length === 1 ? `${banks[0]!.bankName} ••${banks[0]!.last4}` : `${banks.length} company bank accounts`;
  const picture = summary?.cashPicture;
  const diff = picture?.difference ?? null;
  const diffZero = diff !== null && !diff.startsWith("-") && Number(diff) === 0;
  const pendingOpen = unmatched > 0 || (picture ? Number(picture.pendingAmount) > 0 : false);
  const asOf = asOfLabel(picture?.asOf ?? null);
  const missingStatements =
    picture && picture.activeBanks > 0 && picture.banksWithStatement < picture.activeBanks
      ? picture.activeBanks - picture.banksWithStatement
      : 0;

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

        <section
          aria-label="Cash picture"
          className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{ borderColor: B.border }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                Cash picture
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                Latest statement balance against the AsanPay ledger. Reconciliation is not required.
              </p>
            </div>
            <button
              type="button"
              onClick={() => goTab("reconciliation")}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-[#EEF3FF]"
              style={{ color: B.blueLight }}
            >
              Open Reconciliation
            </button>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4">
            <div className="border-b xl:border-b-0 xl:border-r" style={{ borderColor: B.border }}>
              <CashCell
                label="Bank"
                value={picture?.bank ? inr(picture.bank) : "—"}
                sub={
                  picture?.bank
                    ? asOf
                      ? `Statement as of ${asOf}`
                      : "Latest imported statement"
                    : "Upload a statement to see the bank balance"
                }
              />
            </div>
            <div className="border-b xl:border-b-0 xl:border-r" style={{ borderColor: B.border }}>
              <CashCell
                label="Books"
                value={picture?.bank ? inr(picture.books) : summary ? inr(summary.bankTotal) : "—"}
                sub={
                  !picture?.bank
                    ? "Company bank ledger"
                    : missingStatements
                      ? `Ledger for ${picture.banksWithStatement} of ${picture.activeBanks} banks`
                      : "Active bank ledger"
                }
              />
            </div>
            <div className="border-b xl:border-b-0 xl:border-r" style={{ borderColor: B.border }}>
              <CashCell
                label="Difference"
                value={signedInr(diff)}
                valueColor={diff === null ? B.muted : diffZero ? "#15803D" : B.danger}
                sub={diff === null ? "Needs a statement balance" : diffZero ? "Bank and books match" : "Statement minus books"}
              />
            </div>
            <div>
              <CashCell
                label="Pending"
                value={picture ? inr(picture.pendingAmount) : "—"}
                valueColor={picture ? (pendingOpen ? "#D97706" : "#15803D") : B.muted}
                sub={
                  unmatched
                    ? `${unmatched} unmatched credit${unmatched === 1 ? "" : "s"}`
                    : "No unmatched statement credits"
                }
              />
            </div>
          </div>
          {missingStatements ? (
            <p className="border-t px-4 py-2 text-[11px]" style={{ borderColor: B.border, color: B.muted }}>
              {missingStatements} active bank{missingStatements === 1 ? " has" : "s have"} no statement balance yet. Difference uses only banks that do.
            </p>
          ) : null}
          {banks.length > 1 ? (
            <ul className="grid gap-2 border-t p-3 sm:grid-cols-2" style={{ borderColor: B.border }}>
              {banks.map((b, i) => {
                const rowDiff = b.statementBalance != null ? signedInr(b.statementDifference ?? null) : "—";
                const rowAsOf = asOfLabel(b.statementAsOf ?? null);
                return (
                  <li
                    key={`${b.bankName}-${b.last4}-${i}`}
                    className="rounded-xl border px-3 py-2 text-xs"
                    style={{ borderColor: B.border }}
                  >
                    <p className="font-semibold" style={{ color: B.blue }}>
                      {b.bankName} ••{b.last4}
                    </p>
                    <p className="mt-0.5 tabular-nums" style={{ color: B.muted }}>
                      Bank {b.statementBalance ? inr(b.statementBalance) : "—"}
                      {" · "}
                      Books {inr(b.balance)}
                      {" · "}
                      Diff {rowDiff}
                      {rowAsOf ? ` · ${rowAsOf}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

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
                  aria-current={active ? "page" : undefined}
                  className={`group relative my-1 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-out active:scale-95 ${
                    active
                      ? "font-bold text-[#2A5CDD]"
                      : "font-medium text-[var(--admin-muted)] hover:-translate-y-px hover:bg-[#EEF3FF] hover:text-[#2A5CDD]"
                  }`}
                >
                  {t.label}
                  {t.key === "fund-requests" ? <AlertCountBadge count={pending} /> : null}
                  <span
                    className={`absolute inset-x-2 -bottom-1 h-[3px] origin-center rounded-t-full transition-all duration-300 ease-out ${
                      active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-40"
                    }`}
                    style={{ background: B.blueLight }}
                  />
                </button>
              );
            })}
          </div>

          {tab === "fund-requests" ? (
            <FundRequestsPanel onChanged={loadSummary} onGoToReconciliation={() => goTab("reconciliation")} />
          ) : tab === "reconciliation" ? (
            <ReconciliationPanel onChanged={loadSummary} />
          ) : tab === "bank-entries" ? (
            <BankEntriesPanel onOpenReconciliation={openReconciliation} />
          ) : tab === "activity" ? (
            <ActivityPanel />
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
