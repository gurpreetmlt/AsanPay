"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

interface AuditRow {
  id: string;
  action: string;
  label: string;
  entityType: string;
  entityId: string | null;
  why: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorUid: string | null;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
}

const ACTION_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "admin.bank_recon_link", label: "Matches" },
  { key: "admin.bank_recon_unlink", label: "Undos" },
  { key: "admin.bank_recon_ignore", label: "Ignores" },
  { key: "admin.bank_statement_delete", label: "Deletes" },
  { key: "admin.treasury_daily_close", label: "Day close" },
];

function errMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message || ax?.message || fallback;
}

function tone(action: string): { bg: string; fg: string; border: string } {
  if (action.includes("delete") || action.includes("unlink"))
    return { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" };
  if (action.includes("ignore") || action.includes("reopen"))
    return { bg: "#FFF7ED", fg: "#C2410C", border: "#FDBA74" };
  if (action.includes("link") || action.includes("close") || action.includes("unignore"))
    return { bg: "#F0FDF4", fg: "#15803D", border: "#86EFAC" };
  return { bg: "#EEF2FF", fg: B.blue, border: "#C7D2FE" };
}

export function AuditTrailPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "50", offset: "0" };
      if (action) params.action = action;
      if (entityId.trim()) params.entityId = entityId.trim();
      const data = await fetchApi<AuditResponse>("/banking/audit", params);
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error(errMessage(err, "Could not load the banking audit trail"));
    } finally {
      setLoading(false);
    }
  }, [action, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: B.blue }}>
            Audit trail
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Who matched, unmatched, ignored, or deleted statement lines — and why.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold"
          style={{ borderColor: B.border, color: B.blue }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
          {ACTION_FILTERS.map((f) => {
            const active = action === f.key;
            return (
              <button
                key={f.key || "all"}
                type="button"
                onClick={() => setAction(f.key)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: active ? B.badgeGrad : "transparent",
                  color: active ? "#fff" : B.muted,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value.replace(/\D/g, ""))}
          placeholder="Line / entity id"
          className="rounded-xl border px-3 py-2 text-xs"
          style={{ borderColor: B.border, color: B.blue }}
        />
      </div>

      <p className="text-xs font-medium" style={{ color: B.muted }}>
        {loading ? "Loading…" : `${total} event${total === 1 ? "" : "s"}`}
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: B.muted }}>
          Loading audit trail…
        </p>
      ) : rows.length === 0 ? (
        <div
          className="rounded-2xl border px-4 py-12 text-center text-sm"
          style={{ borderColor: B.border, color: B.muted }}
        >
          No banking audit events yet. Confirm a match, ignore a line, or remove a statement line to
          start the trail.
        </div>
      ) : (
        <ol className="relative space-y-0 border-l-2 pl-5" style={{ borderColor: "#E2E8F0" }}>
          {rows.map((r) => {
            const t = tone(r.action);
            const when = new Date(r.createdAt).toLocaleString("en-IN");
            return (
              <li key={r.id} className="relative pb-6 last:pb-0">
                <span
                  className="absolute -left-[1.4rem] top-1.5 h-3 w-3 rounded-full border-2 bg-white"
                  style={{ borderColor: t.fg }}
                />
                <div
                  className="rounded-xl border px-3 py-2.5"
                  style={{ borderColor: t.border, background: t.bg }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-bold" style={{ color: t.fg }}>
                      {r.label}
                    </p>
                    <p className="text-[11px] font-medium" style={{ color: B.muted }}>
                      {when}
                    </p>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: B.blue }}>
                    {r.actorName || "Unknown admin"}
                    {r.actorUid ? ` · ${r.actorUid}` : ""}
                    {r.entityId ? ` · line #${r.entityId}` : ""}
                  </p>
                  {r.why ? (
                    <p className="mt-1.5 text-xs leading-snug" style={{ color: B.muted }}>
                      <span className="font-bold" style={{ color: B.blue }}>
                        Why:{" "}
                      </span>
                      {r.why}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
