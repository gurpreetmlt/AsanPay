"use client";

import type { ReactNode } from "react";

/** Wrapper for icon-only controls — CSS tooltip via globals `.icon-tooltip`. */
export function IconTooltip({
  label,
  children,
  side = "bottom",
  className = "",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span
      className={`icon-tooltip inline-flex ${className}`.trim()}
      data-tooltip={label}
      data-tooltip-side={side}
    >
      {children}
    </span>
  );
}
