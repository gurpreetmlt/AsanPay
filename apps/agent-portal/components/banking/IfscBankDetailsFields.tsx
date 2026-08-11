"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "react-hot-toast";
import { lookupIndianIfsc } from "@/lib/ifsc";
import { B } from "@/lib/brand";

export type IfscBankDetailsValue = {
  ifsc: string;
  bankName: string;
  branch: string;
  city: string;
  accountNumber: string;
  holderName: string;
  accountNumberConfirm?: string;
};

type Props = {
  value: IfscBankDetailsValue;
  onChange: (patch: Partial<IfscBankDetailsValue>) => void;
  /** Settlement / KYC — show account holder. Company treasury forms can hide it. */
  showHolder?: boolean;
  /** KYC signup — confirm account number. */
  showConfirmAccount?: boolean;
  /** When false (e.g. admin edit), account number may be left blank. */
  accountRequired?: boolean;
  accountPlaceholder?: string;
  /** Disable inputs while parent is submitting. */
  disabled?: boolean;
  className?: string;
  /** Toast when IFSC is 11 chars but not found. Default true. */
  notifyLookupFail?: boolean;
  /** Extra fields after the shared grid (purpose, VAN, OTP, etc.). */
  footer?: ReactNode;
};

const labelCls = "mb-1 block text-xs font-semibold uppercase";
const inputBase =
  "w-full rounded-xl border px-3 py-2.5 text-sm outline-none disabled:opacity-60";

/**
 * Shared IFSC → bank/branch autofill + account fields.
 * Use everywhere we register a bank (settlement, KYC, admin company banks).
 */
export function IfscBankDetailsFields({
  value,
  onChange,
  showHolder = true,
  showConfirmAccount = false,
  accountRequired = true,
  accountPlaceholder = "Account number",
  disabled = false,
  className = "",
  notifyLookupFail = true,
  footer,
}: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = value.ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      if (value.bankName || value.branch || value.city) {
        onChange({ bankName: "", branch: "", city: "" });
      }
      return;
    }
    let cancelled = false;
    setBusy(true);
    void lookupIndianIfsc(code).then((place) => {
      if (cancelled) return;
      setBusy(false);
      if (!place?.bank) {
        onChange({ bankName: "", branch: "", city: "" });
        if (notifyLookupFail) toast.error("IFSC not found. Check the code and try again.");
        return;
      }
      onChange({
        bankName: place.bank,
        branch: place.branch || "",
        city: place.city || "",
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-lookup when IFSC changes
  }, [value.ifsc]);

  const branchLine = [value.branch, value.city].filter(Boolean).join(", ");
  const readOnlyStyle: CSSProperties = {
    borderColor: B.border,
    background: "#F8FAFC",
    color: B.blue,
  };
  const editStyle: CSSProperties = { borderColor: B.border, background: "#fff", color: B.blue };

  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`.trim()}>
      <label className="block text-sm">
        <span className={labelCls} style={{ color: B.muted }}>
          IFSC *
        </span>
        <input
          className={`${inputBase} font-mono`}
          style={editStyle}
          placeholder="e.g. SBIN0001234"
          value={value.ifsc}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11),
            })
          }
          required
        />
        <span className="mt-1 block text-xs" style={{ color: B.muted }}>
          {value.ifsc.length}/11 {busy ? "· Looking up…" : ""}
        </span>
      </label>

      <label className="block text-sm">
        <span className={labelCls} style={{ color: B.muted }}>
          Bank name
        </span>
        <input
          className={inputBase}
          style={readOnlyStyle}
          value={value.bankName}
          readOnly
          placeholder={busy ? "Looking up…" : "Auto from IFSC"}
        />
      </label>

      <label className="block text-sm">
        <span className={labelCls} style={{ color: B.muted }}>
          Branch
        </span>
        <input
          className={inputBase}
          style={readOnlyStyle}
          value={branchLine}
          readOnly
          placeholder={busy ? "Looking up…" : "Auto from IFSC"}
          title={branchLine || undefined}
        />
      </label>

      <label className="block text-sm">
        <span className={labelCls} style={{ color: B.muted }}>
          Account number *
        </span>
        <input
          className={inputBase}
          style={editStyle}
          placeholder={accountPlaceholder}
          inputMode="numeric"
          value={value.accountNumber}
          disabled={disabled}
          onChange={(e) => onChange({ accountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })}
          required={accountRequired}
        />
      </label>

      {showConfirmAccount ? (
        <label className="block text-sm">
          <span className={labelCls} style={{ color: B.muted }}>
            Confirm account number *
          </span>
          <input
            className={inputBase}
            style={editStyle}
            placeholder="Re-enter account number"
            inputMode="numeric"
            value={value.accountNumberConfirm ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ accountNumberConfirm: e.target.value.replace(/\D/g, "").slice(0, 18) })
            }
            required
          />
        </label>
      ) : null}

      {showHolder ? (
        <label
          className={`block text-sm ${
            showConfirmAccount ? "" : "sm:col-span-2 lg:col-span-2"
          }`}
        >
          <span className={labelCls} style={{ color: B.muted }}>
            Account holder *
          </span>
          <input
            className={inputBase}
            style={editStyle}
            placeholder="Account holder name"
            value={value.holderName}
            disabled={disabled}
            onChange={(e) => onChange({ holderName: e.target.value })}
            required
          />
        </label>
      ) : null}

      {footer}
    </div>
  );
}

export function emptyIfscBankDetails(): IfscBankDetailsValue {
  return {
    ifsc: "",
    bankName: "",
    branch: "",
    city: "",
    accountNumber: "",
    holderName: "",
    accountNumberConfirm: "",
  };
}

/** True when IFSC resolved and account number present (holder optional). */
export function isIfscBankDetailsComplete(
  value: IfscBankDetailsValue,
  opts?: { requireHolder?: boolean; requireConfirm?: boolean },
): boolean {
  if (value.ifsc.length !== 11 || !value.bankName.trim()) return false;
  if (!/^\d{6,18}$/.test(value.accountNumber.trim())) return false;
  if (opts?.requireHolder !== false) {
    if (!value.holderName.trim() || !/[A-Za-z]/.test(value.holderName)) return false;
  }
  if (opts?.requireConfirm) {
    if (value.accountNumber !== (value.accountNumberConfirm ?? "")) return false;
  }
  return true;
}
