"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { B } from "@/lib/brand";

export function DetailSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border bg-[var(--admin-card)]"
      style={{ borderColor: B.border }}
    >
      <div
        className="flex items-center gap-2 border-b px-5 py-4"
        style={{ borderColor: B.border, background: B.secondary }}
      >
        <Icon className="h-5 w-5" style={{ color: B.blueLight }} />
        <h2 className="text-base font-semibold md:text-lg" style={{ color: B.blue }}>
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium" style={{ color: B.muted }}>
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color: B.blue }}>
        {value ?? "—"}
      </p>
    </div>
  );
}
