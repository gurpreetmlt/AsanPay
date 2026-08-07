"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface DisputeRow {
  id: string;
  transactionId: string;
  raisedBy: string;
  category: string;
  description: string;
  status: "raised" | "under_review" | "resolved" | "rejected";
  slaDueAt: string;
  submittedAt: string;
}

const TABS = ["raised", "under_review", "resolved", "rejected"] as const;

const STATUS_COLOR: Record<DisputeRow["status"], string> = {
  raised: "#2563eb",
  under_review: "#d97706",
  resolved: "#16a34a",
  rejected: "#dc2626",
};

export default function DisputesPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [tab, setTab] = useState<(typeof TABS)[number]>("raised");
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<DisputeRow[]>("/admin/disputes", { status: tab }));
    } catch {
      toast.error("Failed to load disputes");
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

  async function markReview(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/disputes/${id}/review`);
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
    const refund =
      outcome === "resolved" &&
      window.confirm(
        "Refund the customer? This reverses the original transaction's journal via a REVERSAL — never a fresh credit.",
      );
    setBusyId(id);
    try {
      await api.post(`/admin/disputes/${id}/resolve`, { outcome, resolutionNote, refund });
      toast.success(`Dispute ${outcome}${refund ? " and refunded" : ""}`);
      await load();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Could not resolve dispute",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="flex items-center gap-2">
          <AlertCircle size={20} style={{ color: B.blue }} />
          <h1 className="text-xl font-bold" style={{ color: B.blue }}>
            Disputes
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
                borderColor: tab === t ? B.blue : B.border,
                background: tab === t ? B.blue : "white",
                color: tab === t ? "white" : B.muted,
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
              No disputes in this state.
            </div>
          )}
          {!loading &&
            rows.map((d) => {
              const overdue = new Date(d.slaDueAt).getTime() < Date.now();
              return (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3"
                  style={{ borderColor: overdue && d.status !== "resolved" && d.status !== "rejected" ? "#DC2626" : B.border }}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/users/${d.raisedBy}`}
                      className="font-medium capitalize hover:underline"
                      style={{ color: B.blue }}
                    >
                      {d.category.replace(/_/g, " ")}
                    </Link>
                    <div className="text-xs" style={{ color: B.muted }}>
                      Txn {d.transactionId.slice(0, 8)}… · {new Date(d.submittedAt).toLocaleDateString()}
                      {overdue && (d.status === "raised" || d.status === "under_review") ? (
                        <span className="ml-2 font-bold" style={{ color: "#DC2626" }}>
                          PAST SLA
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs" style={{ color: B.muted }}>
                      {d.description}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ background: `${STATUS_COLOR[d.status]}18`, color: STATUS_COLOR[d.status] }}
                    >
                      {d.status.replace(/_/g, " ")}
                    </span>
                    {d.status === "raised" && (
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => void markReview(d.id)}
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                        style={{ borderColor: B.border, color: B.blue }}
                      >
                        Review
                      </button>
                    )}
                    {(d.status === "raised" || d.status === "under_review") && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => void resolve(d.id, "resolved")}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                          style={{ background: "#16a34a" }}
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => void resolve(d.id, "rejected")}
                          className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                          style={{ borderColor: "#dc262630", color: "#dc2626" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </AdminShell>
  );
}
