"use client";

import Link from "next/link";
import { Eye, Pencil, Trash2, Ban, CheckCircle, Power, Move } from "lucide-react";
import { cn } from "@/lib/utils";

const btn =
  "flex h-9 w-9 items-center justify-center rounded-xl border transition hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100";

const btnStyle = {
  borderColor: "var(--admin-border)",
  background: "var(--admin-card)",
} as const;

/** AsanPay-style table action icon buttons (blue accent). */
export function TableActionButtons({
  viewHref,
  onEdit,
  onDelete,
  onBan,
  onApprove,
  onToggleActive,
  onMove,
  deleting,
  className,
}: {
  viewHref?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onBan?: () => void;
  onApprove?: () => void;
  onToggleActive?: () => void;
  onMove?: () => void;
  deleting?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {viewHref ? (
        <Link
          href={viewHref}
          title="View"
          className={cn(btn, "text-blue-500 hover:border-blue-500/40 hover:bg-blue-500/10")}
          style={btnStyle}
        >
          <Eye className="h-4 w-4" />
        </Link>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          title="Edit"
          className={cn(btn, "text-[#2A5CDD] hover:border-[#2A5CDD]/40 hover:bg-[#2A5CDD]/10")}
          style={btnStyle}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
      {onApprove ? (
        <button
          type="button"
          onClick={onApprove}
          title="Approve"
          className={cn(btn, "text-emerald-500 hover:border-emerald-500/40 hover:bg-emerald-500/10")}
          style={btnStyle}
        >
          <CheckCircle className="h-4 w-4" />
        </button>
      ) : null}
      {onToggleActive ? (
        <button
          type="button"
          onClick={onToggleActive}
          title="Activate"
          className={cn(btn, "text-[#0B2A9A] hover:border-[#0B2A9A]/40 hover:bg-[#0B2A9A]/10")}
          style={btnStyle}
        >
          <Power className="h-4 w-4" />
        </button>
      ) : null}
      {onMove ? (
        <button
          type="button"
          onClick={onMove}
          title="Move to different parent"
          className={cn(btn, "text-violet-500 hover:border-violet-500/40 hover:bg-violet-500/10")}
          style={btnStyle}
        >
          <Move className="h-4 w-4" />
        </button>
      ) : null}
      {onBan ? (
        <button
          type="button"
          onClick={onBan}
          title="Suspend"
          className={cn(btn, "text-amber-500 hover:border-amber-500/40 hover:bg-amber-500/10")}
          style={btnStyle}
        >
          <Ban className="h-4 w-4" />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title="Delete"
          className={cn(btn, "text-red-500 hover:border-red-500/40 hover:bg-red-500/10")}
          style={btnStyle}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
