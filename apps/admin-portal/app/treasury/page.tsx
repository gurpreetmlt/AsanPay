"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertTriangle, ChevronDown, Copy, Eye, Landmark, Plug, ReceiptText, RefreshCcw, Scale, X } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { bankCardCornerGlows, bankCardGlow, bankCardGradient, bankLogoUrl } from "@/lib/bankLogo";
import {
  providerBrand,
  providerCardCornerGlows,
  providerCardGlow,
  providerCardGradient,
  providerInitials,
  providerLogoUrl,
} from "@/lib/providerBrand";

interface BankCard {
  id: string;
  bankName: string;
  accountNumberLast4: string;
  ifsc: string;
  purpose: "collection" | "payout" | "ops";
  isActive: boolean;
  ledgerBalance: string;
}

type LiveBalance =
  | { status: "ok"; balance: string; hold: string | null; difference: string }
  | { status: "unsupported" }
  | { status: "error"; message: string };

interface ProviderCard {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  ledgerBalance: string;
  live: LiveBalance;
  lowBalanceThreshold: string | null;
  isLow: boolean;
}

interface TreasuryBreakdown {
  bankTotal: string;
  floatTotal: string;
  transitTotal: string;
  totalAssets: string;
  downlineLiability: string;
  solvent: boolean;
  banks: BankCard[];
  providers: ProviderCard[];
  lowBalanceCount: number;
  mismatchCount: number;
}

interface ProviderLedgerStrip {
  from: string;
  to: string;
  floatIn: string;
  floatOut: string;
  fees: string;
  walletImpact: string;
  netFloat: string;
  journalCount: number;
}

type Section = "banks" | "providers";
type LedgerPreset = "today" | "week" | "month";

const PURPOSE_LABEL: Record<BankCard["purpose"], string> = {
  collection: "Collection",
  payout: "Payout",
  ops: "Operations",
};

function formatInr(amount: string | number) {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function signedInr(amount: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const text = formatInr(Math.abs(n));
  if (n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return text;
}

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number) {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function ledgerRange(preset: LedgerPreset): { from: string; to: string } {
  const today = istToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: shiftDays(today, -((dow + 6) % 7)), to: today };
  }
  const [y, m] = today.split("-").map(Number) as [number, number];
  return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return ax?.response?.data?.message || ax?.message || fallback;
}

const cardShadow = "0 4px 20px rgba(15,23,42,0.04)";

