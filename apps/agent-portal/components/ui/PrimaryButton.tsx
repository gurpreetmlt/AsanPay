"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { B } from "@/lib/brand";

type Props = {
  children: ReactNode;
  loading?: boolean;
  /** Soft looping glow + shimmer */
  loopGlow?: boolean;
  showArrow?: boolean;
  /** primary = blue login CTA; action = green→blue Scan Finger; secondary = outline */
  variant?: "primary" | "secondary" | "action";
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * Shared CTA — same rounded-2xl shape as original login buttons (not capsule).
 */
export function PrimaryButton({
  children,
  loading = false,
  loopGlow = false,
  showArrow,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);
  const arrow = showArrow ?? variant === "primary";

  if (variant === "secondary") {
    return (
      <button
        type={type}
        disabled={isDisabled}
        className={`btn-pill btn-pill--secondary ${className}`.trim()}
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

  const toneClass = variant === "action" ? "btn-pill--action" : "btn-pill--primary";
  const bg = variant === "action" ? B.actionGrad : B.btnGrad;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`btn-pill ${toneClass} ${loopGlow && !loading ? "btn-pill--glow" : ""} ${className}`.trim()}
      style={{
        background: bg,
        opacity: isDisabled ? 0.45 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <>
          <span className="inline-flex items-center gap-2">{children}</span>
          {arrow ? <ArrowRight size={16} strokeWidth={2.5} className="shrink-0" /> : null}
        </>
      )}
    </button>
  );
}
