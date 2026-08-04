import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ScreenHeader({ eyebrow, title, subtitle, children }: Props) {
  return (
    <header className="rounded-b-[20px] bg-gradient-to-br from-brand-500 to-brand-700 px-4 pb-3 pt-2 text-white shadow-sm">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-white/15" />
        <div className="pointer-events-none absolute left-0 top-2 h-8 w-1 rounded-r bg-green-500/90" />
        {eyebrow ? <p className="text-[11px] font-semibold text-white/80">{eyebrow}</p> : null}
        <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[11px] text-white/75">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  );
}
