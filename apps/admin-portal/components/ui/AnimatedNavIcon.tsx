"use client";

import { cn } from "@/lib/utils";
import type { NavIconDef } from "@/lib/iconTypes";
import { AppIcon } from "./AppIcon";

/** AsanPay-style nav icon (CSS hover — no framer-motion required). */
export function AnimatedNavIcon({
  def,
  active,
  size = 18,
  className,
}: {
  def: NavIconDef;
  active?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center transition-transform duration-200 hover:scale-110 active:scale-95",
        active && "scale-105",
        className,
      )}
    >
      <AppIcon def={def} size={size} className={className} />
    </span>
  );
}
