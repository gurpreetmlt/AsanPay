"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Wrench } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface RepairRow {
  id: string;
  userId: string;
  serial: string;
  deviceType: string;
  issueType: string;
  status: "submitted" | "rma_issued" | "in_repair" | "resolved" | "rejected";
  rmaNumber: string | null;
  remarks: string;
  submittedAt: string;
}

const TABS = ["submitted", "rma_issued", "in_repair", "resolved", "rejected"] as const;

const STATUS_COLOR: Record<RepairRow["status"], string> = {
  submitted: "#2563eb",
  rma_issued: "#7c3aed",
  in_repair: "#d97706",
  resolved: "#16a34a",
  rejected: "#dc2626",
};

export default function DeviceRepairsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<(typeof TABS)[number]>("submitted");
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<RepairRow[]>("/admin/repair-requests", { status: tab }));
    } catch {
      toast.error("Failed to load repair requests");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  async function issueRma(id: string) {
    const rmaNumber = window.prompt("RMA number");
    if (!rmaNumber) return;
    setBusyId(id);
    try {
      await api.post(`/admin/repair-requests/${id}/rma`, { rmaNumber });
      toast.success("RMA issued");
      await load();
    } catch {
      toast.error("Could not issue RMA");
    } finally {
      setBusyId(null);
    }
  }

  async function markInRepair(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/repair-requests/${id}/in-repair`);
      await load();
    } catch {
      toast.error("Could not update status");
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: string, outcome: "resolved" | "rejected") {
    const resolutionNote = window.prompt(
      outcome === "resolved" ? "Resolution note" : "Rejection reason",
    );
    if (!resolutionNote) return;
    const replaced =
      outcome === "resolved" && window.confirm("Was the device replaced with a new serial?");
    setBusyId(id);
    try {
      await api.post(`/admin/repair-requests/${id}/resolve`, { outcome, resolutionNote, replaced });
      toast.success(`Request ${outcome}`);
      await load();
    } catch {
      toast.error("Could not resolve request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Wrench size={20} style={{ color: B.blue }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Device Repairs
          </h1>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize"
              style={{
                borderColor: tab === t ? B.blueLight : B.border,
                background: tab === t ? B.badgeGrad : "var(--admin-card)",
                color: tab === t ? "#ffffff" : "var(--admin-muted)",
              }}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {loading && (
            <p className="py-8 text-center text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          )}
          {!loading && rows.length === 0 && (
            <div
              className="rounded-2xl border bg-white px-4 py-10 text-center text-sm"
              style={{ borderColor: B.border, color: B.muted }}
            >
              No requests in this state.
            </div>
          )}
          {!loading &&
            rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3"
                style={{ borderColor: B.border }}
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/users/${r.userId}`} className="font-medium hover:underline" style={{ color: B.blue }}>
                    {r.serial} · {r.deviceType}
                  </Link>
                  <div className="text-xs" style={{ color: B.muted }}>
                    {r.issueType} — {new Date(r.submittedAt).toLocaleDateString()}
                    {r.rmaNumber ? ` · RMA ${r.rmaNumber}` : ""}
                  </div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: B.muted }}>
                    {r.remarks}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ background: `${STATUS_COLOR[r.status]}18`, color: STATUS_COLOR[r.status] }}
                  >
                    {r.status.replace(/_/g, " ")}
                  </span>
                  {r.status === "submitted" && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void issueRma(r.id)}
                      className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                      style={{ borderColor: B.border, color: B.blue }}
                    >
                      Issue RMA
                    </button>
                  )}
                  {r.status === "rma_issued" && (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void markInRepair(r.id)}
                      className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                      style={{ borderColor: B.border, color: B.blue }}
                    >
                      Start repair
                    </button>
                  )}
                  {(r.status === "submitted" || r.status === "rma_issued" || r.status === "in_repair") && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void resolve(r.id, "resolved")}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                        style={{ background: "#16a34a" }}
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void resolve(r.id, "rejected")}
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                        style={{ borderColor: "#dc262630", color: "#dc2626" }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </AdminShell>
  );
}
