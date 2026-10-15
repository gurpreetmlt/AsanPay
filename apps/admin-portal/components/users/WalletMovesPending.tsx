"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Send, Undo2, X } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";

interface WalletMove {
  id: string;
  kind: "transfer" | "reverse";
  amount: string;
  reason: string;
  createdAt: string;
  agent: { name: string; uid: string };
  uplineName: string;
  requestedById: string;
  requestedBy: string | null;
}

function inr(v: string) {
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Large admin Transfer / Reverse requests waiting for a second admin. Hidden when none. */
export function WalletMovesPending({ refreshKey }: { refreshKey: number }) {
  const me = useAuthStore((s) => s.user);
  const [moves, setMoves] = useState<WalletMove[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMoves(await fetchApi<WalletMove[]>("/admin/wallet-moves", { status: "requested" }));
    } catch {
      setMoves([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function decide(m: WalletMove, decision: "approve" | "reject") {
    setBusy(m.id);
    try {
      await api.post(`/admin/wallet-moves/${m.id}/${decision}`, {});
      toast.success(decision === "approve" ? `${inr(m.amount)} moved` : "Request rejected");
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? `Could not ${decision} the request`);
    } finally {
      setBusy(null);
    }
  }

  if (moves.length === 0) return null;

  return (
    <div className="panel-fade-in mb-4 rounded-2xl border p-4" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
      <p className="mb-2 text-sm font-bold" style={{ color: "#B45309" }}>
        {moves.length} wallet move{moves.length > 1 ? "s" : ""} waiting for a second admin
      </p>
      <div className="space-y-2">
        {moves.map((m) => {
          const mine = me?.id === m.requestedById;
          const Icon = m.kind === "transfer" ? Send : Undo2;
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm">
              <Icon size={16} style={{ color: m.kind === "transfer" ? "#059669" : "#D97706" }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold" style={{ color: B.blue }}>
                  {m.kind === "transfer"
                    ? `${inr(m.amount)} · ${m.uplineName} → ${m.agent.name}`
                    : `${inr(m.amount)} · ${m.agent.name} → ${m.uplineName}`}
                </p>
                <p className="truncate text-xs" style={{ color: B.muted }}>
                  {m.reason} · by {m.requestedBy ?? "admin"}
                </p>
              </div>
              <button
                type="button"
                disabled={!!busy || mine}
                title={mine ? "Another admin must approve your request" : undefined}
                onClick={() => void decide(m, "approve")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
                style={{ background: "#059669" }}
              >
                <Check size={13} /> Approve
              </button>
              <button
                type="button"
                disabled={!!busy || mine}
                onClick={() => void decide(m, "reject")}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
                style={{ background: B.danger }}
              >
                <X size={13} /> Reject
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
