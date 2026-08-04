"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import type { DownlineUser } from "@/lib/types";

interface FundFormProps {
  target: DownlineUser;
  onClose: () => void;
  onSuccess: () => void;
}

/** Admin mints float into a Super Dist wallet (no /wallet/transfer for admin). */
export function FundForm({ target, onClose, onSuccess }: FundFormProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder("admin-fund-md"));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!/^\d{4}$/.test(txnPin)) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }
    setLoading(true);
    try {
      await api.post("/wallet/fund", {
        targetUserId: target.id,
        amount,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
        ...(description ? { description } : {}),
      });
      attemptKey.current.clear();
      toast.success(`₹${amount} loaded to ${target.name}`);
      onSuccess();
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Funding failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={`Load float · ${target.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Mints float into this Super Distributor wallet (admin does not transfer from own balance).
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₹)</label>
          <input
            required
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="1000.00"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Txn PIN</label>
          <input
            required
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={txnPin}
            onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Load float"}
        </button>
      </form>
    </Modal>
  );
}
