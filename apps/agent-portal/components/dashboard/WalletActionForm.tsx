"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import { ArrowRight, Send, Undo2 } from "lucide-react";
import api, { fetchApi } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { extractApiError } from "@/lib/onboarding";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { ROLE_LABEL } from "@/lib/roles";
import { B } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";
import { useAuthStore } from "@/lib/store";
import type { DownlineUser, WalletBalance } from "@/lib/types";
import { TransferConfirm } from "./TransferConfirm";

export type WalletActionKind = "transfer" | "reverse";

interface Props {
  target: DownlineUser;
  initialKind?: WalletActionKind;
  /** When false, Reverse tab is hidden (e.g. zero balance / not direct). */
  allowReverse?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function PartyCard({
  label,
  name,
  role,
  uid,
  balance,
}: {
  label: string;
  name: string;
  role: string;
  uid: string;
  balance: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5" style={{ borderColor: B.border }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: B.muted }}>
        {label} · {role}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold" style={{ color: B.blue }}>
        {name}
      </p>
      <p className="truncate font-mono text-[11px]" style={{ color: B.muted }}>
        {uid}
      </p>
      <p className="mt-1 text-xs font-semibold tabular-nums" style={{ color: B.green }}>
        Bal {formatInr(balance)}
      </p>
    </div>
  );
}

/** Unified Transfer / Reverse for Super Distributor & Distributor (row buttons + switch in popup). */
export function WalletActionForm({
  target,
  initialKind = "transfer",
  allowReverse = true,
  onClose,
  onSuccess,
}: Props) {
  const me = useAuthStore((s) => s.user);
  const [kind, setKind] = useState<WalletActionKind>(
    initialKind === "reverse" && allowReverse ? "reverse" : "transfer",
  );
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [myBalance, setMyBalance] = useState<string | null>(null);
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptKey = useRef(createAttemptKeyHolder(`wallet-${target.id}`));

  useEffect(() => {
    let alive = true;
    fetchApi<WalletBalance[]>("/wallet/me")
      .then((rows) => {
        if (!alive) return;
        setMyBalance(rows.find((w) => w.walletType === "main")?.balance ?? "0");
      })
      .catch(() => {
        if (alive) setMyBalance("0");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    attemptKey.current.clear();
  }, [kind]);

  useEffect(() => {
    setKind(initialKind === "reverse" && allowReverse ? "reverse" : "transfer");
    setStep("form");
    setAmount("");
    setDescription("");
    setTxnPin("");
    attemptKey.current.clear();
  }, [target.id, initialKind, allowReverse]);

  const myName = me?.name ?? "You";
  const myUid = me?.uid ?? "—";
  const myRole = me ? (ROLE_LABEL[me.role] ?? me.role) : "You";
  const theirRole = ROLE_LABEL[target.role] ?? target.role;
  const myBal = myBalance ?? "…";
  const from =
    kind === "transfer"
      ? { label: "From", name: myName, role: myRole, uid: myUid, balance: myBal }
      : {
          label: "From",
          name: target.name,
          role: theirRole,
          uid: target.uid,
          balance: target.mainBalance,
        };
  const to =
    kind === "transfer"
      ? {
          label: "To",
          name: target.name,
          role: theirRole,
          uid: target.uid,
          balance: target.mainBalance,
        }
      : { label: "To", name: myName, role: myRole, uid: myUid, balance: myBal };

  function review(e: FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!(n > 0)) {
      toast.error("Enter an amount greater than ₹0");
      return;
    }
    if (kind === "reverse" && n > Number(target.mainBalance)) {
      toast.error("Amount is higher than their main wallet balance");
      return;
    }
    if (kind === "transfer" && myBalance != null && n > Number(myBalance)) {
      toast.error(`Your main wallet has only ${formatInr(myBalance)}`);
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
      if (kind === "transfer") {
        await api.post("/wallet/transfer", {
          targetUserId: target.id,
          walletType: "main",
          amount,
          txnPin,
          idempotencyKey: attemptKey.current.get(),
          ...(description.trim() ? { description: description.trim() } : {}),
        });
        toast.success(`₹${amount} sent to ${target.name}`);
      } else {
        await api.post("/wallet/pull/confirm", {
          targetUserId: target.id,
          walletType: "main",
          amount,
          txnPin,
          idempotencyKey: attemptKey.current.get(),
          ...(description.trim() ? { description: description.trim() } : {}),
        });
        toast.success(`₹${amount} reversed from ${target.name}`);
      }
      attemptKey.current.clear();
      onSuccess();
      onClose();
    } catch (err) {
      setTxnPin("");
      toast.error(extractApiError(err, kind === "transfer" ? "Transfer failed" : "Reverse failed"));
    } finally {
      setLoading(false);
    }
  }

  if (step === "confirm") {
    return (
      <Modal
        title={kind === "transfer" ? "Confirm transfer" : "Confirm reverse"}
        onClose={onClose}
        icon={kind === "transfer" ? <Send size={20} /> : <Undo2 size={20} />}
        iconTone={kind === "transfer" ? "blue" : "amber"}
        subtitle="Check the details before you confirm."
      >
        <TransferConfirm
          amount={amount}
          amountCaption={kind === "transfer" ? "You are sending" : "You are reversing"}
          recipient={{
            name: target.name,
            subtitle: `${theirRole} · ${target.uid}`,
          }}
          rows={[
            { label: "From", value: `${from.name} (${from.role})` },
            { label: "To", value: `${to.name} (${to.role})` },
            { label: "Mobile", value: target.mobile },
            ...(description.trim() ? [{ label: "Note", value: description.trim() }] : []),
          ]}
          pin={txnPin}
          onPin={setTxnPin}
          pinHint={
            kind === "transfer"
              ? "Enter your 4-digit PIN to authorise this transfer"
              : "Enter your 4-digit PIN to authorise this reverse"
          }
          confirmLabel={kind === "transfer" ? "Confirm & Send" : "Confirm & Reverse"}
          loading={loading}
          onBack={() => setStep("form")}
          onConfirm={() => void send()}
        />
      </Modal>
    );
  }

  return (
    <Modal
      title={`${kind === "transfer" ? "Transfer" : "Reverse"} — ${target.name}`}
      onClose={onClose}
      icon={kind === "transfer" ? <Send size={20} /> : <Undo2 size={20} />}
      iconTone={kind === "transfer" ? "blue" : "amber"}
    >
      <form onSubmit={review} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "transfer" as const, label: "Transfer", Icon: Send, color: "#2563EB" },
              { key: "reverse" as const, label: "Reverse", Icon: Undo2, color: "#059669" },
            ] as const
          ).map(({ key, label, Icon, color }) => {
            const active = kind === key;
            const disabled = key === "reverse" && !allowReverse;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setKind(key);
                  setStep("form");
                  setTxnPin("");
                  attemptKey.current.clear();
                }}
                className="flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: active ? color : B.border,
                  background: active ? `${color}14` : "#fff",
                  color: active ? color : B.muted,
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-stretch gap-2 rounded-2xl border p-2" style={{ borderColor: B.border, background: "#F8FAFC" }}>
          <PartyCard {...from} />
          <div className="flex shrink-0 items-center">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-white"
              style={{ background: kind === "transfer" ? "#059669" : "#D97706" }}
            >
              <ArrowRight size={14} />
            </span>
          </div>
          <PartyCard {...to} />
        </div>

        {kind === "reverse" ? (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "#FDBA74", background: "#FFF7ED", color: "#9A3412" }}>
            Reverse pulls money from {target.name}&apos;s wallet back to yours.
          </p>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Amount (₹)
            <RequiredMark />
          </label>
          <input
            required
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ""));
              attemptKey.current.clear();
            }}
            placeholder="e.g. 500"
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          {kind === "reverse" ? (
            <p className="mt-1 text-xs text-gray-500">Available on partner: {formatInr(target.mainBalance)}</p>
          ) : myBalance != null ? (
            <p className="mt-1 text-xs text-gray-500">Your balance: {formatInr(myBalance)}</p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Note (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekly float"
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
