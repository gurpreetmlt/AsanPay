"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { B } from "@/lib/brand";

type Props = {
  children: ReactNode;
  loading?: boolean;
  /** Soft looping glow + shimmer — same as login Unlock with MPIN */
  loopGlow?: boolean;
  showArrow?: boolean;
  /** primary = blue login CTA (Unlock with MPIN); secondary = outline */
  variant?: "primary" | "secondary" | "action";
  size?: "md" | "sm";
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * Shared CTA — login "Unlock with MPIN" look: blue gradient, soft glow, rounded-xl (not capsule).
 * `action` is kept as an alias of `primary` for older call sites.
 */
export function PrimaryButton({
  children,
  loading = false,
  loopGlow = false,
  showArrow,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);
  const isOutline = variant === "secondary";
  const arrow = showArrow ?? !isOutline;
  const sizeClass = size === "sm" ? "btn-pill--sm" : "";

  if (isOutline) {
    return (
      <button
        type={type}
        disabled={isDisabled}
        className={`btn-pill btn-pill--secondary ${sizeClass} ${className}`.trim()}
        {...rest}
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        ) : (
          children
        )}
      </button>
    );
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`btn-pill btn-pill--primary ${sizeClass} ${loopGlow && !loading ? "btn-pill--glow" : ""} ${className}`.trim()}
      style={{
        background: B.btnGrad,
        opacity: isDisabled ? 0.45 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <>
          <span className="inline-flex items-center gap-2">{children}</span>
          {arrow ? (
            <ArrowRight size={size === "sm" ? 14 : 16} strokeWidth={2.5} className="shrink-0" />
          ) : null}
        </>
      )}
    </button>
  );
}
