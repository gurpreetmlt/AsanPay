"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Download } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { MonthField } from "@/components/ui/DateField";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { apiErrorMessage, currentMonthYm, downloadCsv } from "@/lib/taxCommissionUtils";

type CaPack = {
  month: string;
  generatedAt: string;
  locked: boolean;
  summary: {
    tds: { totalGross: string; totalTds: string; totalNet: string; count: number; agentCount: number };
    dmtGst: { totalFee: string; totalGst: string; count: number };
    panGapAgents: number;
    panGapTds: string;
    truncated: boolean;
  };
  tdsRows: unknown[];
  dmtGstRows: unknown[];
  panGapRows: unknown[];
  files: {
    tds: { filename: string; csv: string };
    dmtGst: { filename: string; csv: string };
    summary: { filename: string };
    zip: { filename: string };
  };
};

export default function TaxCommissionCaPackPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [month, setMonth] = useState(currentMonthYm());
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<CaPack | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast.error("Pick a month in YYYY-MM format");
      return;
    }
    setLoading(true);
    try {
      setPack(await fetchApi<CaPack>("/admin/commission/ca-month-pack", { month }));
    } catch (err) {
      setPack(null);
      toast.error(apiErrorMessage(err, "Could not build the CA month pack"));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  if (!hydrated || !accessToken) return null;

  const files = pack
    ? [
        { key: "tds", label: "TDS register", rows: pack.tdsRows.length, ...pack.files.tds },
        { key: "dmt", label: "DMT fee GST register", rows: pack.dmtGstRows.length, ...pack.files.dmtGst },
      ]
    : [];

  function downloadSummary() {
    if (!pack) return;
    const blob = new Blob([JSON.stringify({ month: pack.month, generatedAt: pack.generatedAt, locked: pack.locked, summary: pack.summary }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = pack.files.summary.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadAll() {
    if (!pack) return;
    files.forEach((f, i) => setTimeout(() => downloadCsv(f.filename, f.csv), i * 400));
    setTimeout(downloadSummary, files.length * 400);
  }

  const cards = pack
    ? [
        { label: "TDS withheld", value: `₹${pack.summary.tds.totalTds}`, sub: `Gross ₹${pack.summary.tds.totalGross} · Net ₹${pack.summary.tds.totalNet}` },
        { label: "TDS agents", value: String(pack.summary.tds.agentCount), sub: `${pack.summary.tds.count} register rows` },
        { label: "DMT fee GST", value: `₹${pack.summary.dmtGst.totalGst}`, sub: `Fee ₹${pack.summary.dmtGst.totalFee} · ${pack.summary.dmtGst.count} txns` },
        {
          label: "PAN gaps",
          value: String(pack.summary.panGapAgents),
          sub: `TDS ₹${pack.summary.panGapTds} withheld without PAN`,
        },
      ]
    : [];

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="tax" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            CA month pack
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            TDS and DMT fee GST registers for one month, ready to hand to your CA.
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <div className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Month
            </span>
            <MonthField value={month} onChange={setMonth} />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.badgeGrad }}
          >
            {loading ? "Loading…" : "Build pack"}
          </button>
          {pack ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{
                background: pack.locked ? "#DCFCE7" : "#FEF3C7",
                color: pack.locked ? "#166534" : "#92400E",
              }}
            >
              {pack.locked ? "Month locked" : "Month not locked"}
            </span>
          ) : null}
        </div>

        {pack?.summary.truncated ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This month has more than 10,000 rows in a register, so the CSV is truncated. Contact engineering
            before filing.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(loading && !pack ? [] : cards).map((c) => (
            <div key={c.label} className="rounded-2xl border bg-white px-4 py-4 shadow-sm" style={{ borderColor: B.border }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
                {c.label}
              </p>
              <p className="mt-2 text-2xl font-extrabold" style={{ color: B.blue }}>
                {c.value}
              </p>
              <p className="mt-1 text-xs font-semibold" style={{ color: B.muted }}>
                {c.sub}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold" style={{ color: B.blue }}>
              Files
            </h2>
            <button
              type="button"
              disabled={!pack}
              onClick={downloadAll}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: B.green }}
            >
              <Download size={15} />
              Download all
            </button>
          </div>
          {!pack ? (
            <p className="text-sm" style={{ color: B.muted }}>
              {loading ? "Loading…" : "Pick a month and build the pack to see files."}
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: B.border }}>
              {files.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: B.blue }}>
                      {f.label}
                    </p>
                    <p className="font-mono text-xs" style={{ color: B.muted }}>
                      {f.filename} · {f.rows} row{f.rows === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(f.filename, f.csv)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                    style={{ background: B.green }}
                  >
                    <Download size={14} />
                    Download CSV
                  </button>
                </li>
              ))}
              <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: B.blue }}>
                    Pack summary
                  </p>
                  <p className="font-mono text-xs" style={{ color: B.muted }}>
                    {pack.files.summary.filename}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSummary}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
                  style={{ background: B.green }}
                >
                  <Download size={14} />
                  Download JSON
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
