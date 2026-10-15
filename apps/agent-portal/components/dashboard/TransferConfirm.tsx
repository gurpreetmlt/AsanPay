"use client";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import { formatInr } from "@/lib/walletLabels";

interface TransferConfirmProps {
  amount: string | number;
  amountCaption?: string;
  rows: { label: string; value: string }[];
  pin: string;
  onPin: (pin: string) => void;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function TransferConfirm({
  amount,
  amountCaption = "Amount to transfer",
  rows,
  pin,
  onPin,
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
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center">
        <p className="text-xs font-semibold" style={{ color: B.muted }}>
          {amountCaption}
        </p>
        <p className="text-2xl font-black tabular-nums text-emerald-700">{formatInr(amount)}</p>
      </div>
      <dl className="divide-y rounded-xl border px-3" style={{ borderColor: B.border }}>
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3 py-2 text-sm">
            <dt className="font-medium" style={{ color: B.muted }}>
              {r.label}
            </dt>
            <dd className="text-right font-bold text-gray-900">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Transaction PIN</label>
        <input
          autoFocus
          required
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="4-digit PIN"
          className="w-full rounded-lg border border-border-subtle px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton type="button" variant="destructive" onClick={onBack} disabled={loading}>
          Edit
        </PrimaryButton>
        <PrimaryButton type="submit" variant="primary" disabled={loading || pin.length !== 4} loading={loading}>
          Confirm & Send
        </PrimaryButton>
      </div>
    </form>
  );
}
