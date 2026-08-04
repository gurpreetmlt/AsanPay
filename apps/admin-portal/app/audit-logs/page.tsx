"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorUid: string | null;
}

interface AuditLogsResponse {
  rows: AuditLogRow[];
  total: number;
}

const PAGE_SIZE = 50;

function actionColor(action: string) {
  if (action.includes("disable") || action.includes("reject") || action.includes("delete")) return "#dc2626";
  if (action.includes("update") || action.includes("reassign") || action.includes("move")) return "#b45309";
  return "#16a34a";
}

export default function AuditLogsPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      };
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (search.trim()) params.q = search.trim();
      const data = await fetchApi<AuditLogsResponse>("/admin/audit-logs", params);
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, search, page]);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    void load();
  }, [hydrated, accessToken, router, load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setSearch(q);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold" style={{ color: B.blue }}>
          Audit Log
        </h1>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          Every admin action — provider toggles, reassignments, commission changes, KYC
          decisions — with who did it and when.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by actor name or entity ID…"
              className="w-full rounded-xl border-2 bg-white py-2.5 pl-9 pr-3 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>
          <input
            value={actionFilter}
            onChange={(e) => {
              setPage(0);
              setActionFilter(e.target.value);
            }}
            placeholder="Filter by action (e.g. provider_service)"
            className="rounded-xl border-2 bg-white px-3 py-2.5 text-sm outline-none sm:w-72"
            style={{ borderColor: B.border, color: B.blue }}
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wider"
                  style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                      No audit log entries found
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => {
                    const isOpen = !!expanded[r.id];
                    const hasMetadata = Object.keys(r.metadata ?? {}).length > 0;
                    return (
                      <tr key={r.id} className="border-b last:border-0 align-top" style={{ borderColor: B.border }}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs" style={{ color: B.muted }}>
                          {new Date(r.createdAt).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3">
                          {r.actorName ? (
                            <>
                              <div className="font-medium" style={{ color: B.blue }}>
                                {r.actorName}
                              </div>
                              <div className="font-mono text-xs" style={{ color: B.muted }}>
                                {r.actorUid}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs" style={{ color: B.muted }}>
                              System
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold" style={{ color: actionColor(r.action) }}>
                            {r.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs" style={{ color: B.muted }}>
                            {r.entityType}
                          </div>
                          {r.entityId && (
                            <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                              {r.entityId}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {hasMetadata ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.id)}
                              className="text-xs font-medium"
                              style={{ color: B.blueLight }}
                            >
                              {isOpen ? "Hide" : "View"} details
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: B.muted }}>
                              —
                            </span>
                          )}
                          {isOpen && (
                            <pre
                              className="mt-1 max-w-xs overflow-x-auto rounded-lg p-2 text-[11px]"
                              style={{ background: B.secondary, color: B.blue }}
                            >
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div
            className="flex items-center justify-between border-t px-4 py-3 text-sm"
            style={{ borderColor: B.border, color: B.muted }}
          >
            <span>
              {total === 0 ? "0" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: B.border }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span>
                Page {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: B.border }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
