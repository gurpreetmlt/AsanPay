"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { OverridesInbox } from "@/components/commission/OverridesInbox";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type SchemeRole = "retailer" | "distributor" | "super_distributor";

interface AdminUser {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  isActive: boolean;
}

const ROLE_LABEL: Record<SchemeRole, string> = {
  retailer: "Retailer",
  distributor: "Distributor",
  super_distributor: "Super Distributor",
};

export default function TaxCommissionOverridesPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | SchemeRole>("");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "50" };
      if (q.trim()) params.q = q.trim();
      if (role) params.role = role;
      const data = await fetchApi<AdminUser[]>("/admin/users", params);
      setRows(data.filter((u) => u.role !== "admin"));
    } catch (err) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(ax?.response?.data?.message || ax?.message || "Could not load agents");
    } finally {
      setLoading(false);
    }
  }, [q, role]);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [hydrated, accessToken, load, q]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="commission" />

        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Overrides
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Open an agent to edit per-service commission rates. Role-default schemes stay under Schemes.
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
                placeholder="Name, UID, or mobile"
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
              onChange={(e) => setRole(e.target.value as "" | SchemeRole)}
            >
              <option value="">All agent roles</option>
              {(Object.keys(ROLE_LABEL) as SchemeRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: B.badgeGrad }}
          >
            Search
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
          {loading ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-sm" style={{ color: B.muted }}>
              No agents match. Try another name, UID, or mobile.
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs uppercase tracking-wide"
                  style={{ borderColor: B.border, color: B.muted }}
                >
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">KYC</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b last:border-0" style={{ borderColor: B.border }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold" style={{ color: B.blue }}>
                        {u.name}
                      </div>
                      <div className="text-xs" style={{ color: B.muted }}>
                        {u.uid} · {u.mobile}
                      </div>
                    </td>
                    <td className="px-4 py-3">{ROLE_LABEL[u.role as SchemeRole] ?? u.role}</td>
                    <td className="px-4 py-3 capitalize">{u.kycStatus}</td>
                    <td className="px-4 py-3">{u.isActive ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/users/${u.id}#commission`}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                        style={{ background: B.cta }}
                      >
                        Edit rates
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <OverridesInbox />
      </div>
    </AdminShell>
  );
}
