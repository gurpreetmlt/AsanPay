"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ArrowUpRight,
  UserCheck,
  Search,
  ChevronRight,
  ChevronDown,
  Crown,
  Network as NetworkIcon,
  Store,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { FundForm } from "@/components/dashboard/FundForm";
import { PullForm } from "@/components/dashboard/PullForm";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B, initials, roleFromUserRole } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { extractApiError } from "@/lib/onboarding";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser, LedgerEntry } from "@/lib/types";
import type { UserRole } from "@asanpay/shared-types";

interface DownlineItem {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
  isActive: boolean;
  mainBalance: string;
  aepsBalance?: string;
  createdAt: string;
  kycStatus?: string;
}

interface TreeNode extends DownlineItem {
  children: TreeNode[];
}

interface UplineItem {
  id: string;
  name: string;
  mobile: string;
  role: string;
}

interface NetworkData {
  role: UserRole;
  downline: DownlineItem[];
  tree: TreeNode[];
  upline: UplineItem | null;
}

const ROLE_UI: Record<string, { downlineLabel: string; emptyMsg: string }> = {
  super_distributor: { downlineLabel: "Distributors", emptyMsg: "No distributors in your network yet" },
  distributor: { downlineLabel: "Retailers", emptyMsg: "No retailers in your network yet" },
  retailer: { downlineLabel: "", emptyMsg: "" },
};

