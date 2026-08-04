"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { ChevronDown, ChevronRight, Crown, Network as NetworkIcon, Store, Move, Search } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { MoveAgentModal } from "@/components/users/MoveAgentModal";

interface TreeNode {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: "master_distributor" | "distributor" | "retailer";
  isActive: boolean;
  mainBalance: string;
  children: TreeNode[];
}

const ROLE_ICON = { master_distributor: Crown, distributor: NetworkIcon, retailer: Store } as const;
const ROLE_LABEL = { master_distributor: "Super Distributor", distributor: "Distributor", retailer: "Retailer" } as const;
/** Only these roles have a reassignable parent (Super Distributor's parent is Admin, not a user row). */
const MOVABLE_ROLES = new Set(["distributor", "retailer"]);

function errMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children.length) out.push(...flatten(n.children));
  }
  return out;
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onMove,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  onMove: (node: TreeNode) => void;
}) {
  const isOpen = expanded[node.id] !== false; // default expanded
  const Icon = ROLE_ICON[node.role];
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-black/5"
        style={{ paddingLeft: depth * 24 + 8 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          {isOpen ? <ChevronDown size={14} style={{ color: B.muted }} /> : <ChevronRight size={14} style={{ color: B.muted }} />}
        </button>
        <Icon size={15} style={{ color: B.blueLight }} />
        <span className="font-medium" style={{ color: B.blue }}>
          {node.name}
        </span>
        <span className="text-xs" style={{ color: B.muted }}>
          {node.uid} · {node.mobile} · {ROLE_LABEL[node.role]}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: node.isActive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: node.isActive ? "#16a34a" : "#dc2626",
          }}
        >
          {node.isActive ? "Active" : "Inactive"}
        </span>
        <span className="text-xs" style={{ color: B.muted }}>
          ₹{node.mainBalance}
        </span>
        {hasChildren && (
          <span className="text-xs" style={{ color: B.muted }}>
            ({node.children.length})
          </span>
        )}
        {MOVABLE_ROLES.has(node.role) && (
          <button
            type="button"
            onClick={() => onMove(node)}
            className="ml-auto flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium"
            style={{ borderColor: B.border, color: B.blueLight }}
          >
            <Move size={12} />
            Move
          </button>
        )}
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onMove={onMove} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full org hierarchy — used as the "Tree" tab inside the All Agents page (UsersPanel).
 * Move flow is the shared MoveAgentModal (same one Table view uses) — one modal, not two.
 */
export function NetworkTreeView() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [moveTarget, setMoveTarget] = useState<TreeNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchApi<TreeNode[]>("/admin/network-tree");
      setTree(data);
    } catch (err) {
      toast.error(errMessage(err, "Failed to load network tree"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  const allNodes = flatten(tree);
  const searchMatches = search.trim()
    ? allNodes.filter((n) => {
        const q = search.toLowerCase();
        return n.name.toLowerCase().includes(q) || n.mobile.includes(q) || n.uid.toLowerCase().includes(q);
      })
    : [];

  return (
    <>
      <p className="text-sm" style={{ color: B.muted }}>
        Full org hierarchy from every Super Distributor down. Move a single Distributor or
        Retailer to a different parent.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: B.border, background: B.card }}>
        <Search size={16} style={{ color: B.muted }} />
        <input
          type="text"
          placeholder="Search by name, mobile, or UID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: B.blue }}
        />
      </div>

      <div className="mt-4 rounded-xl border p-2" style={{ borderColor: B.border, background: B.card }}>
        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: B.muted }}>
            Loading…
          </div>
        ) : search.trim() ? (
          searchMatches.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: B.muted }}>
              No match
            </div>
          ) : (
            searchMatches.map((n) => <TreeRow key={n.id} node={{ ...n, children: [] }} depth={0} expanded={expanded} onToggle={toggle} onMove={setMoveTarget} />)
          )
        ) : tree.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: B.muted }}>
            No Super Distributors yet.
          </div>
        ) : (
          tree.map((n) => <TreeRow key={n.id} node={n} depth={0} expanded={expanded} onToggle={toggle} onMove={setMoveTarget} />)
        )}
      </div>

      {moveTarget && (
        <MoveAgentModal
          agents={[
            {
              id: moveTarget.id,
              name: moveTarget.name,
              mobile: moveTarget.mobile,
              role: moveTarget.role as "distributor" | "retailer",
            },
          ]}
          onClose={() => setMoveTarget(null)}
          onMoved={() => void load()}
        />
      )}
    </>
  );
}
