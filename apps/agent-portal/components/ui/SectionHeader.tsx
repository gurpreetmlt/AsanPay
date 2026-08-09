import type { ReactNode } from "react";
import { B } from "@/lib/brand";

/** Bold navy title + muted subtitle — section headers (not competing with CTAs). */
export function SectionHeader({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex flex-wrap items-start justify-between gap-2 ${className}`.trim()}>
      <div className="min-w-0">
        <h2 className="text-base font-bold leading-snug" style={{ color: B.blue }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs font-medium" style={{ color: B.muted }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
