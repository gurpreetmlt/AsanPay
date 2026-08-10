"use client";

/** Red round count pill for sidebar / header alerts. */
export function AlertCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none text-white"
      style={{ background: "#DC2626" }}
      aria-label={`${count} pending`}
    >
      {label}
    </span>
  );
}
