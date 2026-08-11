"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { X } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import api from "@/lib/api";
import { extractApiError } from "@/lib/onboarding";

const CATEGORIES = [
  { value: "customer_debited_no_service", label: "Customer debited, no service given" },
  { value: "duplicate_charge", label: "Duplicate charge" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "chargeback", label: "Chargeback from aggregator" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  transactionId: string;
  txnRef: string;
  onClose: () => void;
  onRaised: () => void;
}

/**
 * Structured dispute intake, replacing "handled over WhatsApp with no record" (task #11).
 * Backend enforces one open dispute per transaction — a duplicate submit surfaces that error
 * rather than silently succeeding.
 */
export function RaiseDisputeModal({ transactionId, txnRef, onClose, onRaised }: Props) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>(CATEGORIES[0].value);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (description.trim().length < 10) {
      toast.error("Describe the issue — at least 10 characters");
      return;
    }
    setBusy(true);
    try {
      await api.post("/disputes", { transactionId, category, description: description.trim() });
      toast.success("Dispute raised — our team will review it");
      onRaised();
      onClose();
    } catch (err) {
      toast.error(extractApiError(err, "Could not raise dispute"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="confirm-modal-panel w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: B.blue }}>
              Raise a dispute
            </h2>
            <p className="text-xs" style={{ color: B.muted }}>
              Txn {txnRef}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} style={{ color: B.muted }} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: B.blue }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: B.blue }}>
              What happened?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Customer's account was debited but cash was not dispensed…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </div>

          <PrimaryButton
            type="button"
            variant="primary"
            disabled={busy}
            loading={busy}
            onClick={() => void submit()}
          >
            Submit dispute
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
