"use client";

import { ArrowDown, Lock } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B, initials } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";

interface TransferConfirmProps {
  amount: string | number;
  amountCaption?: string;
  /** Single recipient header (avatar + name + subtitle). Omit for bulk. */
  recipient?: { name: string; subtitle: string };
  rows: { label: string; value: string }[];
  pin: string;
  onPin: (pin: string) => void;
  pinHint?: string;
  confirmLabel?: string;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function TransferConfirm({
  amount,
  amountCaption = "You are sending",
  recipient,
  rows,
  pin,
  onPin,
  pinHint = "Enter your 4-digit PIN to authorise this transfer",
  confirmLabel = "Confirm & Send",
  loading,
  onBack,
  onConfirm,
}: TransferConfirmProps) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm();
      }}
    >
      <div
        className="rounded-2xl px-4 py-4 text-center"
        style={{ background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)", border: "1px solid #A7F3D0" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80">{amountCaption}</p>
        <p className="mt-0.5 text-3xl font-black tabular-nums text-emerald-700">{formatInr(amount)}</p>
      </div>

      {recipient ? (
        <>
          <div className="-my-2 flex justify-center">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full border bg-white shadow-sm"
              style={{ borderColor: B.border, color: B.muted }}
            >
              <ArrowDown size={14} />
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border px-3 py-3" style={{ borderColor: B.border }}>
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: B.blue }}
            >
              {initials(recipient.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold" style={{ color: B.blue }}>
                {recipient.name}
              </p>
              <p className="truncate text-xs" style={{ color: B.muted }}>
                {recipient.subtitle}
              </p>
            </div>
          </div>
        </>
      ) : null}

      <dl className="overflow-hidden rounded-2xl border" style={{ borderColor: B.border }}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex justify-between gap-3 px-3 py-2.5 text-sm"
            style={{
              borderTop: i === 0 ? undefined : `1px solid ${B.border}`,
              background: i % 2 === 1 ? "#F8FAFC" : "#fff",
            }}
          >
            <dt style={{ color: B.muted }}>{r.label}</dt>
            <dd className="text-right font-semibold" style={{ color: B.blue }}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <label
          className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
          style={{ color: B.muted }}
        >
          <Lock size={12} /> Transaction PIN
        </label>
        <input
          autoFocus
          required
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="w-full rounded-xl border-2 bg-white px-3 py-2.5 text-center text-xl tracking-[0.6em] outline-none transition focus:border-brand-500"
          style={{ borderColor: pin.length === 4 ? B.green : B.border, color: B.blue }}
        />
        <p className="mt-1.5 text-center text-[11px]" style={{ color: B.muted }}>
          {pinHint}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton type="button" variant="destructive" showArrow={false} onClick={onBack} disabled={loading}>
          Edit
        </PrimaryButton>
        <PrimaryButton type="submit" variant="primary" disabled={loading || pin.length !== 4} loading={loading}>
          {confirmLabel}
        </PrimaryButton>
      </div>
    </form>
  );
}
