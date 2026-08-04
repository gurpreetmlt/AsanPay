import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

export function GradientServiceIcon({ icon: Icon, size = 20, className }: Props) {
  return (
    <span
      className={clsx(
        "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-green-50",
        className,
      )}
    >
      <Icon size={size} className="text-brand-600" strokeWidth={2} />
    </span>
  );
}
