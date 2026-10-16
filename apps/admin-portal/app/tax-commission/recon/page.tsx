"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { apiErrorMessage, formatWhen, monthStartYmd, todayYmd } from "@/lib/taxCommissionUtils";
import { DateField } from "@/components/ui/DateField";

type ReconGap = {
  commissionLedgerId: string;
  transactionId: string;
  txnRef: string | null;
  beneficiaryUid: string | null;
  beneficiaryName: string | null;
  ledgerNet: string;
  walletCredit: string;
  reversedAt: string | null;
  createdAt: string;
  kind: string;
  note: string;
};

type Recon = {
  from: string;
  to: string;
  summary: {
    ledgerRows: number;
    ledgerActiveGross: string;
    ledgerActiveTds: string;
    ledgerActiveNet: string;
    ledgerClawedBackNet: string;
    walletCommissionCredits: string;
    difference: string;
    mismatchRows: number;
    walletWithoutLedgerGroups: number;
    walletWithoutLedgerTotal: string;
    balanced: boolean;
  };
  gaps: ReconGap[];
  walletWithoutLedger: {
    ledgerGroupId: string;
    transactionId: string | null;
    description: string | null;
    createdAt: string;
    creditTotal: string;
  }[];
  gapsTruncated: boolean;
};

const KIND_LABEL: Record<string, string> = {
  amount_mismatch: "Amount mismatch",
  missing_wallet_link: "No wallet link",
  missing_wallet_credit: "No wallet credit",
};

export default function TaxCommissionReconPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [from, setFrom] = useState(monthStartYmd());
  const [to, setTo] = useState(todayYmd());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Recon | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    if (from > to) {
      toast.error("From date must be on or before the To date");
      return;
    }
    setLoading(true);
    try {
      setData(await fetchApi<Recon>("/admin/commission/recon", { from, to }));
    } catch (err) {
      setData(null);
      toast.error(apiErrorMessage(err, "Could not load commission recon"));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  if (!hydrated || !accessToken) return null;

  const s = data?.summary;
  const cards = [
    { label: "Ledger rows", value: s ? String(s.ledgerRows) : "…", sub: s ? `Gross ₹${s.ledgerActiveGross} · TDS ₹${s.ledgerActiveTds}` : "" },
    { label: "Ledger net (active)", value: s ? `₹${s.ledgerActiveNet}` : "…", sub: s ? `Clawed back ₹${s.ledgerClawedBackNet}` : "" },
    { label: "Wallet commission credits", value: s ? `₹${s.walletCommissionCredits}` : "…", sub: "" },
    {
      label: "Difference",
      value: s ? `₹${s.difference}` : "…",
      sub: s ? `${s.mismatchRows} mismatched · ${s.walletWithoutLedgerGroups} wallet-only` : "",
    },
  ];

  const thead = "border-b text-xs uppercase tracking-wide";

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Commission recon
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Commission ledger net compared with wallet credits actually posted to agents.
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <div className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              From (IST)
            </span>
            <DateField
              value={from}
              rangePeer={to}
              rangeRole="start"
              max={to || undefined}
              onChange={setFrom}
            />
          </div>
          <div className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              To (IST)
            </span>
            <DateField
              value={to}
              rangePeer={from}
              rangeRole="end"
              min={from || undefined}
              onChange={setTo}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.badgeGrad }}
          >
            {loading ? "Loading…" : "Apply"}
          </button>
          {s ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{
                background: s.balanced ? "#DCFCE7" : "#FEE2E2",
                color: s.balanced ? "#166534" : "#991B1B",
              }}
            >
              {s.balanced ? "Balanced" : "Gaps found"}
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-2xl border bg-white px-4 py-4 shadow-sm" style={{ borderColor: B.border }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {c.label}
              </p>
              <p
                className="mt-2 text-2xl font-extrabold"
                style={{ color: c.label === "Difference" && s && !s.balanced ? "#B91C1C" : B.blue }}
              >
                {loading ? "…" : c.value}
              </p>
              {c.sub ? (
                <p className="mt-1 text-xs font-semibold" style={{ color: B.muted }}>
                  {c.sub}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        {data?.gapsTruncated ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Showing the latest 200 gaps only. Narrow the date range to see the rest.
          </p>
        ) : null}

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Ledger vs wallet gaps
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !data?.gaps.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No ledger rows differ from wallet credits for {data?.from ?? from} to {data?.to ?? to}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className={thead} style={{ borderColor: B.border, color: B.muted }}>
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Txn</th>
                    <th className="py-2 pr-3 font-semibold">Agent</th>
                    <th className="py-2 pr-3 font-semibold text-right">Ledger net</th>
                    <th className="py-2 pr-3 font-semibold text-right">Wallet credit</th>
                    <th className="py-2 pr-3 font-semibold">Issue</th>
                    <th className="py-2 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gaps.map((g) => (
                    <tr key={g.commissionLedgerId} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="whitespace-nowrap py-3 pr-3" style={{ color: B.muted }}>
                        {formatWhen(g.createdAt)}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{g.txnRef ?? g.transactionId.slice(0, 8)}</td>
                      <td className="py-3 pr-3">
                        <div>{g.beneficiaryName ?? "—"}</div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {g.beneficiaryUid ?? ""}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right">₹{g.ledgerNet}</td>
                      <td className="py-3 pr-3 text-right">₹{g.walletCredit}</td>
                      <td className="py-3 pr-3 font-semibold" style={{ color: "#B91C1C" }}>
                        {KIND_LABEL[g.kind] ?? g.kind}
                        {g.reversedAt ? " (clawed back)" : ""}
                      </td>
                      <td className="py-3" style={{ color: B.muted }}>
                        {g.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Wallet commission credits with no ledger row
          </h2>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !data?.walletWithoutLedger.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Every wallet commission credit in this range has a commission ledger row.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className={thead} style={{ borderColor: B.border, color: B.muted }}>
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Ledger group</th>
                    <th className="py-2 pr-3 font-semibold">Description</th>
                    <th className="py-2 font-semibold text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.walletWithoutLedger.map((w) => (
                    <tr key={w.ledgerGroupId} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="whitespace-nowrap py-3 pr-3" style={{ color: B.muted }}>
                        {formatWhen(w.createdAt)}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs">{w.ledgerGroupId.slice(0, 8)}</td>
                      <td className="py-3 pr-3">{w.description ?? "—"}</td>
                      <td className="py-3 text-right font-semibold">₹{w.creditTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
