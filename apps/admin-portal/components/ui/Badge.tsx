import { cn } from "@/lib/utils";

const colors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  verified: "bg-green-500/20 text-green-700 dark:text-green-400",
  approved: "bg-green-500/20 text-green-700 dark:text-green-400",
  rejected: "bg-red-500/20 text-red-700 dark:text-red-400",
  suspended: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  active: "bg-green-500/20 text-green-700 dark:text-green-400",
  inactive: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
  success: "bg-green-500/20 text-green-700 dark:text-green-400",
  failed: "bg-red-500/20 text-red-700 dark:text-red-400",
  master_distributor: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  distributor: "bg-[#2A5CDD]/15 text-[#123A9E] dark:text-blue-300",
  retailer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  admin: "bg-[#0B2A9A]/15 text-[#0B2A9A] dark:text-blue-200",
};

export function Badge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        colors[status] || "bg-[var(--admin-border)] text-[var(--admin-muted)]",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
