"use client";

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Crown, Network as NetworkIcon, Store } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

const ROLE_ICON = { master_distributor: Crown, distributor: NetworkIcon, retailer: Store } as const;
const ROLE_LABEL = { master_distributor: "Super Distributor", distributor: "Distributor", retailer: "Retailer" } as const;
const REQUIRED_PARENT_ROLE = { retailer: "distributor", distributor: "master_distributor" } as const;

interface ParentCandidate {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
}

interface AncestorInfo {
  id: string;
  uid: string;
  name: string;
  mobile: string;
  role: string;
}

interface MoveTarget {
  id: string;
  name: string;
  mobile: string;
  role: "distributor" | "retailer";
}

/**
 * Single shared Move modal — used by both the Table view and the Network Tree view so there's
 * one flow, not two divergent ones. Pass a single-item array for one agent, or multiple for a
 * bulk move (all items must share the same role — caller enforces this before opening).
 */
export function MoveAgentModal({
  agents,
  onClose,
  onMoved,
}: {
  agents: MoveTarget[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const isBulk = agents.length > 1;
  const primary = agents[0]!;

  const [ancestors, setAncestors] = useState<AncestorInfo[]>([]);
  const [ancestorsLoading, setAncestorsLoading] = useState(!isBulk);
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<ParentCandidate[]>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [selectedParent, setSelectedParent] = useState<ParentCandidate | null>(null);
  const [moving, setMoving] = useState(false);

  // "Currently under" chain only makes sense for a single agent — a bulk selection can span
  // different current parents, so skip it there rather than show something misleading.
  useEffect(() => {
    if (isBulk) return;
    let alive = true;
    setAncestorsLoading(true);
    fetchApi<AncestorInfo[]>(`/admin/users/${primary.id}/ancestors`)
      .then((rows) => alive && setAncestors(rows))
      .catch(() => alive && setAncestors([]))
      .finally(() => alive && setAncestorsLoading(false));
    return () => {
      alive = false;
    };
  }, [isBulk, primary.id]);

  useEffect(() => {
    if (selectedParent) return;
    const q = parentQuery.trim();
    if (q.length < 3) {
      setParentResults([]);
      return;
    }
    const requiredRole = REQUIRED_PARENT_ROLE[primary.role];
    const t = setTimeout(async () => {
      setParentSearching(true);
      try {
        const rows = await fetchApi<ParentCandidate[]>("/admin/users", { role: requiredRole, q, limit: "8" });
        setParentResults(rows);
      } catch {
        setParentResults([]);
      } finally {
        setParentSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [parentQuery, selectedParent, primary.role]);

  async function confirmMove() {
    if (!selectedParent) return;
    setMoving(true);
    try {
      const results = await Promise.allSettled(
        agents.map((a) => api.post(`/admin/users/${a.id}/reassign`, { newParentId: selectedParent.id })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const okCount = agents.length - failed;
      if (failed === 0) {
        toast.success(
          isBulk ? `${okCount} agents moved under ${selectedParent.name}` : `${primary.name} moved under ${selectedParent.name}`,
        );
      } else if (okCount > 0) {
        toast.error(`${okCount} moved, ${failed} failed — check and retry the rest`);
      } else {
        toast.error("Move failed");
      }
      onMoved();
      onClose();
    } finally {
      setMoving(false);
    }
  }

  const targetRoleLabel = primary.role === "retailer" ? "Distributor" : "Super Distributor";

  return (
    <Modal title={isBulk ? `Move ${agents.length} ${ROLE_LABEL[primary.role]}s` : `Move ${primary.name}`} onClose={onClose}>
      <div className="p-1">
        {isBulk ? (
          <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border px-3 py-2" style={{ borderColor: B.border, background: B.secondary }}>
            {agents.map((a) => (
              <div key={a.id} className="text-sm" style={{ color: B.blue }}>
                {a.name} <span style={{ color: B.muted }}>· +91 {a.mobile}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: B.muted }}>
            {ROLE_LABEL[primary.role]} · +91 {primary.mobile}
          </p>
        )}

        {!isBulk && !ancestorsLoading && ancestors.length > 0 && (
          <div className="mt-3 rounded-lg border px-3 py-3" style={{ borderColor: B.border, background: B.secondary }}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: B.muted }}>
              Currently under
            </div>
            {[...ancestors].reverse().map((a, idx, arr) => {
              const AIcon = ROLE_ICON[a.role as keyof typeof ROLE_ICON] ?? Store;
              const isLast = idx === arr.length - 1;
              return (
                <div key={a.id} className="flex items-start gap-2.5">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${B.blueLight}1a` }}>
                      <AIcon size={14} style={{ color: B.blueLight }} />
                    </div>
                    {!isLast && <div className="my-0.5 w-px flex-1" style={{ background: B.border, minHeight: 18 }} />}
                  </div>
                  <div className={`min-w-0 ${isLast ? "" : "pb-3"}`}>
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                        {a.name}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: `${B.blueLight}1a`, color: B.blueLight }}
                      >
                        {ROLE_LABEL[a.role as keyof typeof ROLE_LABEL]}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: B.muted }}>
                      +91 {a.mobile} · {a.uid}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: B.border }} />
          <span className="text-xs" style={{ color: B.muted }}>
            move to
          </span>
          <div className="h-px flex-1" style={{ background: B.border }} />
        </div>

        <p className="text-sm font-medium" style={{ color: B.blue }}>
          Search the new {targetRoleLabel} by mobile number
        </p>

        {selectedParent ? (
          <div
            className="mt-3 flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2"
            style={{ borderColor: B.green, background: `${B.green}12` }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${B.green}26` }}>
                {(() => {
                  const SIcon = ROLE_ICON[selectedParent.role as keyof typeof ROLE_ICON] ?? Store;
                  return <SIcon size={15} style={{ color: B.green }} />;
                })()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" style={{ color: B.blue }}>
                  {selectedParent.name}
                </div>
                <div className="text-xs" style={{ color: B.muted }}>
                  +91 {selectedParent.mobile} · {selectedParent.uid}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedParent(null);
                setParentQuery("");
              }}
              className="shrink-0 text-xs font-medium"
              style={{ color: B.blueLight }}
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative mt-3">
            <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: B.border, background: B.bg }}>
              <span className="border-r px-3 py-2 text-sm font-medium" style={{ borderColor: B.border, color: B.muted }}>
                +91
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="10-digit mobile number"
                value={parentQuery}
                onChange={(e) => setParentQuery(e.target.value.replace(/\D/g, "").slice(0, 10))}
                maxLength={10}
                autoFocus
                className="w-full bg-transparent px-3 py-2 text-sm outline-none"
                style={{ color: B.blue }}
              />
            </div>
            {(parentSearching || parentResults.length > 0 || parentQuery.trim().length >= 3) && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white shadow-lg" style={{ borderColor: B.border }}>
                {parentSearching ? (
                  <div className="px-3 py-3 text-center text-xs" style={{ color: B.muted }}>
                    Searching…
                  </div>
                ) : parentResults.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs" style={{ color: B.muted }}>
                    No {targetRoleLabel} found for &quot;{parentQuery.trim()}&quot;
                  </div>
                ) : (
                  parentResults.map((p) => {
                    const PIcon = ROLE_ICON[p.role as keyof typeof ROLE_ICON] ?? Store;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedParent(p);
                          setParentResults([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
                      >
                        <PIcon size={14} style={{ color: B.blueLight }} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" style={{ color: B.blue }}>
                            {p.name}
                          </div>
                          <div className="text-xs" style={{ color: B.muted }}>
                            +91 {p.mobile} · {p.uid}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: B.border, color: B.muted }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={moving || !selectedParent}
            onClick={() => void confirmMove()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: B.badgeGrad }}
          >
            {moving ? "Moving…" : isBulk ? `Move ${agents.length}` : "Confirm Move"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