export default function TreasuryPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [data, setData] = useState<TreasuryBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Section | null>(null);
  const [ledgerPreset, setLedgerPreset] = useState<LedgerPreset>("today");
  const [ledger, setLedger] = useState<ProviderLedgerStrip | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchApi<TreasuryBreakdown>("/admin/treasury/breakdown"));
    } catch (err) {
      toast.error(errMessage(err, "Could not load treasury balances. Check the backend is running."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async (preset: LedgerPreset) => {
    setLedgerLoading(true);
    try {
      const { from, to } = ledgerRange(preset);
      setLedger(await fetchApi<ProviderLedgerStrip>("/admin/treasury/provider-ledger", { from, to }));
    } catch (err) {
      toast.error(errMessage(err, "Could not load provider ledger strip."));
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
    void loadLedger(ledgerPreset);
  }, [hydrated, accessToken, router, load, loadLedger, ledgerPreset]);

  if (!hydrated || !accessToken) return null;

  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));
  const providerAlerts = (data?.lowBalanceCount ?? 0) + (data?.mismatchCount ?? 0);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="overview" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Treasury
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Real money the company holds — bank accounts and API provider wallets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/treasury/bank?tab=bank-entries"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "#16A34A" }}
            >
              <ReceiptText size={16} />
              Add bank entry
            </Link>
            <button
              type="button"
              onClick={() => {
                void load();
                void loadLedger(ledgerPreset);
              }}
              disabled={loading || ledgerLoading}
              className="flex items-center gap-1.5 rounded-xl border-2 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: B.border, color: B.muted }}
            >
              <RefreshCcw size={16} className={loading || ledgerLoading ? "animate-spin" : undefined} />
              Refresh
            </button>
          </div>
        </div>

        <section
          aria-label="Provider ledger"
          className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{ borderColor: B.border }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: B.border }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: B.blue }}>
                Provider ledger
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
                API wallet movement — separate from bank statement credits and debits
              </p>
            </div>
            <div className="inline-flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
              {(
                [
                  ["today", "Today"],
                  ["week", "This week"],
                  ["month", "This month"],
                ] as const
              ).map(([key, label]) => {
                const active = ledgerPreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLedgerPreset(key)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                    style={{
                      background: active ? B.badgeGrad : "transparent",
                      color: active ? "#fff" : B.muted,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  label: "In",
                  value: ledger ? `+${formatInr(ledger.floatIn)}` : "…",
                  sub: "Into API wallets (float credit)",
                  color: "#15803D",
                },
                {
                  label: "Out",
                  value: ledger ? `-${formatInr(ledger.floatOut)}` : "…",
                  sub: "Out of API wallets (float debit)",
                  color: B.danger,
                },
                {
                  label: "Fees",
                  value: ledger ? formatInr(ledger.fees) : "…",
                  sub: "Customer fee income on these rails",
                  color: B.blue,
                },
                {
                  label: "Wallet impact",
                  value: ledger ? signedInr(ledger.walletImpact) : "…",
                  sub: "Net taken from agent wallets (+ = paid out)",
                  color: ledger && Number(ledger.walletImpact) > 0 ? B.danger : "#15803D",
                },
              ] as const
            ).map((cell, i) => (
              <div
                key={cell.label}
                className={`min-w-0 px-4 py-3 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b xl:border-b-0" : ""} ${i === 2 ? "xl:border-r" : ""}`}
                style={{ borderColor: B.border }}
              >
                <p className="text-xs font-medium" style={{ color: B.muted }}>
                  {cell.label}
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: cell.color }}>
                  {cell.value}
                </p>
                <p className="truncate text-[11px]" style={{ color: B.muted }}>
                  {cell.sub}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-[11px]" style={{ borderColor: B.border, color: B.muted }}>
            <span>
              {ledger
                ? `Net float ${signedInr(ledger.netFloat)} · ${ledger.journalCount} journal${ledger.journalCount === 1 ? "" : "s"}`
                : ledgerLoading
                  ? "Loading…"
                  : "No provider movement loaded"}
            </span>
            <Link href="/treasury/bank?tab=activity" className="font-semibold hover:underline" style={{ color: B.blueLight }}>
              Open Activity (API)
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard
            icon={<Landmark size={14} style={{ color: B.blueLight }} />}
            label="Total bank balance"
            value={data ? formatInr(data.bankTotal) : "…"}
            footer={
              data
                ? `${data.banks.length} bank account${data.banks.length === 1 ? "" : "s"} · tap to view each`
                : "Loading…"
            }
            expanded={open === "banks"}
            onClick={() => toggle("banks")}
          />
          <SummaryCard
            icon={<Plug size={14} style={{ color: B.blueLight }} />}
            label="Total API wallets"
            value={data ? formatInr(data.floatTotal) : "…"}
            footer={
              data
                ? providerAlerts > 0
                  ? `${data.lowBalanceCount} low · ${data.mismatchCount} mismatch · tap to view`
                  : `${data.providers.length} provider${data.providers.length === 1 ? "" : "s"} · tap to view each`
                : "Loading…"
            }
            warn={providerAlerts > 0}
            expanded={open === "providers"}
            onClick={() => toggle("providers")}
          />
          <div
            className="rounded-2xl border bg-white p-5"
            style={{
              borderColor: data && !data.solvent ? B.danger : B.border,
              boxShadow: cardShadow,
            }}
          >
            <div
              className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
              style={{ color: B.muted }}
            >
              <Scale size={14} style={{ color: B.blueLight }} />
              Total treasury
            </div>
            <div className="mb-3 text-3xl font-bold leading-none tabular-nums" style={{ color: B.blue }}>
              {data ? formatInr(data.totalAssets) : "…"}
            </div>
            {data && !data.solvent ? (
              <div
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold"
                style={{ background: "#FEE2E2", color: "#991B1B" }}
              >
                <AlertTriangle size={13} />
                Short by {formatInr(Number(data.downlineLiability) - Number(data.totalAssets))} vs agent wallets
              </div>
            ) : (
              <div className="border-t pt-3 text-xs" style={{ borderColor: B.border, color: B.muted }}>
                {data
                  ? `In transit ${formatInr(data.transitTotal)} · Agent wallets ${formatInr(data.downlineLiability)}`
                  : "Loading…"}
              </div>
            )}
          </div>
        </div>

        {open === "banks" && data ? <BankList banks={data.banks} /> : null}
        {open === "providers" && data ? <ProviderList providers={data.providers} onSaved={() => void load()} /> : null}
      </div>
    </AdminShell>
  );
}

