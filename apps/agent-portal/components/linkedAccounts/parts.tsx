"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import type { UserRole } from "@asanpay/shared-types";
import { B, initials } from "@/lib/brand";
import { roleTheme } from "@/lib/linkedAccounts";

export function AccountAvatar({ name, role, size = 44 }: { name: string; role: UserRole; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.3),
        background: roleTheme(role).avatar,
        boxShadow: "0 6px 16px rgba(11,42,154,0.18)",
      }}
    >
      {initials(name)}
    </div>
  );
}

export function RoleChip({ role, roleLabel, uid }: { role: UserRole; roleLabel: string; uid: string }) {
  const t = roleTheme(role);
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: t.chipBg, color: t.chipText }}
    >
      {roleLabel} · {uid}
    </span>
  );
}

/** Digit boxes for MPIN (masked) / OTP. Value is always a contiguous digit string. */
export function DigitBoxes({
  length,
  value,
  onChange,
  masked = false,
  autoFocus = false,
  disabled = false,
  invalid = false,
  label,
}: {
  length: number;
  value: string;
  onChange: (next: string) => void;
  masked?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(index, length - 1))]?.focus();
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      e.preventDefault();
      onChange(value.slice(0, index - 1));
      focusAt(index - 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    focusAt(digits.length);
  }

  return (
    <div className="flex gap-3" role="group" aria-label={label}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={2}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`${label} digit ${i + 1}`}
          value={value[i] ?? ""}
          onPaste={onPaste}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={() => {
            if (i > value.length) focusAt(value.length);
          }}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, "").slice(-1);
            if (!digit) {
              onChange(value.slice(0, i));
              return;
            }
            const next = (value.slice(0, i) + digit + value.slice(i + 1)).slice(0, length);
            onChange(next);
            focusAt(i + 1);
          }}
          className="h-12 w-11 rounded-xl border bg-white text-center text-lg font-bold outline-none transition focus:border-[#2A5CDD] focus:shadow-[0_0_0_3px_rgba(42,92,221,0.18)] sm:h-14 sm:w-12"
          style={{ borderColor: invalid ? "#DC2626" : "rgba(11,42,154,0.18)", color: B.blue }}
        />
      ))}
    </div>
  );
}

/** Resend OTP countdown (seconds left; 0 = can resend). */
export function useCountdown(seconds: number): { left: number; start: () => void } {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start };
}

export function formatCountdown(left: number): string {
  return `00:${String(left).padStart(2, "0")}`;
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-xs font-medium" style={{ color: "#DC2626" }} role="alert">
      {message}
    </p>
  );
}
