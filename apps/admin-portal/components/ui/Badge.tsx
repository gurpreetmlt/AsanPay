import { cn } from "@/lib/utils";

/** Higher-contrast pills so Role / KYC / Status stay readable on white tables. */
const colors: Record<string, string> = {
  pending: "border border-amber-300 bg-amber-100 text-amber-950",
  verified: "border border-emerald-300 bg-emerald-100 text-emerald-950",
  approved: "border border-emerald-300 bg-emerald-100 text-emerald-950",
  rejected: "border border-red-300 bg-red-100 text-red-950",
  suspended: "border border-orange-300 bg-orange-100 text-orange-950",
  active: "border border-emerald-300 bg-emerald-100 text-emerald-950",
  inactive: "border border-slate-300 bg-slate-200 text-slate-900",
  success: "border border-emerald-300 bg-emerald-100 text-emerald-950",
  failed: "border border-red-300 bg-red-100 text-red-950",
  super_distributor: "border border-violet-400 bg-violet-200 text-violet-950",
  distributor: "border border-sky-400 bg-sky-100 text-sky-950",
  retailer: "border border-emerald-400 bg-emerald-100 text-emerald-950",
  admin: "border border-slate-400 bg-slate-200 text-slate-950",
};

export function Badge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        colors[status] || "border border-[var(--admin-border)] bg-[var(--admin-secondary)] text-[var(--admin-text)]",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