function SummaryCard(props: {
  icon: ReactNode;
  label: string;
  value: string;
  footer: string;
  expanded: boolean;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-expanded={props.expanded}
      className="cursor-pointer rounded-2xl border bg-white p-5 text-left transition-shadow hover:shadow-md"
      style={{
        borderColor: props.expanded ? B.blueLight : props.warn ? "#F59E0B" : B.border,
        boxShadow: cardShadow,
      }}
    >
      <div
        className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
        style={{ color: B.muted }}
      >
        {props.icon}
        <span className="flex-1">{props.label}</span>
        <ChevronDown
          size={16}
          className="transition-transform"
          style={{ transform: props.expanded ? "rotate(180deg)" : undefined }}
        />
      </div>
      <div className="mb-3 text-3xl font-bold leading-none tabular-nums" style={{ color: B.blue }}>
        {props.value}
      </div>
      <div
        className="flex items-center gap-1.5 border-t pt-3 text-xs"
        style={{
          borderColor: B.border,
          color: props.warn ? "#B45309" : B.muted,
        }}
      >
        {props.warn ? <AlertTriangle size={13} /> : null}
        {props.footer}
      </div>
    </button>
  );
}

function Badge({ tone, children }: { tone: "red" | "amber" | "green" | "grey"; children: ReactNode }) {
  const tones = {
    red: { background: "#FEE2E2", color: "#991B1B" },
    amber: { background: "#FEF3C7", color: "#92400E" },
    green: { background: "#DCFCE7", color: "#166534" },
    grey: { background: "#F1F5F9", color: "#475569" },
  } as const;
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={tones[tone]}>
      {children}
    </span>
  );
}

function BankList({ banks }: { banks: BankCard[] }) {
  if (banks.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-5 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        No bank accounts registered yet.{" "}
        <Link href="/treasury/bank?tab=bank-accounts" className="font-semibold underline" style={{ color: B.blueLight }}>
          Add a bank account in Bank &amp; deposits
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: B.muted }}>
        Ledger balance per bank. Live bank balance will appear here once the bank&apos;s balance API is connected.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {banks.map((b) => (
          <BankTile key={b.id} bank={b} />
        ))}
      </div>
    </div>
  );
}

const CARD_INK = "#0F172A";
const CARD_MUTED = "#64748B";

function BankLogoMark({ ifsc }: { ifsc: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white"
        style={{
          color: "#2A5CDD",
          boxShadow: "0 2px 8px rgba(11,42,154,0.08)",
        }}
      >
        <Landmark size={18} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={bankLogoUrl(ifsc)}
      alt=""
      width={44}
      height={44}
      className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1.5"
      style={{ boxShadow: "0 2px 10px rgba(11,42,154,0.1)" }}
      onError={() => setFailed(true)}
    />
  );
}

