"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { B } from "@/lib/brand";

type Variant = "primary" | "secondary" | "action" | "destructive" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  loading?: boolean;
  /** Soft looping glow — login panel only (CSS scopes it) */
  loopGlow?: boolean;
  /** Default: arrow only on primary */
  showArrow?: boolean;
  variant?: Variant;
  size?: Size;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

const SIZE_CLASS: Record<Size, string> = {
  sm: "btn-pill--sm",
  md: "",
  lg: "btn-pill--lg",
};

/**
 * Shared CTA — soft 12px corners, blue diagonal gradient primary.
 * - primary = blue gradient (best default CTA)
 * - secondary = outline
 * - destructive = red outline
 * - ghost = text
 * Loading: spinner + opacity only. Glow only with loopGlow inside login panel.
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
  const resolved: Variant = variant === "action" ? "primary" : variant;
  const isPrimary = resolved === "primary";
  const arrow = showArrow ?? isPrimary;
  const sizeClass = SIZE_CLASS[size];
  const glowClass = isPrimary && loopGlow && !loading ? "btn-pill--glow" : "";

  const content = loading ? (
    <span
      className={`h-5 w-5 animate-spin rounded-full border-2 ${
        isPrimary ? "border-white/30 border-t-white" : "border-current/30 border-t-current"
      }`}
    />
  ) : isPrimary ? (
    <>
      <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
      {arrow ? (
        <ArrowRight
          size={size === "sm" ? 14 : size === "lg" ? 18 : 16}
          strokeWidth={2.5}
          className="relative z-[1] shrink-0"
        />
      ) : null}
    </>
  ) : (
    children
  );

  if (resolved === "secondary") {
    return (
      <button
        type={type}
        disabled={isDisabled}
        className={`btn-pill btn-pill--secondary ${sizeClass} ${className}`.trim()}
        {...rest}
      >
        {content}
      </button>
    );
  }

  if (resolved === "destructive") {
    return (
      <button
        type={type}
        disabled={isDisabled}
        className={`btn-pill btn-pill--destructive ${sizeClass} ${className}`.trim()}
        {...rest}
      >
        {content}
      </button>
    );
  }

  if (resolved === "ghost") {
    return (
      <button
        type={type}
        disabled={isDisabled}
        className={`btn-pill btn-pill--ghost ${sizeClass} ${className}`.trim()}
        {...rest}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
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
      className={`btn-pill btn-pill--primary ${sizeClass} ${glowClass} ${className}`.trim()}
      style={{
        background: B.btnGrad,
        opacity: isDisabled ? 0.45 : 1,
      }}
      {...rest}
    >
      {content}
    </button>
  );
}
