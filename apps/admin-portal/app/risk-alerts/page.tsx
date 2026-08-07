"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ShieldAlert, MapPin, Check } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { fetchApi } from "@/lib/api";
import api from "@/lib/api";
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

interface RiskSignalRow {
  id: string;
  userId: string;
  userName: string;
  userUid: string;
  signalType: string;
  severity: "info" | "warn" | "critical";
  details: Record<string, unknown>;
  reviewedAt: string | null;
  createdAt: string;
}

const SEVERITY_COLOR: Record<RiskSignalRow["severity"], string> = {
  info: "#2563eb",
  warn: "#d97706",
  critical: "#dc2626",
};

export default function RiskAlertsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<RiskSignalRow[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);

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

  const loadSignals = useCallback(async () => {
    setSignalsLoading(true);
    try {
      setSignals(
        await fetchApi<RiskSignalRow[]>("/admin/risk-signals", {
          unreviewedOnly: showReviewed ? "false" : "true",
          limit: "100",
        }),
      );
    } catch {
      toast.error("Failed to load device/location signals");
    } finally {
      setSignalsLoading(false);
    }
  }, [showReviewed]);

  async function reviewSignal(id: string) {
    try {
      await api.post(`/admin/risk-signals/${id}/review`);
      setSignals((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Could not mark reviewed");
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
    void loadSignals();
  }, [hydrated, accessToken, router, load, loadSignals]);

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
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

        <div className="mt-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin size={18} style={{ color: B.blue }} />
            <h2 className="text-lg font-bold" style={{ color: B.blue }}>
              Device &amp; Location Signals
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowReviewed((v) => !v)}
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{ borderColor: B.border, color: B.muted }}
          >
            {showReviewed ? "Showing all" : "Unreviewed only"}
          </button>
        </div>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Log-only (task #15) — mock location, low GPS accuracy, out-of-zone transactions, device
          swap frequency and RD licence expiry. None of these block anything yet; this is the
          review surface for the first month of data before any threshold is turned into an
          enforcement rule.
        </p>

        <div className="mt-4 space-y-2">
          {signalsLoading && (
            <p className="py-6 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!signalsLoading && signals.length === 0 && (
            <div
              className="rounded-2xl border bg-white px-4 py-8 text-center text-sm"
              style={{ borderColor: B.border, color: B.muted }}
            >
              No {showReviewed ? "" : "unreviewed "}signals.
            </div>
          )}
          {!signalsLoading &&
            signals.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3"
                style={{ borderColor: B.border }}
              >
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase"
                  style={{
                    background: `${SEVERITY_COLOR[s.severity]}18`,
                    color: SEVERITY_COLOR[s.severity],
                  }}
                >
                  {s.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/users/${s.userId}`} className="font-medium hover:underline" style={{ color: B.blue }}>
                    {s.userName} · {s.userUid}
                  </Link>
                  <div className="text-xs" style={{ color: B.muted }}>
                    {s.signalType.replace(/_/g, " ")} — {new Date(s.createdAt).toLocaleString()}
                  </div>
                  {Object.keys(s.details).length > 0 && (
                    <div className="mt-0.5 truncate font-mono text-[11px]" style={{ color: B.muted }}>
                      {JSON.stringify(s.details)}
                    </div>
                  )}
                </div>
                {!s.reviewedAt && (
                  <button
                    type="button"
                    onClick={() => void reviewSignal(s.id)}
                    className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <Check size={12} />
                    Mark reviewed
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}