function BankTile({ bank: b }: { bank: BankCard }) {
  const corners = bankCardCornerGlows(b.ifsc);
  const [showDetails, setShowDetails] = useState(false);
  return (
    <>
      {showDetails ? <BankDetailsModal bank={b} onClose={() => setShowDetails(false)} /> : null}
      <div
        className="relative overflow-hidden rounded-[18px] border p-[18px]"
        style={{
          borderColor: corners.border,
          boxShadow: bankCardGlow(b.ifsc),
          opacity: b.isActive ? 1 : 0.7,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: bankCardGradient(b.ifsc) }}
        >
          <span
            className="absolute -right-7 -top-9 h-[120px] w-[120px] rounded-full"
            style={{ background: corners.topRight, opacity: 0.55 }}
          />
          <span
            className="absolute -bottom-10 -left-8 h-[110px] w-[110px] rounded-full"
            style={{ background: corners.bottomLeft, opacity: 0.4 }}
          />
        </div>
        <div className="relative">
          <div className="flex items-start gap-3">
            <BankLogoMark ifsc={b.ifsc} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold" style={{ color: CARD_INK }}>
                {b.bankName}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="grey">{PURPOSE_LABEL[b.purpose]}</Badge>
                {b.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white"
              style={{ color: "#2A5CDD", boxShadow: "0 2px 8px rgba(11,42,154,0.12)" }}
              aria-label={`View full details of ${b.bankName}`}
              title="View full details"
            >
              <Eye size={17} />
            </button>
          </div>
          <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: CARD_MUTED }}>
            Ledger balance
          </p>
          <div className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: CARD_INK }}>
            {formatInr(b.ledgerBalance)}
          </div>
          <p className="mt-3 font-mono text-[13px] font-bold tracking-wider" style={{ color: CARD_INK }}>
            A/c •• {b.accountNumberLast4}
          </p>
          <p className="mt-1 text-[12px] font-bold" style={{ color: "#2A5CDD" }}>
            IFSC · {b.ifsc}
          </p>
        </div>
      </div>
    </>
  );
}

interface BankDetails {
  id: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  holderName: string | null;
  accountType: string | null;
  branchName: string | null;
  branchCode: string | null;
  city: string | null;
  purpose: BankCard["purpose"];
  isActive: boolean;
  supportsVan: boolean;
  ledgerCode: string;
  ledgerBalance: string;
  createdAt: string;
}

