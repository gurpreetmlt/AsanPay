"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { B } from "@/lib/brand";

export type ActionIconTone = "blue" | "amber" | "green" | "red" | "violet" | "navy";

const TONE_COLOR: Record<ActionIconTone, string> = {
  blue: "#2A5CDD",
  amber: "#D97706",
  green: "#059669",
  red: "#DC2626",
  violet: "#8B5CF6",
  navy: "#0B2A9A",
};

/**
 * Table/row action chip — card fill, thin border, colored outline icon.
 * Matches admin banking / TableActionButtons look.
 */
export function ActionIconButton({
  tone = "blue",
  title,
  className = "",
  children,
  style,
  ...rest
}: {
  tone?: ActionIconTone;
  title: string;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={title}
      data-tooltip={title}
      className={`icon-tooltip inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:scale-110 hover:brightness-[0.98] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${className}`}
      style={{
        borderColor: B.border,
        background: "#ffffff",
        color: TONE_COLOR[tone],
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
