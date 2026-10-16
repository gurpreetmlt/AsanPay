"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserCheck,
  Search,
  ChevronRight,
  ChevronDown,
  Crown,
  Network as NetworkIcon,
  Store,
  History,
  Power,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { WalletActionForm } from "@/components/dashboard/WalletActionForm";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { InviteAgentPanel } from "@/components/network/InviteAgentPanel";
import api, { fetchApi } from "@/lib/api";
import { B, initials } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { extractApiError } from "@/lib/onboarding";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser, LedgerEntry } from "@/lib/types";
import type { UserRole } from "@asanpay/shared-types";
import Link from "next/link";

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
          <ActionIconButton
            title={node.isActive ? "Disable agent" : "Enable agent"}
            tone={node.isActive ? "amber" : "green"}
            disabled={busy}
            onClick={() => onToggle(node.id, !node.isActive)}
          >
            <Power size={15} strokeWidth={2.25} />
          </ActionIconButton>
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
  const [walletTarget, setWalletTarget] = useState<{
    user: DownlineUser;
    allowReverse: boolean;
    initialKind: "transfer" | "reverse";
  } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<DownlineItem | null>(null);
  const [historyRows, setHistoryRows] = useState<LedgerEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canToggleChildren = user?.role === "super_distributor" || user?.role === "distributor";
  const canMoneyActions = canToggleChildren;
  /** Tree view: Super Distributor only. Distributors always get flat table. */
  const isSuperDist = user?.role === "super_distributor";
  const effectiveView: "tree" | "table" = isSuperDist ? view : "table";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("q")?.trim();
    if (fromUrl) {
      setSearch(fromUrl);
      if (isSuperDist) setView("table");
    }
  }, [isSuperDist]);

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
      <div className="dash-page-stagger mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: B.blue }}>Network</h1>
            <p className="text-sm" style={{ color: B.muted }}>Your agent hierarchy & downline</p>
          </div>
        </div>

        {user.role !== "retailer" && (
          <div className="dash-stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="dash-card-hover rounded-2xl border bg-white p-5"
              style={{ borderColor: B.border }}
            >
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>
                Direct {ui.downlineLabel}
              </p>
              <p className="mt-1 text-3xl font-bold" style={{ color: B.blue }}>{totalDirect}</p>
            </div>
            <div
              className="dash-card-hover rounded-2xl border bg-white p-5"
              style={{ borderColor: B.border }}
            >
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>Total Network</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: B.green }}>{totalAll}</p>
            </div>
            <div
              className="dash-card-hover rounded-2xl border bg-white p-5"
              style={{ borderColor: B.border }}
            >
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: B.muted }}>Active (Direct)</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: activeCount > 0 ? B.green : "#ef4444" }}>
                {activeCount} / {totalDirect}
              </p>
            </div>
          </div>
        )}

        {user.role === "super_distributor" || user.role === "distributor" ? (
          <Suspense fallback={null}>
            <InviteAgentPanel childRole={user.role === "super_distributor" ? "distributor" : "retailer"} />
          </Suspense>
        ) : null}

        {user.role !== "retailer" && (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: B.border }}>
            <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: B.border }}>
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
                  <div className="flex overflow-hidden rounded-xl border" style={{ borderColor: B.border }}>
                    <button
                      type="button"
                      onClick={() => setView("tree")}
                      className="px-3 py-1.5 text-xs font-semibold"
                      style={{ background: effectiveView === "tree" ? B.blue : "transparent", color: effectiveView === "tree" ? "#fff" : B.muted }}
                    >
                      Tree
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("table")}
                      className="px-3 py-1.5 text-xs font-semibold"
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
                      placeholder="Search name, mobile, UID…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none sm:w-60"
                      style={{ borderColor: B.border, color: B.blue, background: B.bg }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-0 sm:p-0">
            {loading ? (
              <p className="py-10 text-center text-sm" style={{ color: B.muted }}>Loading…</p>
            ) : effectiveView === "tree" ? (
              (data?.tree ?? []).length === 0 ? (
                <EmptyState
                  icon={<UserCheck size={22} strokeWidth={1.75} />}
                  title={ui.emptyMsg}
                  description="Onboard your first partner to grow the network."
                  action={
                    <PrimaryButton
                      type="button"
                      variant="success"
                      size="sm"
                      showArrow={false}
                      className="!w-auto"
                      onClick={() => router.push("/onboarding/outlet")}
                    >
                      Onboard partner
                    </PrimaryButton>
                  }
                />
              ) : (
                <div className="divide-y px-2 py-2" style={{ borderColor: B.border }}>
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
              <EmptyState
                icon={<UserCheck size={22} strokeWidth={1.75} />}
                title={search ? "No results" : ui.emptyMsg}
                description={
                  search
                    ? "Try another UID, mobile, or name."
                    : "Onboard your first partner to grow the network."
                }
                action={
                  search ? (
                    <PrimaryButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      showArrow={false}
                      className="!w-auto"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton
                      type="button"
                      variant="success"
                      size="sm"
                      showArrow={false}
                      className="!w-auto"
                      onClick={() => router.push("/onboarding/outlet")}
                    >
                      Onboard partner
                    </PrimaryButton>
                  )
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr
                      className="border-b text-xs uppercase tracking-wider"
                      style={{ borderColor: B.border, background: B.secondary, color: B.muted }}
                    >
                      {[
                        "Party",
                        "Main",
                        "AEPS",
                        "Credit",
                        "History",
                        "Status",
                        "Actions",
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-4 py-3 font-semibold"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => {
                      const isDirect = directIds.has(m.id);
                      const moneyOk = canMoneyActions && isDirect && m.isActive;
                      const collectOk = moneyOk && Number(m.mainBalance) > 0;
                      return (
                        <tr
                          key={m.id}
                          className="border-b last:border-0 transition-colors hover:bg-blue-50/50"
                          style={{ borderColor: B.border }}
                        >
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-bold" style={{ color: B.blue }}>
                              {m.name}
                            </p>
                            <p className="text-xs font-medium" style={{ color: B.muted }}>
                              {m.mobile}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px]" style={{ color: B.muted }}>
                              {m.uid} · {roleLabel(m.role)}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 font-semibold tabular-nums" style={{ color: B.blue }}>
                            {formatInr(m.mainBalance)}
                          </td>
                          <td className="px-4 py-3.5 font-semibold tabular-nums" style={{ color: B.blue }}>
                            {m.role === "retailer" || m.role === "direct_retailer"
                              ? formatInr(m.aepsBalance ?? "0")
                              : "—"}
                          </td>
                          <td className="px-4 py-3.5 text-xs" style={{ color: B.muted }}>
                            —
                          </td>
                          <td className="px-4 py-3.5">
                            <ActionIconButton
                              title="History"
                              tone="amber"
                              onClick={() => void openHistory(m)}
                            >
                              <History size={16} strokeWidth={2.25} />
                            </ActionIconButton>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge tone={m.isActive ? "success" : "danger"}>
                              {m.isActive ? "Active" : "Inactive"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                title={
                                  moneyOk
                                    ? `Transfer to ${m.name}`
                                    : m.isActive
                                      ? "Only your direct downline can transfer"
                                      : "Agent is inactive — enable to transfer"
                                }
                                disabled={!moneyOk}
                                onClick={() =>
                                  setWalletTarget({
                                    user: toDownlineUser(m),
                                    allowReverse: collectOk,
                                    initialKind: "transfer",
                                  })
                                }
                                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-bold transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                style={{ borderColor: B.blue, color: B.blue }}
                              >
                                Transfer
                              </button>
                              <button
                                type="button"
                                title={
                                  collectOk
                                    ? `Reverse from ${m.name}`
                                    : moneyOk
                                      ? "Reverse needs their main balance above ₹0"
                                      : m.isActive
                                        ? "Only your direct downline can reverse"
                                        : "Agent is inactive — enable to reverse"
                                }
                                disabled={!collectOk}
                                onClick={() =>
                                  setWalletTarget({
                                    user: toDownlineUser(m),
                                    allowReverse: collectOk,
                                    initialKind: "reverse",
                                  })
                                }
                                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-bold transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                                style={{ borderColor: "#16A34A", color: "#15803D" }}
                              >
                                Reverse
                              </button>
                              {canToggleChildren && isDirect ? (
                                <button
                                  type="button"
                                  title={m.isActive ? `Disable ${m.name}` : `Enable ${m.name}`}
                                  disabled={togglingId === m.id}
                                  onClick={() => void toggleChild(m.id, !m.isActive)}
                                  className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${m.isActive ? "hover:bg-red-50" : "hover:bg-green-50"}`}
                                  style={
                                    m.isActive
                                      ? { borderColor: "#DC2626", color: "#B91C1C" }
                                      : { borderColor: "#16A34A", color: "#15803D" }
                                  }
                                >
                                  <Power size={13} strokeWidth={2.5} />
                                  {m.isActive ? "Disable" : "Enable"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        )}

        {user.role === "retailer" && !loading && (
          <div className="rounded-2xl border bg-white p-5" style={{ borderColor: B.border }}>
            <div className="flex flex-col items-center py-10 text-center">
              <UserCheck size={40} className="mb-3 opacity-30" style={{ color: B.muted }} />
              <p className="text-sm font-semibold" style={{ color: B.blue }}>
                Upline contacts are on Support
              </p>
              <p className="mt-1 max-w-sm text-sm" style={{ color: B.muted }}>
                Call or message your distributor from the Support page.
              </p>
              <Link
                href="/support"
                className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ background: B.badgeGrad }}
              >
                Open Support
              </Link>
            </div>
          </div>
        )}
      </div>

      {walletTarget ? (
        <WalletActionForm
          target={walletTarget.user}
          initialKind={walletTarget.initialKind}
          allowReverse={walletTarget.allowReverse}
          onClose={() => setWalletTarget(null)}
          onSuccess={() => void reloadNetwork()}
        />
      ) : null}
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
