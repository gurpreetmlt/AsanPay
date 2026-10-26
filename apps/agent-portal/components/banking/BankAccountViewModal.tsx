"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { B } from "@/lib/brand";
import { formatSettlementBankCopy } from "@/lib/bankLogo";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { BankLogoMark } from "./BankAccountDetailsCard";

export type BankViewDetails = {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  holderName: string;
  accountType?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  city?: string | null;
};

function titleCase(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy ${what.toLowerCase()}`);
  }
}

export function BankAccountViewModal({ bank, onClose }: { bank: BankViewDetails; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Account type", value: bank.accountType ? titleCase(bank.accountType) : null },
    { label: "Account number", value: bank.accountNumber, mono: true },
    { label: "Account name", value: bank.holderName },
    { label: "Bank name", value: bank.bankName },
    { label: "IFSC", value: bank.ifsc, mono: true },
    { label: "Branch code", value: bank.branchCode ?? null, mono: true },
    { label: "Branch name", value: bank.branchName ?? null },
    { label: "City / District", value: bank.city ?? null },
  ].filter((r) => r.value);

  const copyAll = () =>
    void copy(
      formatSettlementBankCopy({
        accountType: bank.accountType,
        accountNumber: bank.accountNumber,
        holderName: bank.holderName,
        bankName: bank.bankName,
        ifsc: bank.ifsc,
        branchCode: bank.branchCode,
        branch: bank.branchName,
        city: bank.city || undefined,
      }),
      "Bank details",
    );

  return createPortal(
    <div
      className="confirm-modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="confirm-modal-panel w-full max-w-3xl rounded-2xl bg-card p-5 shadow-lg sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${bank.bankName} account details`}
      >
        <div className="mb-4 flex items-center gap-3">
          <BankLogoMark ifsc={bank.ifsc} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold" style={{ color: B.blue }}>
              {bank.bankName}
            </p>
            <p className="text-xs" style={{ color: B.muted }}>
              Company bank account details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-tooltip popup-close"
            aria-label="Close"
            data-tooltip="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="grid gap-px overflow-hidden rounded-xl border md:grid-cols-2"
          style={{ borderColor: B.border, background: B.border }}
        >
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 bg-white px-4 py-3">
              <span className="w-28 shrink-0 text-xs font-semibold" style={{ color: B.muted }}>
                {r.label}
              </span>
              <span
                className={`min-w-0 flex-1 break-words text-sm font-semibold ${r.mono ? "font-mono" : ""}`}
                style={{ color: "#0F172A" }}
              >
                {r.value}
              </span>
              <button
                type="button"
                onClick={() => void copy(r.value as string, r.label)}
                className="icon-tooltip shrink-0 rounded-md p-1"
                style={{ color: B.blueLight }}
                aria-label={`Copy ${r.label.toLowerCase()}`}
                data-tooltip="Copy"
              >
                <Copy size={15} />
              </button>
            </div>
          ))}
          {rows.length % 2 === 1 ? <div className="hidden bg-white md:block" aria-hidden /> : null}
        </div>

        <PrimaryButton className="mt-4 w-full" showArrow={false} onClick={copyAll}>
          <Copy size={16} /> Copy full bank details
        </PrimaryButton>
      </div>
    </div>,
    document.body,
  );
}
