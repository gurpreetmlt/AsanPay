"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { apiErrorMessage, currentMonthYm } from "@/lib/taxCommissionUtils";

type PanGapRow = {
  userId: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  tdsAmount: string;
  grossAmount: string;
  creditCount: number;
  href: string;
};

type PanGaps = {
  month: string;
  summary: { agentCount: number; totalTds: string };
  rows: PanGapRow[];
};

export default function TaxCommissionPanGapsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [month, setMonth] = useState(currentMonthYm());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PanGaps | null>(null);

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
      setData(await fetchApi<PanGaps>("/admin/commission/pan-gaps", { month }));
    } catch (err) {
      setData(null);
      toast.error(apiErrorMessage(err, "Could not load PAN gaps"));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    void load();
  }, [hydrated, accessToken, load]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="tax" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            PAN gaps
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Agents who had TDS withheld in the month but have no PAN on file. Open the agent to add a PAN.
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Month
            </span>
            <input
              type="month"
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: B.badgeGrad }}
          >
            {loading ? "Loading…" : "Apply"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white px-4 py-4" style={{ borderColor: B.border }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              Agents without PAN
            </p>
            <p className="mt-2 text-2xl font-extrabold" style={{ color: "#B91C1C" }}>
              {loading ? "…" : (data?.summary.agentCount ?? 0)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white px-4 py-4" style={{ borderColor: B.border }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: B.muted }}>
              TDS withheld without PAN
            </p>
            <p className="mt-2 text-2xl font-extrabold" style={{ color: B.blue }}>
              {loading ? "…" : `₹${data?.summary.totalTds ?? "0.00"}`}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
          {loading ? (
            <p className="text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : !data?.rows.length ? (
            <p className="text-sm" style={{ color: B.muted }}>
              No PAN gaps for {data?.month ?? month}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="py-2 pr-3 font-semibold">Agent</th>
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    <th className="py-2 pr-3 font-semibold">KYC</th>
                    <th className="py-2 pr-3 font-semibold text-right">Credits</th>
                    <th className="py-2 pr-3 font-semibold text-right">Gross</th>
                    <th className="py-2 pr-3 font-semibold text-right">TDS</th>
                    <th className="py-2 font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.userId} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="py-3 pr-3">
                        <div className="font-semibold" style={{ color: B.blue }}>
                          {r.name}
                        </div>
                        <div className="text-xs" style={{ color: B.muted }}>
                          {r.uid} · {r.mobile}
                        </div>
                      </td>
                      <td className="py-3 pr-3">{ROLE_LABEL[r.role] ?? r.role}</td>
                      <td className="py-3 pr-3 capitalize">{r.kycStatus}</td>
                      <td className="py-3 pr-3 text-right">{r.creditCount}</td>
                      <td className="py-3 pr-3 text-right">₹{r.grossAmount}</td>
                      <td className="py-3 pr-3 text-right font-semibold" style={{ color: "#B91C1C" }}>
                        ₹{r.tdsAmount}
                      </td>
                      <td className="py-3">
                        <Link
                          href={r.href}
                          className="text-sm font-bold underline-offset-2 hover:underline"
                          style={{ color: B.blue }}
                        >
                          Open agent
                        </Link>
                      </td>
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
