"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import api from "@/lib/api";
import { Undo2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { ROLE_LABEL } from "@/lib/roles";
import { formatInr } from "@/lib/walletLabels";
import type { DownlineUser } from "@/lib/types";
import { TransferConfirm } from "./TransferConfirm";

interface PullFormProps {
  target: DownlineUser;
  onClose: () => void;
  onSuccess: () => void;
}

export function PullForm({ target, onClose, onSuccess }: PullFormProps) {
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(`pull-${target.id}`));

  function review(e: FormEvent) {
    e.preventDefault();
    if (!(parseFloat(amount) > 0)) {
      toast.error("Enter an amount greater than ₹0");
      return;
    }
    if (parseFloat(amount) > Number(target.mainBalance)) {
      toast.error("Amount is higher than their main wallet balance");
      return;
    }
    setTxnPin("");
    setStep("confirm");
  }

  async function send() {
    if (loading) return;
    if (txnPin.length !== 4) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }
    setLoading(true);
    try {
      await api.post("/wallet/pull/confirm", {
        targetUserId: target.id,
        walletType: "main",
        amount,
        txnPin,
        idempotencyKey: attemptKey.current.get(),
        ...(description ? { description } : {}),
      });
      attemptKey.current.clear();
      toast.success(`₹${amount} reversed from ${target.name}`);
      onSuccess();
      onClose();
    } catch (err) {
      setTxnPin("");
      toast.error(extractApiError(err, "Reverse failed"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "confirm") {
    return (
      <Modal
        title="Confirm reverse"
        onClose={onClose}
        icon={<Undo2 size={20} />}
        iconTone="amber"
        subtitle="Check the details before you confirm."
      >
        <TransferConfirm
          amount={amount}
          amountCaption="You are reversing"
          recipient={{
            name: target.name,
            subtitle: `${ROLE_LABEL[target.role] ?? target.role} · ${target.uid}`,
          }}
          rows={[
            { label: "Mobile", value: target.mobile },
            { label: "Their balance now", value: formatInr(target.mainBalance) },
            { label: "To", value: "Your main wallet" },
            ...(description ? [{ label: "Note", value: description }] : []),
          ]}
          pin={txnPin}
          onPin={setTxnPin}
          pinHint="Enter your 4-digit PIN to authorise this reverse"
          confirmLabel="Confirm & Reverse"
          loading={loading}
          onBack={() => setStep("form")}
          onConfirm={() => void send()}
        />
      </Modal>
    );
  }

  return (
    <Modal title={`Reverse ${target.name}`} onClose={onClose} icon={<Undo2 size={20} />} iconTone="amber">
      <form onSubmit={review} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₹)</label>
          <input
            required
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ""));
              attemptKey.current.clear();
            }}
            placeholder="1000.00"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Available on partner: {formatInr(target.mainBalance)}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <PrimaryButton type="submit" variant="primary">
          Continue
        </PrimaryButton>
      </form>
    </Modal>
  );
}