function BankDetailsModal({ bank, onClose }: { bank: BankCard; onClose: () => void }) {
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi<BankDetails>(`/admin/treasury/banks/${bank.id}/details`)
      .then((d) => {
        if (!cancelled) setDetails(d);
      })
      .catch((err) => {
        if (!cancelled) setError(errMessage(err, `Could not load details for ${bank.bankName}`));
      });
    return () => {
      cancelled = true;
    };
  }, [bank.id, bank.bankName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const profile = (label: string, value: string | null, mono = false) =>
    value ? { label, value, copy: true, mono } : { label, value: "Not added", missing: true };
  const missingFields = details
    ? [
        !details.accountType && "Account type",
        !details.holderName && "Account name",
        !details.branchCode && "Branch code",
        !details.branchName && "Branch name",
        !details.city && "City / District",
      ].filter((x): x is string => !!x)
    : [];

  const rows: { label: string; value: string; copy?: boolean; mono?: boolean; missing?: boolean }[] = details
    ? [
        details.branchName
          ? { label: "Bank / Branch", value: `${details.bankName}, ${details.branchName}`, copy: true }
          : { label: "Bank / Branch", value: `${details.bankName}, branch not added`, missing: true },
        profile("Account type", details.accountType ? titleCase(details.accountType) : null),
        { label: "Account number", value: details.accountNumber, copy: true, mono: true },
        profile("Account name", details.holderName),
        { label: "IFSC", value: details.ifsc, copy: true, mono: true },
        profile("Branch code", details.branchCode, true),
        profile("City / District", details.city),
        { label: "Purpose", value: PURPOSE_LABEL[details.purpose] },
        { label: "Status", value: details.isActive ? "Active" : "Inactive" },
        { label: "Virtual accounts (VAN)", value: details.supportsVan ? "Supported" : "Not supported" },
        { label: "Ledger balance", value: formatInr(details.ledgerBalance) },
        { label: "Ledger account code", value: details.ledgerCode, copy: true, mono: true },
        { label: "Added on", value: new Date(details.createdAt).toLocaleDateString("en-IN") },
      ]
    : [];

  const copyAll = () => {
    if (!details) return;
    void copyText(
      [
        details.accountType ? `Account Type: ${titleCase(details.accountType)}` : null,
        `Account Number: ${details.accountNumber}`,
        details.holderName ? `Account Name: ${details.holderName}` : null,
        `Bank Name: ${details.bankName}`,
        `Bank IFSC: ${details.ifsc}`,
        details.branchCode ? `Branch Code: ${details.branchCode}` : null,
        details.branchName ? `Branch Name: ${details.branchName}` : null,
        details.city ? `City: ${details.city}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      "Bank details copied",
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${bank.bankName} details`}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5"
        style={{ boxShadow: "0 20px 50px rgba(15,23,42,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <BankLogoMark ifsc={bank.ifsc} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold" style={{ color: CARD_INK }}>
              {bank.bankName}
            </div>
            <div className="text-xs" style={{ color: CARD_MUTED }}>
              Company bank account details
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5"
            style={{ color: CARD_MUTED }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error ? (
          <p className="text-sm font-semibold" style={{ color: B.danger }}>
            {error}
          </p>
        ) : !details ? (
          <p className="text-sm" style={{ color: CARD_MUTED }}>
            Loading…
          </p>
        ) : (
          <>
            <dl
              className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border md:grid-cols-2"
              style={{ borderColor: B.border, background: B.border }}
            >
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-3 bg-white px-3 py-2.5">
                  <dt className="w-32 shrink-0 text-xs font-semibold" style={{ color: CARD_MUTED }}>
                    {r.label}
                  </dt>
                  <dd
                    className={`min-w-0 flex-1 break-all text-sm font-semibold ${r.mono ? "font-mono" : ""}`}
                    style={{ color: r.missing ? "#B45309" : CARD_INK }}
                  >
                    {r.value}
                  </dd>
                  {r.copy ? (
                    <button
                      type="button"
                      onClick={() => void copyText(r.value, `${r.label} copied`)}
                      className="rounded-lg p-1.5"
                      style={{ color: "#2A5CDD" }}
                      aria-label={`Copy ${r.label}`}
                      title={`Copy ${r.label}`}
                    >
                      <Copy size={15} />
                    </button>
                  ) : null}
                </div>
              ))}
              {rows.length % 2 === 1 ? <div className="hidden bg-white md:block" aria-hidden /> : null}
            </dl>
            {missingFields.length > 0 ? (
              <p
                className="mt-3 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: "#FEF3C7", color: "#92400E" }}
              >
                {missingFields.join(", ")} {missingFields.length === 1 ? "is" : "are"} not added, so the copy leaves{" "}
                {missingFields.length === 1 ? "it" : "them"} out. Add from Bank &amp; deposits → Bank accounts → Edit on
                this bank.
              </p>
            ) : null}
            <button
              type="button"
              onClick={copyAll}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: B.badgeGrad }}
            >
              <Copy size={15} /> Copy full bank details
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Could not copy — your browser blocked clipboard access");
  }
}

