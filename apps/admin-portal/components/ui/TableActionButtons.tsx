"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Eye, Pencil, Trash2, Ban, CheckCircle, Power, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevOptionsStore } from "@/lib/devOptionsStore";

export type ActionIconTone = "blue" | "amber" | "green" | "red" | "violet" | "navy";

const TONE: Record<ActionIconTone, string> = {
  blue: "text-[#2A5CDD] hover:border-[#2A5CDD]/45 hover:bg-[#2A5CDD]/10",
  amber: "text-[#D97706] hover:border-amber-500/45 hover:bg-amber-500/10",
  green: "text-[#059669] hover:border-emerald-500/45 hover:bg-emerald-500/10",
  red: "text-[#DC2626] hover:border-red-500/45 hover:bg-red-500/10",
  violet: "text-violet-500 hover:border-violet-500/45 hover:bg-violet-500/10",
  navy: "text-[#0B2A9A] hover:border-[#0B2A9A]/40 hover:bg-[#0B2A9A]/10",
};

const shell =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100";

const shellStyle = {
  borderColor: "var(--admin-border)",
  background: "var(--admin-card)",
} as const;

/** Single table/row action chip — white card, thin border, colored outline icon. */
export function ActionIconButton({
  tone = "blue",
  title,
  className,
  children,
  ...rest
}: {
  tone?: ActionIconTone;
  title: string;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(shell, TONE[tone], className)}
      style={shellStyle}
      {...rest}
    >
      {children}
    </button>
  );
}

/** AsanPay table action icon row (Edit / Details / Power / Delete / …). */
export function TableActionButtons({
  viewHref,
  onEdit,
  onDelete,
  onBan,
  onApprove,
  onToggleActive,
  toggleActiveTitle,
  toggleActiveTone = "navy",
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
  toggleActiveTitle?: string;
  toggleActiveTone?: ActionIconTone;
  onMove?: () => void;
  deleting?: boolean;
  className?: string;
}) {
  const rowDeleteEnabled = useDevOptionsStore((s) => s.rowDeleteEnabled);
  const showDelete = Boolean(onDelete) && rowDeleteEnabled;

  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {viewHref ? (
        <Link
          href={viewHref}
          title="Details"
          aria-label="Details"
          className={cn(shell, TONE.blue)}
          style={shellStyle}
        >
          <Eye className="h-4 w-4" strokeWidth={2.25} />
        </Link>
      ) : null}
      {onEdit ? (
        <ActionIconButton title="Edit" tone="blue" onClick={onEdit}>
          <Pencil className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
      {onApprove ? (
        <ActionIconButton title="Approve" tone="green" onClick={onApprove}>
          <CheckCircle className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
      {onToggleActive ? (
        <ActionIconButton
          title={toggleActiveTitle ?? "Toggle active"}
          tone={toggleActiveTone}
          onClick={onToggleActive}
        >
          <Power className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
      {onMove ? (
        <ActionIconButton title="Move to different parent" tone="violet" onClick={onMove}>
          <Move className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
      {onBan ? (
        <ActionIconButton title="Suspend" tone="amber" onClick={onBan}>
          <Ban className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
      {showDelete ? (
        <ActionIconButton title="Delete" tone="red" onClick={onDelete} disabled={deleting}>
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </ActionIconButton>
      ) : null}
    </div>
  );
}
