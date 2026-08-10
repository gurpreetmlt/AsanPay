"use client";

import { useEffect, useState } from "react";
import { B } from "@/lib/brand";

const CUSTOM = "__custom__";

type ReasonSelectProps = {
  value: string;
  onChange: (reason: string) => void;
  presets: string[];
  placeholder?: string;
};

/** Preset reasons dropdown + optional custom text (min 8 chars enforced by caller). */
export function ReasonSelect({
  value,
  onChange,
  presets,
  placeholder = "Select a reason",
}: ReasonSelectProps) {
  const isPreset = presets.includes(value);
  const [mode, setMode] = useState<string>(() => {
    if (!value) return "";
    return isPreset ? value : CUSTOM;
  });

  useEffect(() => {
    if (!value) {
      setMode("");
      return;
    }
    if (presets.includes(value)) setMode(value);
    else setMode(CUSTOM);
  }, [value, presets]);

  return (
    <div className="space-y-2">
      <select
        value={mode}
        onChange={(e) => {
          const next = e.target.value;
          setMode(next);
          if (!next) {
            onChange("");
            return;
          }
          if (next === CUSTOM) {
            onChange(presets.includes(value) ? "" : value);
            return;
          }
          onChange(next);
        }}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none admin-input"
        style={{ borderColor: B.border, color: "var(--admin-text)", background: "var(--admin-bg)" }}
      >
        <option value="">{placeholder}</option>
        {presets.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={CUSTOM}>Custom reason…</option>
      </select>
      {mode === CUSTOM ? (
        <input
          type="text"
          value={presets.includes(value) ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter custom reason (min 8 characters)"
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none admin-input"
          style={{ borderColor: B.border, color: "var(--admin-text)", background: "var(--admin-bg)" }}
        />
      ) : null}
    </div>
  );
}

export const RESTRICT_REASON_PRESETS = [
  "Suspicious transaction pattern",
  "Multiple failed biometric attempts",
  "Customer complaint under review",
  "Compliance / audit hold",
  "Suspected fraud — investigation",
  "Incorrect KYC details reported",
  "Upline / network risk review",
];

export const AEPS_REACTIVATE_REASON_PRESETS = [
  "Biometric device repaired",
  "KYC verified — clear dormancy",
  "Temporary block expired",
  "Agent request approved",
  "False positive biometric failures",
  "Compliance cleared for AePS",
];