function ProviderList({ providers, onSaved }: { providers: ProviderCard[]; onSaved: () => void }) {
  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-5 text-sm" style={{ borderColor: B.border, color: B.muted }}>
        No API providers found. Add one in{" "}
        <Link href="/developer-options/providers" className="font-semibold underline" style={{ color: B.blueLight }}>
          Developer Options → Providers
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: B.muted }}>
        Ledger float is what our books say each provider holds. Live balance comes from the provider&apos;s own API
        where available — a difference means a debit or refund is missing on one side.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {providers.map((p) => (
          <ProviderTile key={`${p.id}:${p.lowBalanceThreshold ?? ""}`} provider={p} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}

function ProviderTile({ provider: p, onSaved }: { provider: ProviderCard; onSaved: () => void }) {
  const [limit, setLimit] = useState(p.lowBalanceThreshold ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = limit.trim();
    if (trimmed && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      toast.error("Low balance limit must be a rupee amount, e.g. 10000");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/treasury/providers/${p.id}/threshold`, {
        lowBalanceThreshold: trimmed || null,
      });
      toast.success(trimmed ? `Low balance limit saved for ${p.name}` : `Low balance limit removed for ${p.name}`);
      onSaved();
    } catch (err) {
      toast.error(errMessage(err, `Could not save the low balance limit for ${p.name}`));
    } finally {
      setSaving(false);
    }
  };

  const mismatch = p.live.status === "ok" && Number(p.live.difference) !== 0;
  const dirty = limit.trim() !== (p.lowBalanceThreshold ?? "");
  const corners = providerCardCornerGlows(p.code);

  return (
    <div
      className="relative overflow-hidden rounded-[18px] border p-[18px]"
      style={{
        borderColor: p.isLow || mismatch ? "#F59E0B" : corners.border,
        boxShadow: providerCardGlow(p.code),
        opacity: p.isActive ? 1 : 0.7,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: providerCardGradient(p.code) }}
      >
        <span
          className="absolute -right-7 -top-9 h-[120px] w-[120px] rounded-full"
          style={{ background: corners.topRight, opacity: 0.55 }}
        />
        <span
          className="absolute -bottom-10 -left-8 h-[110px] w-[110px] rounded-full"
          style={{ background: corners.bottomLeft, opacity: 0.4 }}
        />
      </div>
      <div className="relative">
        <div className="mb-3 flex items-start gap-3">
          <ProviderLogoMark code={p.code} name={p.name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold" style={{ color: CARD_INK }}>
              {p.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {!p.isActive ? <Badge tone="amber">Inactive</Badge> : null}
              {p.isLow ? <Badge tone="red">Low balance</Badge> : null}
              {mismatch ? <Badge tone="red">Mismatch</Badge> : null}
              {p.live.status === "ok" && !mismatch ? <Badge tone="green">Matched</Badge> : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: CARD_MUTED }}>
              Ledger float
            </div>
            <div className="text-xl font-extrabold tabular-nums" style={{ color: CARD_INK }}>
              {formatInr(p.ledgerBalance)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: CARD_MUTED }}>
              Live balance
            </div>
            {p.live.status === "ok" ? (
              <>
                <div className="text-xl font-extrabold tabular-nums" style={{ color: CARD_INK }}>
                  {formatInr(p.live.balance)}
                </div>
                {p.live.hold && Number(p.live.hold) > 0 ? (
                  <div className="text-[11px]" style={{ color: B.muted }}>
                    On hold {formatInr(p.live.hold)}
                  </div>
                ) : null}
              </>
            ) : p.live.status === "error" ? (
              <div className="text-xs font-semibold" style={{ color: B.danger }}>
                {p.live.message}
              </div>
            ) : (
              <div className="text-xs" style={{ color: B.muted }}>
                Not available — this provider has no balance API connected
              </div>
            )}
          </div>
        </div>

        {mismatch && p.live.status === "ok" ? (
          <div
            className="mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold"
            style={{ background: "#FEE2E2", color: "#991B1B" }}
          >
            <AlertTriangle size={13} />
            Live is {Number(p.live.difference) > 0 ? "higher" : "lower"} than ledger by{" "}
            {formatInr(Math.abs(Number(p.live.difference)))}
          </div>
        ) : null}

        <div className="mt-3 border-t pt-3" style={{ borderColor: corners.border }}>
          <label
            className="mb-1 block text-[11px] font-extrabold uppercase tracking-[0.12em]"
            style={{ color: CARD_MUTED }}
          >
            Low balance limit (₹)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="e.g. 10000 — leave empty for no warning"
              className="min-w-0 flex-1 rounded-lg border bg-white px-2.5 py-1.5 text-sm"
              style={{ borderColor: B.border }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: B.badgeGrad }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: B.muted }}>
            Warn when {p.live.status === "ok" ? "live" : "ledger"} balance drops below this amount.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderLogoMark({ code, name }: { code: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const url = providerLogoUrl(code);
  if (!url || failed) {
    const { primary, secondary } = providerBrand(code);
    return (
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-extrabold text-white"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${secondary})`,
          boxShadow: "0 2px 10px rgba(11,42,154,0.1)",
        }}
      >
        {providerInitials(name)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={44}
      height={44}
      className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1.5"
      style={{ boxShadow: "0 2px 10px rgba(11,42,154,0.1)" }}
      onError={() => setFailed(true)}
    />
  );
}
