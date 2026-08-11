"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { extractApiError } from "@/lib/onboarding";
import { newIdempotencyKey } from "@/lib/idempotencyKey";
import { B } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser } from "@/lib/types";

interface BulkFundFormProps {
  targets: DownlineUser[];
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkFundForm({
  targets,
  title = "Bulk transfer",
  onClose,
  onSuccess,
}: BulkFundFormProps) {
  const active = useMemo(() => targets.filter((t) => t.isActive), [targets]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(active.map((t) => t.id)));
  const [amount, setAmount] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const runId = useRef(newIdempotencyKey("bulk"));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const ids = [...selected];
    const amt = parseFloat(amount);
    if (ids.length === 0) {
      toast.error("Select at least one partner");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (txnPin.length !== 4) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }

    setLoading(true);
    let ok = 0;
    let failed = 0;
    const batch = runId.current;
    try {
      for (const id of ids) {
        try {
          await api.post("/wallet/transfer", {
            targetUserId: id,
            walletType: "main",
            amount,
            txnPin,
            idempotencyKey: `${batch}-${id}`.slice(0, 100),
            description: `Bulk transfer`,
          });
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok > 0 && failed === 0) {
        toast.success(`Sent ₹${amount} to ${ok} partner${ok === 1 ? "" : "s"}`);
        onSuccess();
        onClose();
      } else if (ok > 0) {
        toast.error(`Transferred to ${ok}; failed for ${failed}. Check balances and retry.`);
        onSuccess();
      } else {
        toast.error("All transfers failed. Check PIN, balance, and partner status.");
      }
    } catch (err) {
      toast.error(extractApiError(err, "Bulk transfer failed"));
    } finally {
      setLoading(false);
      runId.current = newIdempotencyKey("bulk");
    }
  }

  const perAmt = parseFloat(amount) || 0;
  const total = perAmt * selected.size;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs" style={{ color: B.muted }}>
          Same amount to each selected partner. Each transfer uses its own Idempotency-Key.
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2" style={{ borderColor: B.border }}>
          {active.length === 0 ? (
            <p className="px-2 py-3 text-sm" style={{ color: B.muted }}>
              No active partners to fund
            </p>
          ) : (
            active.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: B.blue }}>
                  {t.name}
                </span>
                <span className="text-xs tabular-nums" style={{ color: B.muted }}>
                  {formatInr(t.mainBalance)}
                </span>
              </label>
            ))
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount each (₹)</label>
          <input
            required
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="1000.00"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          {selected.size > 0 && perAmt > 0 ? (
            <p className="mt-1 text-xs" style={{ color: B.muted }}>
              Total debit ≈ {formatInr(total)} ({selected.size} × {formatInr(perAmt)})
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Transaction PIN</label>
          <input
            required
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={txnPin}
            onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit PIN"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <PrimaryButton
          type="submit"
          variant="primary"
          disabled={loading || txnPin.length !== 4 || selected.size === 0}
          loading={loading}
        >
          Confirm bulk transfer
        </PrimaryButton>
      </form>
    </Modal>
  );
}
