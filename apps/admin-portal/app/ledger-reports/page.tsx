"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Scale } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface LedgerHealth {
  trialBalanceOk: boolean;
  solvencyOk: boolean;
  solvency?: { assets: string; owed: string; shortfall: string };
  floatCoverage: {
    floatBalance: string;
    transitBalance: string;
    openTransfers: number;
    openAmount: string;
  };
  unmatchedBankCredits: number;
  openFindings: Array<{
    checkName: string;
    severity: string;
    fingerprint: string;
    details: Record<string, unknown>;
  }>;
  ranAt: string;
}

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

export default function AdminLedgerReportsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [health, setHealth] = useState<LedgerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await fetchApi<LedgerHealth>("/admin/ledger/health"));
    } catch (err) {
      toast.error(errMessage(err, "Failed to load ledger health"));
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

  async function persistRun() {
    setRunning(true);
    try {
      await api.post("/admin/ledger/recon/run");
      toast.success("Reconciliation findings persisted");
      await load();
    } catch (err) {
      toast.error(errMessage(err, "Reconciliation run failed"));
    } finally {
      setRunning(false);
    }
  }

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
              style={{ background: B.badgeGrad }}
            >
              <Scale size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
                Ledger reports
              </h1>
              <p className="text-sm" style={{ color: B.muted }}>
                Trial balance, solvency, float coverage — live checks
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={running}
            onClick={() => void persistRun()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: B.badgeGrad }}
          >
            Persist recon run
          </button>
        </div>

        {loading || !health ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                title="Trial balance"
                value={health.trialBalanceOk ? "OK" : "FAIL"}
                ok={health.trialBalanceOk}
              />
              <Card
                title="Solvency"
                value={health.solvencyOk ? "OK" : "SHORT"}
                ok={health.solvencyOk}
                sub={
                  health.solvency
                    ? `Shortfall ₹${health.solvency.shortfall}`
                    : undefined
                }
              />
              <Card
                title="Float balance"
                value={`₹${health.floatCoverage.floatBalance}`}
                ok
                sub={`Transit ₹${health.floatCoverage.transitBalance}`}
              />
              <Card
                title="Unmatched credits"
                value={String(health.unmatchedBankCredits)}
                ok={health.unmatchedBankCredits === 0}
                sub={`Open float txns: ${health.floatCoverage.openTransfers}`}
              />
            </div>

            <p className="text-xs" style={{ color: B.muted }}>
              Checked at {new Date(health.ranAt).toLocaleString()}
            </p>

            <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: B.border }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ color: B.muted }}>
                    <th className="px-3 py-2 text-left font-medium">Check</th>
                    <th className="px-3 py-2 text-left font-medium">Severity</th>
                    <th className="px-3 py-2 text-left font-medium">Fingerprint</th>
                  </tr>
                </thead>
                <tbody>
                  {health.openFindings.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4" colSpan={3} style={{ color: B.muted }}>
                        No open findings
                      </td>
                    </tr>
                  ) : (
                    health.openFindings.map((f) => (
                      <tr key={f.fingerprint} className="border-t" style={{ borderColor: B.border }}>
                        <td className="px-3 py-2">{f.checkName}</td>
                        <td className="px-3 py-2">{f.severity}</td>
                        <td className="px-3 py-2 font-mono text-xs">{f.fingerprint}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Card({
  title,
  value,
  ok,
  sub,
}: {
  title: string;
  value: string;
  ok: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: B.border }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: B.muted }}>
        {title}
      </div>
      <div className="mt-1 text-xl font-bold" style={{ color: ok ? "#16a34a" : "#dc2626" }}>
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-xs" style={{ color: B.muted }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
