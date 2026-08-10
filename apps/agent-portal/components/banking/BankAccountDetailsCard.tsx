"use client";

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Landmark } from "lucide-react";
import { toast } from "react-hot-toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { B } from "@/lib/brand";
import {
  bankBrandTint,
  bankCardCornerGlows,
  bankCardGlow,
  bankCardGradient,
  bankLogoUrl,
  bankNameFromIfsc,
  formatSettlementBankCopy,
} from "@/lib/bankLogo";

export function BankLogoMark({ ifsc, size = 44 }: { ifsc?: string; size?: number }) {
  const [failed, setFailed] = useState(!ifsc);
  if (!ifsc || failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"
        style={{
          width: size,
          height: size,
          color: B.blueLight,
          boxShadow: "0 2px 8px rgba(11,42,154,0.08)",
        }}
      >
        <Landmark size={Math.round(size * 0.42)} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={bankLogoUrl(ifsc)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-xl object-contain bg-white p-1.5"
      style={{
        width: size,
        height: size,
        boxShadow: "0 2px 10px rgba(11,42,154,0.1)",
      }}
      onError={() => setFailed(true)}
    />
  );
}

function ActionBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
      style={{
        color: B.blueLight,
        boxShadow: "0 2px 10px rgba(11,42,154,0.12)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Premium bank card — logo, status, account + stacked eye/copy, holder, IFSC, bank line.
 */
export function BankDetailCard({
  ifsc,
  holderName,
  accountMasked,
  accountFull,
  revealed = false,
  revealing = false,
  onToggleReveal,
  onCopy,
  statusTone = "success",
  statusLabel = "Active",
  selected = false,
  onSelect,
  note,
  bankName,
  branch,
  unavailable = false,
  className = "",
}: {
  ifsc: string;
  holderName: string;
  accountMasked: string;
  accountFull?: string;
  revealed?: boolean;
  revealing?: boolean;
  onToggleReveal?: () => void;
  onCopy?: () => void;
  statusTone?: "success" | "info" | "pending";
  statusLabel?: string;
  selected?: boolean;
  onSelect?: () => void;
  note?: ReactNode;
  /** Display name under IFSC; defaults from IFSC code map */
  bankName?: string;
  branch?: string;
  unavailable?: boolean;
  className?: string;
}) {
  const showFull = revealed && Boolean(accountFull);
  const accountShown = showFull ? (accountFull as string) : accountMasked;
  const canReveal = Boolean(onToggleReveal);
  const resolvedBank = bankName || bankNameFromIfsc(ifsc);
  const bankLine = [resolvedBank, branch].filter(Boolean).join(" · ");

  async function handleCopy(e: MouseEvent) {
    e.stopPropagation();
    if (onCopy) {
      onCopy();
      return;
    }
    try {
      await navigator.clipboard.writeText(
        formatSettlementBankCopy({
          bankName: resolvedBank,
          branch,
          holderName,
          accountNumber: accountFull || accountMasked.replace(/\s/g, ""),
          ifsc,
        }),
      );
      toast.success("Bank details copied");
    } catch {
      toast.error("Could not copy bank details");
    }
  }

  const body = (
    <div className="relative flex gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <BankLogoMark ifsc={ifsc} />
          <StatusBadge tone={unavailable ? "pending" : statusTone}>
            {unavailable ? "Unavailable" : statusLabel}
          </StatusBadge>
        </div>

        <p
          className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: B.muted }}
        >
          Account
        </p>
        <p
          className="mt-1 font-mono text-[1.35rem] font-extrabold leading-none tracking-wider"
          style={{ color: B.blue }}
        >
          {accountShown}
        </p>
        <p className="mt-3 text-[15px] font-bold leading-snug" style={{ color: B.blue }}>
          {holderName}
        </p>
        <p className="mt-2 font-mono text-[13px] font-semibold" style={{ color: B.blueMid }}>
          IFSC · {ifsc}
        </p>
        {bankLine ? (
          <p className="mt-1.5 text-[12px] font-medium leading-snug" style={{ color: B.muted }}>
            {bankLine}
          </p>
        ) : null}
        {note ? (
          <p className="mt-2 text-xs font-bold" style={{ color: B.green }}>
            {note}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 self-center">
        {canReveal ? (
          <ActionBtn
            label={showFull ? "Hide account number" : "Show account number"}
            disabled={revealing || unavailable}
            onClick={(e) => {
              e.stopPropagation();
              onToggleReveal?.();
            }}
          >
            {showFull ? <EyeOff size={17} strokeWidth={2.25} /> : <Eye size={17} strokeWidth={2.25} />}
          </ActionBtn>
        ) : null}
        <ActionBtn
          label="Copy bank details"
          disabled={revealing || unavailable}
          onClick={handleCopy}
        >
          <Copy size={17} strokeWidth={2.25} />
        </ActionBtn>
        {selected && onSelect ? (
          <span
            className="mx-auto flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: B.blue }}
          >
            <Check size={12} color="#fff" />
          </span>
        ) : null}
      </div>
    </div>
  );

  const tint = bankBrandTint(ifsc);
  const corners = bankCardCornerGlows(ifsc);
  const isPicker = Boolean(onSelect);
  const shellClass = `relative overflow-hidden rounded-2xl border p-5 text-left ${className}`;
  const shellStyle: CSSProperties = {
    borderWidth: 1,
    borderColor: selected ? `${tint}66` : unavailable ? B.border : corners.border,
    background: bankCardGradient(ifsc),
    opacity: unavailable ? 0.55 : 1,
    boxShadow: bankCardGlow(ifsc, selected),
    ...(isPicker
      ? {
          transform: selected ? "scale(1.02)" : "scale(1)",
          zIndex: selected ? 2 : 1,
          transformOrigin: "center center",
        }
      : {}),
  };

  const chrome = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: corners.topRight }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: corners.bottomLeft }}
      />
      <div className="relative z-[1]">{body}</div>
    </>
  );

  if (onSelect) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`${shellClass} w-full cursor-pointer transition-[transform,box-shadow] duration-200 hover:brightness-[1.02]`}
        style={shellStyle}
      >
        {chrome}
      </div>
    );
  }

  return (
    <div className={shellClass} style={shellStyle}>
      {chrome}
    </div>
  );
}

/** @deprecated Prefer BankDetailCard */
export function BankAccountDetailsCard({
  title,
  subtitle,
  ifsc,
  accountLabel,
  accountValue,
  holderLabel = "Account holder",
  holderValue,
  status,
}: {
  title: string;
  subtitle?: string;
  ifsc: string;
  accountLabel: string;
  accountValue: string;
  holderLabel?: string;
  holderValue: string;
  status?: { tone: "success" | "info" | "pending"; label: string };
  accountRevealable?: boolean;
  accountRevealed?: boolean;
  accountRevealing?: boolean;
  onToggleAccountReveal?: () => void;
}) {
  void accountLabel;
  void holderLabel;
  void subtitle;
  return (
    <BankDetailCard
      ifsc={ifsc}
      holderName={holderValue}
      accountMasked={accountValue}
      bankName={title}
      statusTone={status?.tone ?? "info"}
      statusLabel={status?.label ?? "Active"}
    />
  );
}

export function BankPickerLogo({ ifsc, active }: { ifsc: string; active?: boolean }) {
  void active;
  return <BankLogoMark ifsc={ifsc} size={40} />;
}
