"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Landmark, Search, Table2, GitBranch, Trash2 } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal, type ConfirmTone } from "@/components/ui/ConfirmModal";
import { PromptModal } from "@/components/ui/PromptModal";
import { ActionIconButton, TableActionButtons } from "@/components/ui/TableActionButtons";
import { NetworkTreeView } from "@/components/users/NetworkTreeView";
import { MoveAgentModal } from "@/components/users/MoveAgentModal";
import { WalletMoveModal, type WalletMoveKind } from "@/components/users/WalletMoveModal";
import { WalletMovesPending } from "@/components/users/WalletMovesPending";
import { FundRequestSwitch } from "@/components/users/FundRequestSwitch";
import { useDevOptionsStore } from "@/lib/devOptionsStore";

type PendingConfirm = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone: ConfirmTone;
  confirmText?: string;
  confirmTextLabel?: string;
  action: () => void | Promise<void>;
};

const ROLE_LABEL: Record<string, string> = {
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

function DeleteUserDetails({ u }: { u: AdminUser }) {
  const rows: [string, string][] = [
    ["Name", u.name],
    ["Mobile", u.mobile],
    ["UID", u.uid],
    ["Role", ROLE_LABEL[u.role] ?? u.role],
    ["Email", u.email || "Not added"],
    ["KYC", u.kycStatus.charAt(0).toUpperCase() + u.kycStatus.slice(1)],
    ["Status", u.isFrozen ? "Frozen" : u.isActive ? "Active" : "Inactive"],
    ["Joined", new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
  ];
  return (
    <div className="mt-3 overflow-hidden rounded-xl border" style={{ borderColor: B.border }}>
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className="grid grid-cols-[90px_1fr] gap-3 px-3 py-2 text-xs"
          style={{ borderTop: i ? `1px solid ${B.border}` : undefined }}
        >
          <span style={{ color: B.muted }}>{k}</span>
          <span className="break-all font-semibold" style={{ color: "var(--admin-text)" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

type PendingPrompt = {
  title: string;
  message?: ReactNode;
  label?: string;
  placeholder?: string;
  minLength?: number;
  multiline?: boolean;
  tone?: ConfirmTone;
  onConfirm: (value: string) => void;
};

export type RoleFilter = "" | "super_distributor" | "distributor" | "retailer";
type KycFilter = "" | "pending" | "verified" | "rejected";

interface AdminUser {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  mobile: string;
  role: string;
  kycStatus: string;
  isActive: boolean;
  /** Full-freeze status (accounts.blockLogin) — the moderation lever. isActive is lifecycle-only. */
  isFrozen: boolean;
  fundRequestEnabled: boolean;
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
  super_distributor: {
    title: "Super Distributors",
    sub: "Top of agent hierarchy — onboarded / funded by Admin",
  },
  distributor: { title: "Distributors", sub: "Under Super Distributor — agent portal only" },
  retailer: { title: "Retailers", sub: "Under Distributor — agent portal / mobile only" },
};

interface PendingBankRow {
  id: string;
  userId: string;
  userName: string;
  userUid: string;
  userMobile: string;
  accountNumberLast4: string;
  ifsc: string;
  holderName: string;
}

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
  const [walletMove, setWalletMove] = useState<{ id: string; kind: WalletMoveKind } | null>(null);
  const [walletMoveKey, setWalletMoveKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [pendingBanks, setPendingBanks] = useState<PendingBankRow[]>([]);
  const rowDeleteEnabled = useDevOptionsStore((s) => s.rowDeleteEnabled);

  useEffect(() => {
    setRole(lockedRole);
  }, [lockedRole]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("q")?.trim();
    if (fromUrl) {
      setQ(fromUrl);
      setSearch(fromUrl);
    }
  }, []);

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
    let alive = true;
    void (async () => {
      try {
        const rows = await fetchApi<PendingBankRow[]>("/settlements/banks/pending");
        if (alive) setPendingBanks(Array.isArray(rows) ? rows : []);
      } catch {
        if (alive) setPendingBanks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Routes through the graded restriction endpoint rather than users.isActive directly — a
  // straight deactivate also kills login, which is the one lever spec §6.4 says to hold back
  // for confirmed fraud. "Ban" here means freeze; unban lifts every restriction level.
  async function executeToggleActive(u: AdminUser, reason: string) {
    setToggling(u.id);
    setPendingPrompt(null);
    try {
      await api.post(`/admin/users/${u.id}/restrict`, {
        level: u.isFrozen ? "none" : "freeze",
        reason,
      });
      toast.success(u.isFrozen ? "Restrictions lifted" : "Account frozen");
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFrozen: !x.isFrozen } : x)));
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Update failed",
      );
    } finally {
      setToggling(null);
    }
  }

  function toggleActive(u: AdminUser) {
    if (!u.isFrozen) {
      setPendingPrompt({
        title: "Freeze account?",
        message: "This blocks login until restrictions are lifted.",
        label: "Freeze reason",
        placeholder: "Why is this account being frozen?",
        minLength: 8,
        multiline: true,
        tone: "danger",
        onConfirm: (value) => void executeToggleActive(u, value),
      });
      return;
    }
    void executeToggleActive(u, "");
  }

  async function executeDeleteUser(u: AdminUser) {
    setDeletingId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success("User deleted");
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
      setPendingConfirm(null);
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          "Could not delete user",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function deleteUser(u: AdminUser) {
    setPendingConfirm({
      title: "Delete user?",
      message: (
        <>
          <p>
            Permanently delete this {ROLE_LABEL[u.role] ?? "user"}? This cannot be undone.
          </p>
          <DeleteUserDetails u={u} />
          <p className="mt-2 text-xs">
            Delete retailers before distributors / super distributors if they are linked.
          </p>
        </>
      ),
      confirmLabel: "Delete user",
      tone: "danger",
      confirmText: u.mobile,
      confirmTextLabel: "Type the mobile number to confirm",
      action: () => void executeDeleteUser(u),
    });
  }

  async function executeDeleteSelected(targets: AdminUser[]) {
    if (targets.length === 0) return;

    const roleOrder: Record<string, number> = {
      retailer: 0,
      distributor: 1,
      super_distributor: 2,
    };
    const ordered = [...targets].sort(
      (a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9),
    );

    setBulkDeleting(true);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const u of ordered) {
        try {
          await api.delete(`/admin/users/${u.id}`);
          ok += 1;
          setUsers((prev) => prev.filter((x) => x.id !== u.id));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(u.id);
            return next;
          });
        } catch (err) {
          const msg =
            (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
            "Could not delete user";
          failed.push(`${u.name}: ${msg}`);
        }
      }
      if (ok > 0) toast.success(`Deleted ${ok} agent(s)`);
      if (failed.length > 0) {
        toast.error(failed.slice(0, 3).join(" · ") + (failed.length > 3 ? "…" : ""));
      }
      setPendingConfirm(null);
    } finally {
      setBulkDeleting(false);
    }
  }

  function deleteSelected() {
    if (selectedUsers.length === 0) return;
    const targets = [...selectedUsers];
    setPendingConfirm({
      title: "Delete selected agents?",
      message: (
        <>
          <p>
            Permanently delete{" "}
            <span className="font-semibold" style={{ color: B.blue }}>
              {targets.length}
            </span>{" "}
            selected agent(s)?
          </p>
          <p className="mt-2">
            This cannot be undone. Retailers are deleted first, then distributors, then super
            distributors.
          </p>
        </>
      ),
      confirmLabel: "Delete selected",
      tone: "danger",
      confirmText: "DELETE",
      confirmTextLabel: "Type DELETE to confirm",
      action: () => void executeDeleteSelected(targets),
    });
  }

  function isMovable(u: AdminUser) {
    return u.role === "distributor" || u.role === "retailer";
  }

  /** Move selection stays D/R; when Safety delete is on, Super Dist can be selected too. */
  function isSelectable(u: AdminUser) {
    return isMovable(u) || (rowDeleteEnabled && u.role === "super_distributor");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableUsers = users.filter(isSelectable);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedIds.has(u.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(selectableUsers.map((u) => u.id));
    });
  }

  const selectedUsers = users.filter((u) => selectedIds.has(u.id));
  const selectedMovable = selectedUsers.filter(isMovable);
  const selectedRoles = new Set(selectedMovable.map((u) => u.role));
  const mixedRoles = selectedRoles.size > 1;
  const canMoveSelected = selectedMovable.length > 0 && !mixedRoles && selectedMovable.length === selectedUsers.length;

  const meta = TITLES[lockedRole || ""] ?? TITLES[""];
  const colSpan = lockedRole ? 7 : 8;
  const showBankBanner =
    pendingBanks.length > 0 && (lockedRole === "retailer" || lockedRole === "" || !lockedRole);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl" style={{ color: B.blue }}>
          {meta.title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: B.muted }}>
          {meta.sub}
        </p>
      </div>

      <WalletMovesPending refreshKey={walletMoveKey} />

      {showBankBanner ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: "#FDBA74", background: "#FFF7ED" }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "#FFEDD5", color: "#C2410C" }}
            >
              <Landmark size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold" style={{ color: "#C2410C" }}>
                {pendingBanks.length} retailer bank
                {pendingBanks.length === 1 ? "" : "s"} awaiting verification
              </p>
              <p className="mt-0.5 text-xs leading-snug" style={{ color: "#9A3412" }}>
                {pendingBanks
                  .slice(0, 3)
                  .map((b) => `${b.userName} · ****${b.accountNumberLast4}`)
                  .join(" · ")}
                {pendingBanks.length > 3 ? ` · +${pendingBanks.length - 3} more` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/settlements?tab=banks")}
            className="rounded-xl px-3 py-2 text-sm font-bold text-white"
            style={{ background: "#12B76A" }}
          >
            Verify banks
          </button>
        </div>
      ) : null}

      {!lockedRole && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "" as RoleFilter, label: "All" },
                { key: "super_distributor", label: "Super Dist" },
                { key: "distributor", label: "Distributor" },
                { key: "retailer", label: "Retailer" },
              ] as const
            ).map((t) => (
              <button
                key={t.key || "all"}
                type="button"
                onClick={() => setRole(t.key)}
                data-active={role === t.key}
                className="tab-chip rounded-xl px-3 py-2 text-sm font-semibold"
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
                  data-active={view === t.key}
                  className="tab-chip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
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
            placeholder="Search name, email, UID, mobile…"
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
            {rowDeleteEnabled ? (
              <ActionIconButton
                title="Delete selected"
                tone="red"
                disabled={bulkDeleting || selectedUsers.length === 0}
                onClick={() => void deleteSelected()}
              >
                <Trash2 size={16} strokeWidth={2.25} />
              </ActionIconButton>
            ) : null}
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
              disabled={!canMoveSelected || bulkDeleting}
              onClick={() => setMoveAgents(selectedMovable)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: B.badgeGrad }}
            >
              Move {selectedMovable.length > 0 ? selectedMovable.length : selectedIds.size}
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
                <th className="px-4 py-3 font-semibold">Name / Email</th>
                <th className="px-4 py-3 font-semibold">Mobile / UID</th>
                {!lockedRole && <th className="px-4 py-3 font-semibold">Role</th>}
                <th className="px-4 py-3 font-semibold">KYC</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Fund requests</th>
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
                      {isSelectable(u) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          aria-label={`Select ${u.name}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: B.blue }}>
                        {u.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs" style={{ color: B.muted }}>
                        {u.email?.trim() || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-semibold tabular-nums" style={{ color: B.blueMid }}>
                        {u.mobile}
                      </div>
                      <div className="mt-0.5 font-mono text-xs" style={{ color: B.muted }}>
                        {u.uid}
                      </div>
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
                      <Badge status={u.isFrozen ? "inactive" : "active"} />
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "admin" ? (
                        <span style={{ color: B.muted }}>—</span>
                      ) : (
                        <FundRequestSwitch
                          userId={u.id}
                          name={u.name}
                          enabled={u.fundRequestEnabled}
                          showLabel
                          onChange={(enabled) =>
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, fundRequestEnabled: enabled } : x)))
                          }
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TableActionButtons
                        viewHref={`/users/${u.id}`}
                        onToggleActive={
                          u.isFrozen && toggling !== u.id ? () => void toggleActive(u) : undefined
                        }
                        onBan={!u.isFrozen && toggling !== u.id ? () => void toggleActive(u) : undefined}
                        onMove={isMovable(u) ? () => setMoveAgents([u]) : undefined}
                        onTransfer={isMovable(u) ? () => setWalletMove({ id: u.id, kind: "transfer" }) : undefined}
                        onDelete={rowDeleteEnabled ? () => void deleteUser(u) : undefined}
                        deleting={deletingId === u.id}
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
                  <p className="truncate text-xs" style={{ color: B.muted }}>
                    {u.email?.trim() || "—"}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: B.blueMid }}>
                    {u.mobile}
                  </p>
                  <p className="mt-0.5 font-mono text-xs" style={{ color: B.muted }}>
                    {u.uid}
                  </p>
                </div>
                <TableActionButtons
                  viewHref={`/users/${u.id}`}
                  onToggleActive={
                    u.isFrozen && toggling !== u.id ? () => void toggleActive(u) : undefined
                  }
                  onBan={!u.isFrozen && toggling !== u.id ? () => void toggleActive(u) : undefined}
                  onMove={isMovable(u) ? () => setMoveAgents([u]) : undefined}
                        onTransfer={isMovable(u) ? () => setWalletMove({ id: u.id, kind: "transfer" }) : undefined}
                  onDelete={rowDeleteEnabled ? () => void deleteUser(u) : undefined}
                  deleting={deletingId === u.id}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!lockedRole && <Badge status={u.role} />}
                <Badge status={u.kycStatus} />
                <Badge status={u.isFrozen ? "inactive" : "active"} />
              </div>
              {u.role !== "admin" ? (
                <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: B.muted }}>
                  Fund requests
                  <FundRequestSwitch
                    userId={u.id}
                    name={u.name}
                    enabled={u.fundRequestEnabled}
                    showLabel
                    onChange={(enabled) =>
                      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, fundRequestEnabled: enabled } : x)))
                    }
                  />
                </div>
              ) : null}
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

      {walletMove ? (
        <WalletMoveModal
          agentId={walletMove.id}
          initialKind={walletMove.kind}
          onClose={() => setWalletMove(null)}
          onDone={() => setWalletMoveKey((k) => k + 1)}
        />
      ) : null}

      {pendingConfirm ? (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          tone={pendingConfirm.tone}
          confirmText={pendingConfirm.confirmText}
          confirmTextLabel={pendingConfirm.confirmTextLabel}
          busy={deletingId !== null || bulkDeleting}
          onConfirm={() => void pendingConfirm.action()}
          onClose={() => {
            if (!deletingId && !bulkDeleting) setPendingConfirm(null);
          }}
        />
      ) : null}

      {pendingPrompt ? (
        <PromptModal
          title={pendingPrompt.title}
          message={pendingPrompt.message}
          label={pendingPrompt.label}
          placeholder={pendingPrompt.placeholder}
          minLength={pendingPrompt.minLength}
          multiline={pendingPrompt.multiline}
          tone={pendingPrompt.tone}
          busy={toggling !== null}
          confirmLabel="Freeze"
          onConfirm={(v) => pendingPrompt.onConfirm(v)}
          onClose={() => {
            if (!toggling) setPendingPrompt(null);
          }}
        />
      ) : null}
    </div>
  );
}