function roleLabel(role: string) {
  if (role === "super_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  if (role === "retailer") return "Retailer";
  return role;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; icon: typeof Crown }> = {
  super_distributor: { bg: "#7c3aed", text: "#fff", icon: Crown },
  distributor: { bg: B.blue, text: "#fff", icon: NetworkIcon },
  retailer: { bg: B.green, text: "#fff", icon: Store },
};

function countAll(nodes: TreeNode[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countAll(n.children);
  return c;
}

function TreeItem({
  node,
  depth = 0,
  canToggle,
  togglingId,
  onToggle,
}: {
  node: TreeNode;
  depth?: number;
  canToggle: boolean;
  togglingId: string | null;
  onToggle: (id: string, next: boolean) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const rc = ROLE_COLORS[node.role] ?? ROLE_COLORS.retailer;
  const Icon = rc.icon;
  const busy = togglingId === node.id;

  return (
    <div>
      <div
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-blue-50/50"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} style={{ color: B.muted }} className="shrink-0" />
            ) : (
              <ChevronRight size={14} style={{ color: B.muted }} className="shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: rc.bg, color: rc.text }}
          >
            {initials(node.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                {node.name}
              </span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: node.isActive ? B.green : "#94a3b8" }}
              />
            </div>
            <span className="text-xs" style={{ color: B.muted }}>{node.mobile}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: `${rc.bg}18`, color: rc.bg }}
            >
              {roleLabel(node.role)}
            </span>
            <Icon size={14} style={{ color: rc.bg }} className="hidden sm:block" />
            {hasChildren && (
              <span className="rounded-full px-1.5 py-0.5 text-[11px] font-bold" style={{ background: B.secondary, color: B.muted }}>
                {countAll(node.children)}
              </span>
            )}
          </div>
        </button>

        {canToggle && depth === 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggle(node.id, !node.isActive)}
            className="shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
            style={{
              borderColor: node.isActive ? "#fca5a5" : B.green,
              color: node.isActive ? "#b91c1c" : B.green,
            }}
          >
            {busy ? "…" : node.isActive ? "Inactive" : "Active"}
          </button>
        ) : null}
      </div>

      {open && hasChildren && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${depth * 24 + 24}px`, background: B.border }}
          />
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              canToggle={false}
              togglingId={togglingId}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetworkPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"tree" | "table">("table");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [fundTarget, setFundTarget] = useState<DownlineUser | null>(null);
  const [pullTarget, setPullTarget] = useState<DownlineUser | null>(null);
  const [historyTarget, setHistoryTarget] = useState<DownlineItem | null>(null);
  const [historyRows, setHistoryRows] = useState<LedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canToggleChildren = user?.role === "super_distributor" || user?.role === "distributor";
  const canMoneyActions = canToggleChildren;
  /** Tree view: Super Distributor only. Distributors always get flat table. */
  const isSuperDist = user?.role === "super_distributor";
  const effectiveView: "tree" | "table" = isSuperDist ? view : "table";

  useEffect(() => {
    if (!isSuperDist && view !== "table") setView("table");
  }, [isSuperDist, view]);

  function toDownlineUser(m: DownlineItem): DownlineUser {
    return {
      id: m.id,
      uid: m.uid,
      name: m.name,
      mobile: m.mobile,
      role: m.role as DownlineUser["role"],
      kycStatus: (m.kycStatus as DownlineUser["kycStatus"]) ?? "pending",
      isActive: m.isActive,
      mainBalance: m.mainBalance,
      aepsBalance: m.aepsBalance,
      createdAt: m.createdAt,
    };
  }

  async function openHistory(m: DownlineItem) {
    setHistoryTarget(m);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const entries = await fetchApi<LedgerEntry[]>("/wallet/ledger", { limit: 100, offset: 0 });
      setHistoryRows(entries.filter((e) => e.referenceId === m.id));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load history"));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function reloadNetwork() {
    const res = await fetchApi<NetworkData>("/users/network");
    setData(res);
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchApi<NetworkData>("/users/network");
        if (alive) setData(res);
      } catch (err) {
        if (alive) toast.error(extractApiError(err, "Failed to load network"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accessToken, user]);

  async function toggleChild(id: string, next: boolean) {
    setTogglingId(id);
    try {
      await api.patch(`/users/${id}/active`, { isActive: next });
      toast.success(next ? "Marked Active" : "Marked Inactive");
      const res = await fetchApi<NetworkData>("/users/network");
      setData(res);
    } catch (err) {
      toast.error(extractApiError(err, "Could not update status"));
    } finally {
      setTogglingId(null);
    }
  }

  if (!hydrated || !accessToken || !user) return null;

  const ui = ROLE_UI[user.role] ?? ROLE_UI.retailer;
  const role = roleFromUserRole(user.role);

  function flattenTree(nodes: TreeNode[]): DownlineItem[] {
    const result: DownlineItem[] = [];
    for (const n of nodes) {
      const { children, ...item } = n;
      result.push(item);
      if (children.length) result.push(...flattenTree(children));
    }
    return result;
  }

  const allAgents = data?.tree ? flattenTree(data.tree) : [];

  const filtered = allAgents.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.mobile.includes(q) || m.uid.toLowerCase().includes(q);
  });

  const totalDirect = data?.downline.length ?? 0;
  const totalAll = data?.tree ? countAll(data.tree) : 0;
  const activeCount = (data?.downline ?? []).filter((m) => m.isActive).length;
  const directIds = new Set((data?.downline ?? []).map((d) => d.id));

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>Network</h1>
            <p className="text-sm" style={{ color: B.muted }}>Your agent hierarchy & downline</p>
          </div>
        </div>

        {data?.upline && (
          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="mb-3 flex items-center gap-2">
              <ArrowUpRight size={18} style={{ color: B.blue }} />
              <h2 className="font-bold" style={{ color: B.blue }}>Your Upline</h2>
            </div>
            <div className="flex items-center gap-4 rounded-xl p-4" style={{ background: B.secondary }}>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: B.blue }}
              >
                {initials(data.upline.name)}
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold" style={{ color: B.blue }}>{data.upline.name}</p>
                <p className="text-sm" style={{ color: B.muted }}>{data.upline.mobile}</p>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ background: role.color }}
              >
                {roleLabel(data.upline.role)}
              </span>
            </div>
          </div>
        )}

        {user.role !== "retailer" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                Direct {ui.downlineLabel}
              </p>
              <p className="mt-1 text-3xl font-bold" style={{ color: B.blue }}>{totalDirect}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>Total Network</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: B.green }}>{totalAll}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>Active (Direct)</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: activeCount > 0 ? B.green : "#ef4444" }}>
                {activeCount} / {totalDirect}
              </p>
            </div>
          </div>
        )}

        {user.role !== "retailer" && (
          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} style={{ color: B.blue }} />
                <h2 className="font-bold" style={{ color: B.blue }}>
                  {user.role === "distributor" ? "My Retailers" : "Network Hierarchy"}
                </h2>
                {totalAll > 0 && (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: B.green }}>
                    {totalAll} agents
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isSuperDist ? (
                  <div className="flex rounded-lg border" style={{ borderColor: B.border }}>
                    <button
                      type="button"
                      onClick={() => setView("tree")}
                      className="rounded-l-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ background: effectiveView === "tree" ? B.blue : "transparent", color: effectiveView === "tree" ? "#fff" : B.muted }}
                    >
                      Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      className="rounded-r-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ background: effectiveView === "table" ? B.blue : "transparent", color: effectiveView === "table" ? "#fff" : B.muted }}
                    >
                      Table
                    </button>
                  </div>
                ) : null}
                {effectiveView === "table" && (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: B.muted }} />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-lg border py-1.5 pl-9 pr-3 text-sm outline-none sm:w-56"
                      style={{ borderColor: B.border, color: B.blue }}
                    />
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <p className="py-10 text-center text-sm" style={{ color: B.muted }}>Loading…</p>
            ) : effectiveView === "tree" ? (
              (data?.tree ?? []).length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <UserCheck size={40} className="mb-3 opacity-30" style={{ color: B.muted }} />
                  <p className="text-sm" style={{ color: B.muted }}>{ui.emptyMsg}</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: B.border }}>
                  {data!.tree.map((node) => (
                    <TreeItem
                      key={node.id}
                      node={node}
                      depth={0}
                      canToggle={canToggleChildren}
                      togglingId={togglingId}
                      onToggle={(id, next) => void toggleChild(id, next)}
                    />
                  ))}
                </div>
              )
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <UserCheck size={40} className="mb-3 opacity-30" style={{ color: B.muted }} />
                <p className="text-sm" style={{ color: B.muted }}>{search ? "No results" : ui.emptyMsg}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: B.border, background: "#334155" }}>
                      {[
                        "Party",
                        "Main",
                        "AEPS",
                        "Credit",
                        "Top-Up",
                        "Reverse",
                        "History",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wider text-white"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m, idx) => {
                      const isDirect = directIds.has(m.id);
                      const moneyOk = canMoneyActions && isDirect && m.isActive;
                      const collectOk = moneyOk && Number(m.mainBalance) > 0;
                      return (
                        <tr
                          key={m.id}
                          className="border-b transition-colors hover:bg-blue-50/40"
                          style={{
                            borderColor: B.border,
                            background: idx % 2 === 0 ? "#FFFEF8" : "#fff",
                          }}
                        >
                          <td className="px-3 py-3">
                            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: B.blue }}>
                              {m.name}
                            </p>
                            <p className="text-xs font-medium" style={{ color: B.muted }}>
                              {m.mobile}
                            </p>
                            <p className="font-mono text-[12px]" style={{ color: B.muted }}>
                              {m.uid} · {roleLabel(m.role)}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-semibold tabular-nums" style={{ color: B.blue }}>
                            {formatInr(m.mainBalance)}
                          </td>
                          <td className="px-3 py-3 font-semibold tabular-nums" style={{ color: B.blue }}>
                            {formatInr(m.aepsBalance ?? "0")}
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: B.muted }}>
                            —
                          </td>
                          <td className="px-3 py-3">
                            <IconAction
                              title="Top up — send funds"
                              disabled={!moneyOk}
                              color="#DC2626"
                              onClick={() => setFundTarget(toDownlineUser(m))}
                            >
                              <ArrowDownToLine size={16} />
                            </IconAction>
                          </td>
                          <td className="px-3 py-3">
                            <IconAction
                              title="Reverse — pull funds from partner"
                              disabled={!collectOk}
                              color="#DC2626"
                              onClick={() => setPullTarget(toDownlineUser(m))}
                            >
                              <ArrowUpFromLine size={16} />
                            </IconAction>
                          </td>
                          <td className="px-3 py-3">
                            <IconAction
                              title="History"
                              disabled={false}
                              color="#F59E0B"
                              onClick={() => void openHistory(m)}
                            >
                              <History size={16} />
                            </IconAction>
                          </td>
                          <td className="px-3 py-3">
                            {canToggleChildren && isDirect ? (
                              <button
                                type="button"
                                disabled={togglingId === m.id}
                                onClick={() => void toggleChild(m.id, !m.isActive)}
                                className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
                                style={{
                                  borderColor: m.isActive ? "#fca5a5" : B.green,
                                  color: m.isActive ? "#b91c1c" : B.green,
                                }}
                              >
                                {togglingId === m.id ? "…" : m.isActive ? "Inactive" : "Active"}
                              </button>
                            ) : (
                              <span className="text-xs" style={{ color: m.isActive ? B.green : B.muted }}>
                                {m.isActive ? "Active" : "Inactive"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {user.role === "retailer" && !data?.upline && !loading && (
          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="flex flex-col items-center py-10">
              <UserCheck size={40} className="mb-3 opacity-30" style={{ color: B.muted }} />
              <p className="text-sm" style={{ color: B.muted }}>No upline info available</p>
            </div>
          </div>
        )}
      </div>

      {fundTarget && (
        <FundForm
          target={fundTarget}
          onClose={() => setFundTarget(null)}
          onSuccess={() => void reloadNetwork()}
        />
      )}
      {pullTarget && (
        <PullForm
          target={pullTarget}
          onClose={() => setPullTarget(null)}
          onSuccess={() => void reloadNetwork()}
        />
      )}
      {historyTarget && (
        <Modal title={`History — ${historyTarget.name}`} onClose={() => setHistoryTarget(null)}>
          {historyLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-gray-500">No transfers with this partner in your ledger yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {historyRows.map((e) => (
                <li key={e.id} className="rounded-lg border border-border-subtle px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {e.description || e.referenceType}
                    </span>
                    <span className={e.entryType === "credit" ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
                      {e.entryType === "credit" ? "+" : "−"}
                      {formatInr(e.amount)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(e.createdAt).toLocaleString("en-IN")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </AppShell>
  );
}

function IconAction({
  title,
  disabled,
  color,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  color: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: color }}
    >
      {children}
    </button>
  );
}
