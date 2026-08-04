"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Search, Table2, GitBranch } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Badge } from "@/components/ui/Badge";
import { TableActionButtons } from "@/components/ui/TableActionButtons";
import { NetworkTreeView } from "@/components/users/NetworkTreeView";
import { MoveAgentModal } from "@/components/users/MoveAgentModal";

export type RoleFilter = "" | "master_distributor" | "distributor" | "retailer";
type KycFilter = "" | "pending" | "verified" | "rejected";

interface AdminUser {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  kycStatus: string;
  isActive: boolean;
  createdAt: string;
}

const KYC_OPTS: { key: KycFilter; label: string }[] = [
  { key: "", label: "All KYC" },
  { key: "pending", label: "Pending" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  "": {
    title: "All Agents",
    sub: "Admin controls the network — Super Dist, Distributor & Retailer (not admin accounts)",
  },
  master_distributor: {
    title: "Super Distributors",
    sub: "Top of agent hierarchy — onboarded / funded by Admin",
  },
  distributor: { title: "Distributors", sub: "Under Super Distributor — agent portal only" },
  retailer: { title: "Retailers", sub: "Under Distributor — agent portal / mobile only" },
};

interface Props {
  lockedRole?: RoleFilter;
}

export function UsersPanel({ lockedRole = "" }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleFilter>(lockedRole);
  const [kycStatus, setKycStatus] = useState<KycFilter>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "tree">("table");
  const [moveAgents, setMoveAgents] = useState<AdminUser[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRole(lockedRole);
  }, [lockedRole]);

  const effectiveRole = lockedRole || role;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (effectiveRole) params.role = effectiveRole;
      if (kycStatus) params.kycStatus = kycStatus;
      if (search.trim()) params.q = search.trim();
      setUsers(await fetchApi<AdminUser[]>("/admin/users", params));
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [effectiveRole, kycStatus, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  async function toggleActive(u: AdminUser) {
    setToggling(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/active`, { isActive: !u.isActive });
      toast.success(u.isActive ? "User deactivated" : "User activated");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x)));
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Update failed",
      );
    } finally {
      setToggling(null);
    }
  }

  function isMovable(u: AdminUser) {
    return u.role === "distributor" || u.role === "retailer";
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableUsers = users.filter(isMovable);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedIds.has(u.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(selectableUsers.map((u) => u.id));
    });
  }

  const selectedUsers = users.filter((u) => selectedIds.has(u.id));
  const selectedRoles = new Set(selectedUsers.map((u) => u.role));
  const mixedRoles = selectedRoles.size > 1;

  const meta = TITLES[lockedRole || ""] ?? TITLES[""];
  const colSpan = lockedRole ? 7 : 8;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
          {meta.title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          {meta.sub}
        </p>
      </div>

      {!lockedRole && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "" as RoleFilter, label: "All" },
                { key: "master_distributor", label: "Super Dist" },
                { key: "distributor", label: "Distributor" },
                { key: "retailer", label: "Retailer" },
              ] as const
            ).map((t) => (
              <button
                key={t.key || "all"}
                type="button"
                onClick={() => setRole(t.key)}
                className="rounded-xl px-3 py-2 text-sm font-semibold transition"
                style={
                  role === t.key
                    ? { background: B.badgeGrad, color: "#fff" }
                    : { background: B.secondary, color: B.blueMid }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-xl p-1" style={{ background: B.secondary }}>
            {(
              [
                { key: "table" as const, label: "Table", icon: Table2 },
                { key: "tree" as const, label: "Tree", icon: GitBranch },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition"
                  style={
                    view === t.key
                      ? { background: B.badgeGrad, color: "#fff" }
                      : { background: "transparent", color: B.blueMid }
                  }
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!lockedRole && view === "tree" ? (
        <NetworkTreeView />
      ) : (
        <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, UID, mobile…"
            className="w-full rounded-xl border-2 bg-white py-2.5 pl-9 pr-3 text-sm outline-none"
            style={{ borderColor: B.border, color: B.blue }}
          />
        </div>
        <select
          value={kycStatus}
          onChange={(e) => setKycStatus(e.target.value as KycFilter)}
          className="rounded-xl border-2 bg-white px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: B.border, color: B.blue }}
        >
          {KYC_OPTS.map((o) => (
            <option key={o.key || "all"} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-2.5"
          style={{ borderColor: B.blueLight, background: `${B.blueLight}0d` }}
        >
          <span className="text-sm font-medium" style={{ color: B.blue }}>
            {selectedIds.size} selected
            {mixedRoles && (
              <span className="ml-2 text-xs" style={{ color: "#b45309" }}>
                — mix of Distributor &amp; Retailer, move them separately
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium"
              style={{ color: B.muted }}
            >
              Clear
            </button>
            <button
              type="button"
              disabled={mixedRoles}
              onClick={() => setMoveAgents(selectedUsers)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: B.badgeGrad }}
            >
              Move {selectedIds.size}
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div
        className="hidden overflow-hidden rounded-2xl border bg-white md:block"
        style={{ borderColor: B.border }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs uppercase tracking-wider"
                style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
              >
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableUsers.length === 0}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">UID</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                {!lockedRole && <th className="px-4 py-3 font-semibold">Role</th>}
                <th className="px-4 py-3 font-semibold">KYC</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>
                    No users found
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-[var(--admin-card-hover)]"
                    style={{ borderColor: B.border }}
                    onClick={() => router.push(`/users/${u.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {isMovable(u) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          aria-label={`Select ${u.name}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: B.blue }}>
                      {u.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: B.muted }}>
                      {u.uid}
                    </td>
                    <td className="px-4 py-3" style={{ color: B.blueMid }}>
                      {u.mobile}
                    </td>
                    {!lockedRole && (
                      <td className="px-4 py-3">
                        <Badge status={u.role} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge status={u.kycStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={u.isActive ? "active" : "inactive"} />
                    </td>
                    <td className="px-4 py-3">
                      <TableActionButtons
                        viewHref={`/users/${u.id}`}
                        onToggleActive={
                          !u.isActive && toggling !== u.id ? () => void toggleActive(u) : undefined
                        }
                        onBan={u.isActive && toggling !== u.id ? () => void toggleActive(u) : undefined}
                        onMove={isMovable(u) ? () => setMoveAgents([u]) : undefined}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-4 md:hidden">
        {loading && (
          <p className="text-center text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        )}
        {!loading && users.length === 0 && (
          <div
            className="rounded-2xl border bg-white px-4 py-8 text-center text-sm"
            style={{ borderColor: B.border, color: B.muted }}
          >
            No users found
          </div>
        )}
        {!loading &&
          users.map((u) => (
            <div
              key={u.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/users/${u.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/users/${u.id}`);
                }
              }}
              className="w-full cursor-pointer rounded-2xl border bg-white p-4 text-left transition hover:shadow-sm"
              style={{ borderColor: B.border }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold" style={{ color: B.blue }}>
                    {u.name}
                  </h3>
                  <p className="text-sm" style={{ color: B.muted }}>
                    {u.mobile}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px]" style={{ color: B.muted }}>
                    {u.uid}
                  </p>
                </div>
                <TableActionButtons
                  viewHref={`/users/${u.id}`}
                  onToggleActive={
                    !u.isActive && toggling !== u.id ? () => void toggleActive(u) : undefined
                  }
                  onBan={u.isActive && toggling !== u.id ? () => void toggleActive(u) : undefined}
                  onMove={isMovable(u) ? () => setMoveAgents([u]) : undefined}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!lockedRole && <Badge status={u.role} />}
                <Badge status={u.kycStatus} />
                <Badge status={u.isActive ? "active" : "inactive"} />
              </div>
            </div>
          ))}
      </div>
        </>
      )}

      {moveAgents && moveAgents.length > 0 && (
        <MoveAgentModal
          agents={moveAgents.map((m) => ({
            id: m.id,
            name: m.name,
            mobile: m.mobile,
            role: m.role as "distributor" | "retailer",
          }))}
          onClose={() => setMoveAgents(null)}
          onMoved={() => {
            void load();
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
