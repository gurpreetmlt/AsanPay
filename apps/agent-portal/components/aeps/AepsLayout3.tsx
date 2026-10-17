"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  Check,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Search,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { B } from "@/lib/brand";
import { aepsBankLogoUrl } from "@/lib/bankLogo";
import { downloadBrandedExcel, openBrandedPdf, type BrandedReport } from "@/lib/brandedExport";
import { downloadCsv } from "@/components/reports/reportUtils";

export type AepsLayout3Tab = "Withdraw" | "Mini Statement" | "Deposit" | "Balance Enquiry";

type Bank = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  letter: string;
};

type Props = {
  tab: AepsLayout3Tab;
  onTabChange: (t: AepsLayout3Tab) => void;
  banks: Bank[];
  selectedBank: Bank | null;
  onSelectBank: (bank: Bank) => void;
  onViewAllBanks: () => void;
  aadhaar: string;
  onAadhaarChange: (v: string) => void;
  aadhaarVisible: boolean;
  onToggleAadhaarVisible: () => void;
  mobile: string;
  onMobileChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  showAmount: boolean;
  consent: boolean;
  onConsentChange: (v: boolean) => void;
  deviceLabel: string;
  scannerReady: boolean;
  scannerLooking: boolean;
  onRetryScanner: () => void;
  onChangeDevice: () => void;
  scanning: boolean;
  onScan: () => void;
};

type HistoryRange = "today" | "yesterday" | "7d" | "month";
type HistoryStatus = "all" | "success" | "failed" | "pending";

type DemoRow = {
  id: string;
  txnId: string;
  time: string;
  aadhaarLast4: string;
  type: string;
  bank: string;
  amount: string;
  status: "success" | "failed" | "pending";
};

const TABS: AepsLayout3Tab[] = ["Withdraw", "Mini Statement", "Deposit", "Balance Enquiry"];
const QUICK = [1000, 2000, 5000, 10000];

const DEMO_ROWS: DemoRow[] = [
  {
    id: "1",
    txnId: "TXN98231",
    time: "12:40 PM, Today",
    aadhaarLast4: "4821",
    type: "Cash Withdraw",
    bank: "SBI",
    amount: "₹2,000",
    status: "success",
  },
  {
    id: "2",
    txnId: "TXN98110",
    time: "11:05 AM, Today",
    aadhaarLast4: "9033",
    type: "Balance Enquiry",
    bank: "HDFC",
    amount: "—",
    status: "success",
  },
  {
    id: "3",
    txnId: "TXN97902",
    time: "Yesterday",
    aadhaarLast4: "1144",
    type: "Cash Withdraw",
    bank: "PNB",
    amount: "₹5,000",
    status: "failed",
  },
  {
    id: "4",
    txnId: "TXN97855",
    time: "Yesterday",
    aadhaarLast4: "6620",
    type: "Mini Statement",
    bank: "Axis",
    amount: "—",
    status: "pending",
  },
];

function formatAadhaar(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 12);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskAadhaar(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 4) return d;
  return "XXXX XXXX " + d.slice(-4);
}

function RoundBankIcon({ bank, size = 44 }: { bank: Bank; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = aepsBankLogoUrl(bank);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- CDN bank logo
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-white object-contain"
        style={{
          width: size,
          height: size,
          padding: size * 0.16,
          boxShadow: "0 0 0 1px rgba(15,23,42,0.08)",
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: bank.color,
        fontSize: size * 0.36,
        boxShadow: "0 0 0 1px rgba(15,23,42,0.08)",
      }}
    >
      {bank.letter}
    </div>
  );
}

function StatusPill({ status }: { status: DemoRow["status"] }) {
  const map = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    failed: "bg-red-50 text-red-700 ring-red-200",
    pending: "bg-amber-50 text-amber-800 ring-amber-200",
  } as const;
  const label = status === "success" ? "Success" : status === "failed" ? "Failed" : "Pending";
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1", map[status])}>
      {label}
    </span>
  );
}

