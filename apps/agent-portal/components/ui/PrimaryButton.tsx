"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { B } from "@/lib/brand";

type Props = {
  children: ReactNode;
  loading?: boolean;
  /** Soft looping glow — main login / primary CTA */
  loopGlow?: boolean;
  showArrow?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/**
 * Shared pill CTA — matches login Send OTP (full rounded, blue gradient, soft shadow).
 */
export function PrimaryButton({
  children,
  loading = false,
  loopGlow = false,
  showArrow = true,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || loading);

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

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`btn-pill btn-pill--primary ${loopGlow && !loading ? "btn-pill--glow" : ""} ${className}`.trim()}
      style={{
        background: B.btnGrad,
        opacity: isDisabled ? 0.8 : 1,
      }}
      {...rest}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <>
          <span>{children}</span>
          {showArrow ? <ArrowRight size={16} strokeWidth={2.5} className="shrink-0" /> : null}
        </>
      )}
    </button>
  );
}
