"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ChevronDown,
  Landmark,
  Plug,
  RefreshCcw,
  Scale,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

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

type Section = "banks" | "providers";

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

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
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

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  if (!hydrated || !accessToken) return null;

  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));
  const providerAlerts = (data?.lowBalanceCount ?? 0) + (data?.mismatchCount ?? 0);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
              Treasury
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
              Real money the company holds — bank accounts and API provider wallets
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border-2 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Refresh
          </button>
        </div>

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
            style={{ borderColor: data && !data.solvent ? B.danger : B.border, boxShadow: cardShadow }}
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
        {open === "providers" && data ? (
          <ProviderList providers={data.providers} onSaved={() => void load()} />
        ) : null}
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
        style={{ borderColor: B.border, color: props.warn ? "#B45309" : B.muted }}
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
        <Link href="/banking" className="font-semibold underline" style={{ color: B.blueLight }}>
          Add a bank account in Banking
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
          <div
            key={b.id}
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: B.border, boxShadow: cardShadow }}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold" style={{ color: B.blue }}>
                {b.bankName}
              </span>
              <Badge tone="grey">{PURPOSE_LABEL[b.purpose]}</Badge>
              {!b.isActive ? <Badge tone="amber">Inactive</Badge> : null}
            </div>
            <div className="mb-3 text-xs" style={{ color: B.muted }}>
              A/c ••{b.accountNumberLast4} · {b.ifsc}
            </div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: B.blue }}>
              {formatInr(b.ledgerBalance)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
          <ProviderTile key={p.id} provider={p} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}

function ProviderTile({ provider: p, onSaved }: { provider: ProviderCard; onSaved: () => void }) {
  const [limit, setLimit] = useState(p.lowBalanceThreshold ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLimit(p.lowBalanceThreshold ?? "");
  }, [p.lowBalanceThreshold]);

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

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: p.isLow || mismatch ? "#F59E0B" : B.border, boxShadow: cardShadow }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={{ color: B.blue }}>
          {p.name}
        </span>
        {!p.isActive ? <Badge tone="amber">Inactive</Badge> : null}
        {p.isLow ? <Badge tone="red">Low balance</Badge> : null}
        {mismatch ? <Badge tone="red">Mismatch</Badge> : null}
        {p.live.status === "ok" && !mismatch ? <Badge tone="green">Matched</Badge> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Ledger float
          </div>
          <div className="text-xl font-bold tabular-nums" style={{ color: B.blue }}>
            {formatInr(p.ledgerBalance)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: B.muted }}>
            Live balance
          </div>
          {p.live.status === "ok" ? (
            <>
              <div className="text-xl font-bold tabular-nums" style={{ color: B.blue }}>
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

      <div className="mt-3 border-t pt-3" style={{ borderColor: B.border }}>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider" style={{ color: B.muted }}>
          Low balance limit (₹)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="e.g. 10000 — leave empty for no warning"
            className="min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm"
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
  );
}
