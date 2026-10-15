"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { ArrowRight, Loader2, Send, Undo2, Wallet, X } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";

export type WalletMoveKind = "transfer" | "reverse";

interface Party {
  id: string;
  name: string;
  uid: string;
  role: string;
  balance: string;
}

interface MoveContext {
  agent: Party;
  upline: Party | null;
  dualApprovalFrom: string;
}

const ROLE_LABEL: Record<string, string> = {
  super_distributor: "Super Distributor",
  distributor: "Distributor",
  retailer: "Retailer",
};

function inr(v: string) {
  return `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function errMessage(err: unknown, fallback: string) {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e.response?.data?.message ?? e.message ?? fallback;
}

export function WalletMoveModal({
  agentId,
  initialKind,
  onClose,
  onDone,
}: {
  agentId: string;
  initialKind: WalletMoveKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [ctx, setCtx] = useState<MoveContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<WalletMoveKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchApi<MoveContext>(`/admin/agents/${agentId}/wallet-move-context`)
      .then(setCtx)
      .catch((err) => setLoadError(errMessage(err, "Could not load wallet balances")));
  }, [agentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const amountNum = Number(amount);
  const payer = ctx ? (kind === "transfer" ? ctx.upline : ctx.agent) : null;
  const overBalance = payer ? amountNum > Number(payer.balance) : false;
  const needsChecker = ctx ? amountNum >= Number(ctx.dualApprovalFrom) : false;

  async function submit() {
    if (!ctx?.upline) return;
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || amountNum <= 0) {
      return void toast.error("Enter a valid amount, e.g. 500 or 500.50");
    }
    if (overBalance) {
      return void toast.error(`${payer!.name}'s wallet has only ${inr(payer!.balance)}`);
    }
    if (reason.trim().length < 5) return void toast.error("Reason must be at least 5 characters");
    setSaving(true);
    try {
      const { data } = await api.post(`/admin/agents/${agentId}/wallet-move`, {
        kind,
        amount: amount.trim(),
        reason: reason.trim(),
      });
      if (!data.success) throw new Error(data.message);
      toast.success(
        data.data.status === "done"
          ? `${kind === "transfer" ? "Transferred" : "Reversed"} ${inr(amount)}`
          : `${inr(amount)} sent for second admin approval`,
      );
      onDone();
      onClose();
    } catch (err) {
      toast.error(errMessage(err, kind === "transfer" ? "Transfer failed" : "Reverse failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const from = ctx ? (kind === "transfer" ? ctx.upline : ctx.agent) : null;
  const to = ctx ? (kind === "transfer" ? ctx.agent : ctx.upline) : null;

  return createPortal(
    <div
      className="bank-entry-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bank-entry-modal w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: B.border }}>
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: B.blue }}>
            <Wallet size={20} /> Agent wallet
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-1.5 transition hover:rotate-90 hover:bg-slate-100"
            style={{ color: B.muted }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loadError ? (
            <p className="text-sm font-semibold text-red-600">{loadError}</p>
          ) : !ctx ? (
            <p className="flex items-center gap-2 text-sm" style={{ color: B.muted }}>
              <Loader2 size={16} className="animate-spin" /> Loading balances…
            </p>
          ) : !ctx.upline ? (
            <p className="text-sm font-semibold text-red-600">
              {ctx.agent.name} has no Super Distributor / Distributor upline wallet. Super Distributors are funded through
              fund requests.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "transfer", label: "Transfer", Icon: Send, color: "#059669" },
                    { key: "reverse", label: "Reverse", Icon: Undo2, color: "#D97706" },
                  ] as const
                ).map(({ key, label, Icon, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setKind(key)}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition hover:-translate-y-0.5 active:scale-95"
                    style={
                      kind === key
                        ? { borderColor: color, background: `${color}14`, color }
                        : { borderColor: B.border, color: B.muted }
                    }
                  >
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>

              <div key={kind} className="panel-fade-in flex items-center gap-2 rounded-xl border p-3" style={{ borderColor: B.border }}>
                {[from!, to!].map((p, i) => (
                  <div key={p.id} className="contents">
                    {i === 1 ? <ArrowRight size={18} className="shrink-0" style={{ color: B.muted }} /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase" style={{ color: B.muted }}>
                        {i === 0 ? "From" : "To"} · {ROLE_LABEL[p.role] ?? p.role}
                      </p>
                      <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                        {p.name}
                      </p>
                      <p className="text-xs" style={{ color: B.muted }}>
                        {p.uid} · {inr(p.balance)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <label className="block">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Amount (₹) *
                </span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: overBalance ? "#FCA5A5" : B.border }}
                />
                {overBalance ? (
                  <span className="mt-1 block text-xs font-semibold text-red-600">
                    {from!.name}&apos;s wallet has only {inr(from!.balance)}
                  </span>
                ) : needsChecker ? (
                  <span className="mt-1 block text-xs font-semibold" style={{ color: "#B45309" }}>
                    {inr(ctx.dualApprovalFrom)} or more needs a second admin to approve before it moves
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className="text-xs font-semibold" style={{ color: B.muted }}>
                  Reason * (min 5 characters)
                </span>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={kind === "transfer" ? "e.g. Upline asked admin to fund" : "e.g. Sent to wrong retailer"}
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  style={{ borderColor: B.border }}
                />
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: B.border }}>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
            style={{ background: B.danger }}
          >
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            disabled={saving || !ctx?.upline}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
            style={{ background: "#2A5CDD" }}
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : kind === "transfer" ? (
              <Send size={15} />
            ) : (
              <Undo2 size={15} />
            )}
            {saving ? "Working…" : needsChecker ? "Send for approval" : kind === "transfer" ? "Transfer" : "Reverse"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
