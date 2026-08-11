"use client";

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Landmark } from "lucide-react";
import { toast } from "react-hot-toast";
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
      data-tooltip={label}
      data-tooltip-align="end"
      className="icon-tooltip inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
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
  footer,
  onActivate,
  activateLabel = "Set as active",
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
  footer?: ReactNode;
  /** Icon button in the action stack — replaces a full-width footer button. */
  onActivate?: () => void;
  activateLabel?: string;
}) {
  const showFull = revealed && Boolean(accountFull);
  const accountShown = showFull ? (accountFull as string) : accountMasked;
  const canReveal = Boolean(onToggleReveal);
  const resolvedBank = bankName || bankNameFromIfsc(ifsc);
  const bankLine = [resolvedBank, branch].filter(Boolean).join(" · ");
  const tint = bankBrandTint(ifsc);
  const corners = bankCardCornerGlows(ifsc);
  const ink = "#0F172A";

  const statusTagStyle: CSSProperties = (() => {
    const tone = unavailable ? "pending" : statusTone;
    if (tone === "success") {
      return { background: "#D1FAE5", color: "#047857", border: "1px solid #6EE7B7" };
    }
    if (tone === "info") {
      return { background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #93C5FD" };
    }
    return { background: "#F1F5F9", color: "#475569", border: "1px solid #CBD5E1" };
  })();

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

  const pendingTwoLine = /^pending\s+verification$/i.test(statusLabel.trim());
  const statusBadge = (
    <span
      className={`inline-flex w-10 shrink-0 items-center justify-center rounded-lg px-0.5 py-1 text-center font-bold uppercase leading-[1.1] tracking-wide ${
        pendingTwoLine || unavailable ? "text-[9px]" : "text-[8px]"
      }`}
      style={statusTagStyle}
    >
      {unavailable ? (
        <>
          Not
          <br />
          available
        </>
      ) : pendingTwoLine ? (
        <>
          Pending
          <br />
          verification
        </>
      ) : (
        statusLabel
      )}
    </span>
  );

  const body = (
    <div className="relative flex gap-2.5">
      <div className="min-w-0 flex-1">
        <BankLogoMark ifsc={ifsc} />

        <p
          className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.12em]"
          style={{ color: B.muted }}
        >
          Account
        </p>
        <p
          className="mt-1 font-mono text-[1.25rem] font-extrabold leading-none tracking-wider tabular-nums"
          style={{ color: ink }}
        >
          {accountShown}
        </p>
        <p className="mt-3 text-[15px] font-bold leading-snug" style={{ color: ink }}>
          {holderName}
        </p>
        <p className="mt-2 text-[13px] font-bold" style={{ color: B.blueLight }}>
          IFSC · {ifsc}
        </p>
        {bankLine ? (
          <p className="mt-1 text-[12px] font-medium leading-snug" style={{ color: B.muted }}>
            {bankLine}
          </p>
        ) : null}
        {note ? (
          typeof note === "string" ? (
            <p className="mt-2 text-[11px] font-extrabold" style={{ color: B.green }}>
              {note}
            </p>
          ) : (
            <div className="mt-2">{note}</div>
          )
        ) : null}
      </div>

      <div className="flex w-10 shrink-0 flex-col items-center gap-2.5 self-stretch">
        {statusBadge}
        {canReveal ? (
          <ActionBtn
            label={showFull ? "Hide number" : "Show number"}
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
          label="Copy details"
          disabled={revealing || unavailable}
          onClick={handleCopy}
        >
          <Copy size={17} strokeWidth={2.25} />
        </ActionBtn>
        {onActivate ? (
          <ActionBtn
            label={activateLabel === "Set as active" ? "Set active" : activateLabel}
            onClick={(e) => {
              e.stopPropagation();
              onActivate();
            }}
          >
            <Check size={17} strokeWidth={2.5} style={{ color: B.green }} />
          </ActionBtn>
        ) : null}
        {selected && onSelect ? (
          <span
            className="icon-tooltip inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: tint,
              boxShadow: "0 2px 10px rgba(11,42,154,0.12)",
            }}
            aria-label="Selected"
            data-tooltip="Selected"
            data-tooltip-align="end"
          >
            <Check size={17} strokeWidth={2.5} color="#fff" />
          </span>
        ) : null}
      </div>
    </div>
  );

  const isActiveBank =
    !unavailable &&
    (statusLabel.toLowerCase() === "active" ||
      (statusTone === "success" && statusLabel.toLowerCase().includes("active")));

  const isPicker = Boolean(onSelect);
  const shellClass = `relative overflow-hidden rounded-[18px] border text-left ${className}`;
  const shellStyle: CSSProperties = {
    borderWidth: isActiveBank ? 2 : 1,
    borderColor: isActiveBank
      ? `${B.green}99`
      : selected
        ? `${tint}55`
        : unavailable
          ? B.border
          : corners.border,
    background: bankCardGradient(ifsc),
    opacity: unavailable ? 0.55 : 1,
    boxShadow: isActiveBank
      ? `0 0 0 3px ${B.green}22, ${bankCardGlow(ifsc, true)}`
      : bankCardGlow(ifsc, selected),
    padding: 18,
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
      {/* Mobile ditto: discrete corner circles from bank logo colors */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-7 -top-9 h-[120px] w-[120px] rounded-full"
        style={{ background: corners.topRight, opacity: 0.55 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -left-8 h-[110px] w-[110px] rounded-full"
        style={{ background: corners.bottomLeft, opacity: 0.4 }}
      />
      <div className="relative z-[1]">{body}</div>
      {footer ? (
        <div className="relative z-[1] mt-3 border-t pt-3" style={{ borderColor: `${tint}22` }}>
          {footer}
        </div>
      ) : null}
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
