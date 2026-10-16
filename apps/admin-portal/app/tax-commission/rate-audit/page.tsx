"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { apiErrorMessage, formatWhen } from "@/lib/taxCommissionUtils";

type Snapshot = Record<string, unknown> | null;

type AuditRow = {
  id: string;
  entityType: string;
  entityId: string | null;
  adminId: string | null;
  adminName: string | null;
  userId: string | null;
  userName: string | null;
  userUid: string | null;
  userMobile: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  before: Snapshot;
  after: Snapshot;
  reason: string | null;
  createdAt: string;
};

function summarize(s: Snapshot): string {
  if (!s) return "—";
  const type = s.ruleType;
  const value = s.value;
  const parts: string[] = [];
  if (value !== undefined && value !== null) {
    parts.push(type === "percentage" ? `${value}%` : type === "flat" ? `₹${value}` : String(value));
  }
  if (s.minAmount != null || s.maxAmount != null) {
    parts.push(`slab ${s.minAmount ?? "0"}–${s.maxAmount ?? "∞"}`);
  }
  if (s.isActive === false) parts.push("inactive");
  if (typeof s.expiresAt === "string" && s.expiresAt) parts.push(`expires ${formatWhen(s.expiresAt)}`);
  return parts.length ? parts.join(" · ") : JSON.stringify(s);
}

export default function TaxCommissionRateAuditPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [q, setQ] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (q.trim()) params.q = q.trim();
      if (entityType) params.entityType = entityType;
      const res = await fetchApi<{ rows: AuditRow[] }>("/admin/commission/rate-audit", params);
      setRows(res.rows);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load rate audit"));
    } finally {
      setLoading(false);
    }
  }, [q, entityType]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [hydrated, accessToken, load, q]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Rate audit
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Every change to a commission scheme rule or agent override: who changed it, and the rate before and
            after.
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"
          style={{ borderColor: B.border }}
        >
          <label className="block min-w-[220px] flex-1 text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Search
            </span>
            <span className="relative block">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: B.muted }}
              />
              <input
                className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm"
                style={{ borderColor: B.border }}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Admin, agent, service, or reason"
              />
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium" style={{ color: B.muted }}>
              Entity
            </span>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: B.border }}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">Rules and overrides</option>
              <option value="rule">Scheme rules</option>
              <option value="override">Agent overrides</option>
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          {loading ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              No rate changes recorded for these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs uppercase tracking-wide"
                    style={{ borderColor: B.border, color: B.muted }}
                  >
                    <th className="px-4 py-3 font-semibold">When</th>
                    <th className="px-4 py-3 font-semibold">Admin</th>
                    <th className="px-4 py-3 font-semibold">Entity</th>
                    <th className="px-4 py-3 font-semibold">Before</th>
                    <th className="px-4 py-3 font-semibold">After</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                      <td className="whitespace-nowrap px-4 py-3" style={{ color: B.muted }}>
                        {formatWhen(r.createdAt)}
                      </td>
                      <td className="px-4 py-3">{r.adminName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold uppercase" style={{ color: B.blueLight }}>
                          {r.entityType === "override" ? "Agent override" : "Scheme rule"}
                        </div>
                        <div>{r.serviceName ?? "—"}</div>
                        {r.userId ? (
                          <Link
                            href={`/users/${r.userId}`}
                            className="text-xs font-semibold underline-offset-2 hover:underline"
                            style={{ color: B.blue }}
                          >
                            {r.userName} · {r.userUid}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-4 py-3" style={{ color: B.muted }}>
                        {summarize(r.before)}
                      </td>
                      <td className="px-4 py-3 font-semibold">{summarize(r.after)}</td>
                      <td className="px-4 py-3" style={{ color: B.muted }}>
                        {r.reason || "—"}
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