/** Segmented control — white elevated pill on soft track (date-filter style). */
function SegmentTabs({
  value,
  onChange,
}: {
  value: AepsLayout3Tab;
  onChange: (t: AepsLayout3Tab) => void;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full p-1"
      style={{ background: "#E8EEF8" }}
      role="tablist"
      aria-label="AePS service type"
    >
      {TABS.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              active
                ? "bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
                : "bg-transparent hover:bg-white/50",
            )}
            style={{ color: B.blueLight }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

export function AepsLayout3({
  tab,
  onTabChange,
  banks,
  selectedBank,
  onSelectBank,
  onViewAllBanks,
  aadhaar,
  onAadhaarChange,
  aadhaarVisible,
  onToggleAadhaarVisible,
  mobile,
  onMobileChange,
  amount,
  onAmountChange,
  showAmount,
  consent,
  onConsentChange,
  deviceLabel,
  scannerReady,
  scannerLooking,
  onRetryScanner,
  onChangeDevice,
  scanning,
  onScan,
}: Props) {
  const [range, setRange] = useState<HistoryRange>("today");
  const [statusFilter, setStatusFilter] = useState<HistoryStatus>("all");
  const [query, setQuery] = useState("");

  const stripBanks = banks.slice(0, 8);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEMO_ROWS.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.txnId.toLowerCase().includes(q) ||
        r.aadhaarLast4.includes(q) ||
        r.bank.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter]);

  function buildReport(): BrandedReport {
    return {
      title: "Recent AePS transactions",
      fileName: "aeps-history-layout3-preview",
      meta: [
        { label: "Range", value: range },
        { label: "Note", value: "Sample preview — live AePS history next" },
      ],
      summary: [{ label: "Rows", value: String(rows.length), tone: "neutral" }],
      columns: [
        { label: "Txn ID / Time" },
        { label: "Customer Aadhaar" },
        { label: "Service type" },
        { label: "Bank" },
        { label: "Amount", align: "right" },
        { label: "Status" },
      ],
      rows: rows.map((r) => [
        { text: r.txnId, sub: r.time },
        { text: `XXXX-XXXX-${r.aadhaarLast4}`, mono: true },
        { text: r.type },
        { text: r.bank },
        { text: r.amount, align: "right" },
        {
          text: r.status === "success" ? "Success" : r.status === "failed" ? "Failed" : "Pending",
          tone: r.status === "success" ? "approved" : r.status === "failed" ? "rejected" : "requested",
        },
      ]),
    };
  }

  return (
    <div className="space-y-5">
      {/* Setup card */}
      <section
        className="overflow-hidden rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: B.border }}
      >
        <div className="space-y-5 p-5">
          <SegmentTabs value={tab} onChange={onTabChange} />

          {/* Banks — round icons */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Select bank</p>
              <button
                type="button"
                onClick={onViewAllBanks}
                className="text-xs font-bold hover:underline"
                style={{ color: B.blueLight }}
              >
                View All Banks
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {stripBanks.map((bank) => {
                const active = selectedBank?.id === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => onSelectBank(bank)}
                    className={clsx(
                      "flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition",
                      active
                        ? "border-blue-500 bg-blue-50/80 shadow-sm shadow-blue-100"
                        : "border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50",
                    )}
                  >
                    <span className="relative">
                      <RoundBankIcon bank={bank} size={48} />
                      {active ? (
                        <span
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-white"
                          style={{ background: B.blue }}
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={clsx(
                        "w-full truncate text-center text-[11px] leading-tight",
                        active ? "font-bold" : "font-medium text-gray-600",
                      )}
                      style={active ? { color: B.blue } : undefined}
                    >
                      {bank.shortName.replace(/\.\.\.$/, "")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fields + biometric panel */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Aadhaar or VID number
                  </label>
                  <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={aadhaarVisible ? formatAadhaar(aadhaar) : maskAadhaar(aadhaar)}
                      onChange={(e) => onAadhaarChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      placeholder="XXXX XXXX XXXX"
                      className="flex-1 bg-transparent text-sm font-medium outline-none"
                    />
                    <button
                      type="button"
                      onClick={onToggleAadhaarVisible}
                      className="ml-2 text-gray-400 hover:text-gray-600"
                      aria-label={aadhaarVisible ? "Hide Aadhaar" : "Show Aadhaar"}
                    >
                      {aadhaarVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Mobile number
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={mobile}
                    onChange={(e) => onMobileChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Mobile Number"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-300"
                  />
                </div>
              </div>

              {showAmount ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Amount to {tab === "Deposit" ? "deposit" : "withdraw"}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => onAmountChange(e.target.value.replace(/\D/g, ""))}
                    placeholder={tab === "Deposit" ? "Amount to Deposit" : "Amount to Withdraw"}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm font-medium outline-none focus:border-blue-300"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => onAmountChange(String(a))}
                        className={clsx(
                          "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                          amount === String(a)
                            ? "border-blue-400 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        ₹{a.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-2.5 select-none pt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => onConsentChange(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span className="text-xs leading-relaxed text-gray-600">
                  I (the customer) accept{" "}
                  <span className="font-semibold text-blue-700 underline">Aadhaar Consent</span> and
                  have read the{" "}
                  <span className="font-semibold text-blue-700 underline">AePS Advisory</span>
                </span>
              </label>
            </div>

            <div
              className="flex flex-col justify-between gap-3 rounded-2xl border p-4"
              style={{ borderColor: `${B.blueLight}33`, background: `${B.blue}08` }}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Biometric device</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{deviceLabel}</p>
                <p className="mt-1 text-xs font-semibold">
                  {scannerLooking ? (
                    <span className="text-blue-700">Connecting…</span>
                  ) : scannerReady ? (
                    <span className="text-emerald-700">L1 Ready</span>
                  ) : (
                    <span className="text-amber-700">Scanner not found</span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onChangeDevice}
                    className="text-xs font-bold hover:underline"
                    style={{ color: B.blueLight }}
                  >
                    Change Device
                  </button>
                  {!scannerReady && !scannerLooking ? (
                    <button
                      type="button"
                      onClick={onRetryScanner}
                      className="text-xs font-bold text-amber-800 hover:underline"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
              <PrimaryButton
                type="button"
                variant="primary"
                loading={scanning}
                disabled={scanning || !scannerReady}
                onClick={onScan}
                showArrow={false}
                className="w-full"
              >
                <Fingerprint size={18} />
                Scan Finger &amp; Submit
              </PrimaryButton>
            </div>
          </div>
        </div>
      </section>

      {/* History */}
      <section
        className="rounded-2xl border bg-white shadow-sm"
        style={{ borderColor: B.border }}
      >
        <div
          className="flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
          style={{ borderColor: B.border }}
        >
          <div>
            <h3 className="text-base font-extrabold text-gray-900">Recent AePS Transactions</h3>
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              Sample preview — live rows will replace this next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as HistoryRange)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
            >
              <option value="today">Show: Today</option>
              <option value="yesterday">Show: Yesterday</option>
              <option value="7d">Show: Last 7 days</option>
              <option value="month">Show: This month</option>
            </select>
            <div className="relative min-w-[160px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Txn"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as HistoryStatus)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="all">Status: All</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <ExportMenu
              disabled={rows.length === 0}
              onPdf={() => {
                if (!openBrandedPdf(buildReport())) {
                  toast.error("Allow pop-ups for this site to export the PDF");
                }
              }}
              onExcel={() => downloadBrandedExcel(buildReport())}
              onCsv={() => {
                downloadCsv(
                  "aeps-history-layout3-preview.csv",
                  ["Txn ID", "Time", "Aadhaar", "Type", "Bank", "Amount", "Status"],
                  rows.map((r) => [
                    r.txnId,
                    r.time,
                    `XXXX-XXXX-${r.aadhaarLast4}`,
                    r.type,
                    r.bank,
                    r.amount,
                    r.status,
                  ]),
                );
              }}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr
                className="border-b bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                style={{ borderColor: B.border }}
              >
                <th className="px-5 py-3">Txn ID / Time</th>
                <th className="px-3 py-3">Customer Aadhaar</th>
                <th className="px-3 py-3">Service type</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-slate-50/80"
                  style={{ borderColor: B.border }}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-gray-900">{r.txnId}</p>
                    <p className="text-xs text-gray-500">{r.time}</p>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs text-gray-600">
                    XXXX-XXXX-{r.aadhaarLast4}
                  </td>
                  <td className="px-3 py-3.5 font-semibold text-gray-800">{r.type}</td>
                  <td className="px-3 py-3.5 text-gray-700">{r.bank}</td>
                  <td className="px-3 py-3.5 font-bold tabular-nums text-gray-900">{r.amount}</td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => toast("Receipt preview — live PDF next")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      <FileText size={13} />
                      {r.status === "success" ? "Print Receipt" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm font-medium text-gray-500">
                    No matching transactions. Clear filters and try again.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
