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
import { TransferConfirm } from "./TransferConfirm";

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
  const [step, setStep] = useState<"form" | "confirm">("form");
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

  function review(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("Select at least one partner");
      return;
    }
    if (!(parseFloat(amount) > 0)) {
      toast.error("Enter an amount greater than ₹0");
      return;
    }
    setTxnPin("");
    setStep("confirm");
  }

  async function send() {
    if (loading) return;
    const ids = [...selected];
    if (txnPin.length !== 4) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }

    setLoading(true);
    let ok = 0;
    let failed = 0;
    let lastError = "Transfer failed. Check your balance and partner status.";
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
        } catch (err) {
          failed += 1;
          lastError = extractApiError(err, lastError);
          if (ok === 0 && /PIN/i.test(lastError)) break;
        }
      }
      if (ok > 0 && failed === 0) {
        toast.success(`Sent ₹${amount} to ${ok} partner${ok === 1 ? "" : "s"}`);
        onSuccess();
        onClose();
      } else if (ok > 0) {
        toast.error(`Transferred to ${ok}; failed for ${failed}. Last error: ${lastError}`);
        onSuccess();
        onClose();
      } else {
        setTxnPin("");
        toast.error(lastError);
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

  if (step === "confirm") {
    const names = active.filter((t) => selected.has(t.id)).map((t) => t.name).join(", ");
    return (
      <Modal title="Confirm bulk transfer" onClose={onClose}>
        <TransferConfirm
          amount={total}
          amountCaption="Total to transfer"
          rows={[
            { label: "Each", value: formatInr(perAmt) },
            { label: "Partners", value: String(selected.size) },
            { label: "To", value: names },
            { label: "From", value: "Main wallet" },
          ]}
          pin={txnPin}
          onPin={setTxnPin}
          loading={loading}
          onBack={() => setStep("form")}
          onConfirm={() => void send()}
        />
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={review} className="space-y-3">
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
        <PrimaryButton type="submit" variant="primary" disabled={selected.size === 0}>
          Continue
        </PrimaryButton>
      </form>
    </Modal>
  );
}
