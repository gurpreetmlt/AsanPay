"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Search } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B, ROLE_LABEL } from "@/lib/brand";
import { apiErrorMessage, formatWhen } from "@/lib/taxCommissionUtils";

type OverrideRow = {
  id: string;
  userId: string;
  userName: string;
  userUid: string;
  userMobile: string;
  userRole: string;
  serviceCode: string;
  serviceName: string;
  ruleType: string;
  value: string;
  expiresAt: string | null;
  isActive: boolean;
  isExpired: boolean;
  updatedAt: string;
  href: string;
};

type Inbox = { total: number; rows: OverrideRow[] };

type ExpiredFilter = "0" | "1" | "all";

function rateLabel(r: OverrideRow) {
  return r.ruleType === "percentage" ? `${r.value}%` : `₹${r.value}`;
}

function statusOf(r: OverrideRow): { label: string; color: string } {
  if (!r.isActive) return { label: "Reverted", color: "#64748B" };
  if (r.isExpired) return { label: "Expired", color: "#B45309" };
  return { label: "Active", color: "#0F9E5C" };
}

export function OverridesInbox() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [expired, setExpired] = useState<ExpiredFilter>("0");
  const [data, setData] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { expired, active: "1", limit: "100" };
      if (q.trim()) params.q = q.trim();
      if (role) params.role = role;
      setData(await fetchApi<Inbox>("/admin/commission/overrides", params));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load commission overrides"));
    } finally {
      setLoading(false);
    }
  }, [q, role, expired]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function revert(r: OverrideRow) {
    const ok = window.confirm(
      `Revert the ${r.serviceName} override for ${r.userName} (${rateLabel(r)})? The agent will fall back to the role scheme.`,
    );
    if (!ok) return;
    setRevertingId(r.id);
    try {
      await api.post(`/admin/commission/overrides/${r.id}/revert`, { mode: "deactivate" });
      toast.success("Override reverted");
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not revert this override"));
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
      <div>
        <h2 className="text-base font-bold" style={{ color: B.blue }}>
          Override inbox
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
          Every active per-agent rate across services. Revert removes the override so the agent returns to the
          role scheme.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
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
              placeholder="Agent name, UID, mobile, or service"
            />
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: B.muted }}>
            Role
          </span>
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: B.border }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All agent roles</option>
            {["retailer", "distributor", "super_distributor"].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium" style={{ color: B.muted }}>
            Expiry
          </span>
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: B.border }}
            value={expired}
            onChange={(e) => setExpired(e.target.value as ExpiredFilter)}
          >
            <option value="0">Not expired</option>
            <option value="1">Expired only</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {loading && !data ? (
        <p className="py-4 text-sm" style={{ color: B.muted }}>
          Loading…
        </p>
      ) : !data?.rows.length ? (
        <p className="py-4 text-sm" style={{ color: B.muted }}>
          No overrides match these filters.
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
                <th className="py-2 pr-3 font-semibold">Service</th>
                <th className="py-2 pr-3 font-semibold text-right">Rate</th>
                <th className="py-2 pr-3 font-semibold">Expires</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const st = statusOf(r);
                return (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                    <td className="py-3 pr-3">
                      <Link
                        href={`${r.href}#commission`}
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: B.blue }}
                      >
                        {r.userName}
                      </Link>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {r.userUid} · {r.userMobile} · {ROLE_LABEL[r.userRole] ?? r.userRole}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div>{r.serviceName}</div>
                      <div className="font-mono text-[11px]" style={{ color: B.muted }}>
                        {r.serviceCode}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold">{rateLabel(r)}</td>
                    <td className="py-3 pr-3 whitespace-nowrap" style={{ color: B.muted }}>
                      {r.expiresAt ? formatWhen(r.expiresAt) : "Never"}
                    </td>
                    <td className="py-3 pr-3 font-semibold" style={{ color: st.color }}>
                      {st.label}
                    </td>
                    <td className="py-3 text-right">
                      {r.isActive ? (
                        <button
                          type="button"
                          disabled={revertingId === r.id}
                          onClick={() => void revert(r)}
                          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                          style={{ background: B.danger }}
                        >
                          {revertingId === r.id ? "Reverting…" : "Revert"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs" style={{ color: B.muted }}>
            Showing {data.rows.length} of {data.total}
          </p>
        </div>
      )}
    </div>
  );
}
