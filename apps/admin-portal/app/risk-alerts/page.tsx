"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface RiskRow {
  userId: string;
  userName: string;
  userUid: string;
  userMobile: string;
  failCount: number;
}

const WINDOW_HOURS = 24;
const MIN_FAILURES = 3;

export default function RiskAlertsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await fetchApi<RiskRow[]>("/admin/risk-alerts", {
          windowHours: String(WINDOW_HOURS),
          minFailures: String(MIN_FAILURES),
        }),
      );
    } catch {
      toast.error("Failed to load risk alerts");
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

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} style={{ color: "#dc2626" }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Risk Alerts
          </h1>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Threshold-based, not a scored model (real trust/risk scoring needs more live
          transaction volume to calibrate — see <span className="font-mono">docs/ROADMAP.md</span>).
          Right now: agents with {MIN_FAILURES}+ failed transactions in the last {WINDOW_HOURS}{" "}
          hours.
        </p>

        <div className="mt-4 space-y-2">
          {loading && (
            <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm" style={{ borderColor: B.border, color: B.muted }}>
              No agent has {MIN_FAILURES}+ failures in the last {WINDOW_HOURS}h.
            </div>
          )}
          {!loading &&
            rows.map((r) => (
              <Link
                key={r.userId}
                href={`/users/${r.userId}`}
                className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition hover:shadow-sm"
                style={{ borderColor: B.border }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(220,38,38,0.1)" }}
                >
                  <ShieldAlert size={16} style={{ color: "#dc2626" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium" style={{ color: B.blue }}>
                    {r.userName}
                  </div>
                  <div className="text-xs" style={{ color: B.muted }}>
                    {r.userMobile} · {r.userUid}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ background: "rgba(220,38,38,0.12)", color: "#dc2626" }}
                >
                  {r.failCount} failed
                </span>
              </Link>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}
