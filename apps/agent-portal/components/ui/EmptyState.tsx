import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { B } from "@/lib/brand";

/** Quiet empty state — short line + one clear CTA when provided. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-4 py-8 text-center ${className}`.trim()}>
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: `${B.blue}0c`, color: B.muted }}
      >
        {icon ?? <Inbox size={22} strokeWidth={1.75} />}
      </div>
      <p className="text-sm font-semibold" style={{ color: B.blue }}>
        {title}
      </p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: B.muted }}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
