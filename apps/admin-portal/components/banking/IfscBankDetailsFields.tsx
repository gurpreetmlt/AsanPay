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
  showHolder?: boolean;
  showConfirmAccount?: boolean;
  accountRequired?: boolean;
  accountPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  notifyLookupFail?: boolean;
  /** Bank name + branch become editable; IFSC lookup only fills empty fields so saved values survive. */
  editableBankBranch?: boolean;
  footer?: ReactNode;
};

const labelCls = "mb-1 block text-xs font-semibold uppercase";
const inputBase =
  "w-full rounded-xl border px-3 py-2.5 text-sm outline-none disabled:opacity-60";

/**
 * Shared IFSC → bank/branch autofill + account fields (admin portal copy).
 * Keep in sync with agent-portal `components/banking/IfscBankDetailsFields.tsx`.
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
  editableBankBranch = false,
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
      onChange(
        editableBankBranch
          ? {
              bankName: value.bankName.trim() || place.bank,
              branch: value.branch.trim() || place.branch || "",
              city: value.city.trim() || place.city || "",
            }
          : {
              bankName: place.bank,
              branch: place.branch || "",
              city: place.city || "",
            },
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.ifsc]);

  const branchLine = [value.branch, value.city].filter(Boolean).join(", ");
  const readOnlyStyle: CSSProperties = {
    borderColor: B.border,
    background: "var(--admin-secondary)",
    color: "var(--admin-text)",
  };
  const editStyle: CSSProperties = {
    borderColor: B.border,
    background: "var(--admin-card)",
    color: "var(--admin-text)",
  };

  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`.trim()}>
      <label className="block text-sm">
        <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
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
              ...(editableBankBranch ? { bankName: "", branch: "", city: "" } : {}),
            })
          }
          required
        />
        <span className="mt-1 block text-xs" style={{ color: "var(--admin-muted)" }}>
          {value.ifsc.length}/11 {busy ? "· Looking up…" : ""}
        </span>
      </label>

      <label className="block text-sm">
        <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
          Bank name
        </span>
        {editableBankBranch ? (
          <input
            className={inputBase}
            style={editStyle}
            value={value.bankName}
            disabled={disabled}
            onChange={(e) => onChange({ bankName: e.target.value.slice(0, 120) })}
            placeholder={busy ? "Looking up…" : "Auto from IFSC — edit if needed"}
          />
        ) : (
          <input
            className={inputBase}
            style={readOnlyStyle}
            value={value.bankName}
            readOnly
            placeholder={busy ? "Looking up…" : "Auto from IFSC"}
          />
        )}
      </label>

      <label className="block text-sm">
        <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
          Branch
        </span>
        {editableBankBranch ? (
          <>
            <input
              className={inputBase}
              style={editStyle}
              value={value.branch}
              disabled={disabled}
              onChange={(e) => onChange({ branch: e.target.value.slice(0, 120) })}
              placeholder={busy ? "Looking up…" : "Auto from IFSC — edit as on passbook"}
            />
            {value.city ? (
              <span className="mt-1 block text-xs" style={{ color: "var(--admin-muted)" }}>
                City: {value.city}
              </span>
            ) : null}
          </>
        ) : (
          <input
            className={inputBase}
            style={readOnlyStyle}
            value={branchLine}
            readOnly
            placeholder={busy ? "Looking up…" : "Auto from IFSC"}
            title={branchLine || undefined}
          />
        )}
      </label>

      <label className={`block text-sm ${showHolder || showConfirmAccount ? "" : "lg:col-span-2"}`}>
        <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
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
          <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
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
          className={`block text-sm ${showConfirmAccount ? "" : "lg:col-span-2"}`}
        >
          <span className={labelCls} style={{ color: "var(--admin-muted)" }}>
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
