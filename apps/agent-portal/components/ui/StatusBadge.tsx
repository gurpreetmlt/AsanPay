import type { CSSProperties, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";

export type StatusTone = "success" | "pending" | "danger" | "info" | "neutral";

const TONE: Record<StatusTone, { bg: string; color: string }> = {
  success: { bg: "#ecfdf5", color: "#047857" },
  pending: { bg: "#f3f4f6", color: "#4b5563" },
  danger: { bg: "#fef2f2", color: "#b91c1c" },
  info: { bg: "#eff6ff", color: "#1d4ed8" },
  neutral: { bg: "#f8fafc", color: "#64748b" },
};

function toneFromTxnStatus(status: string): StatusTone {
  if (status === "success") return "success";
  if (status === "pending") return "pending";
  return "danger";
}

function labelFromTxnStatus(status: string): string {
  if (status === "success") return "Success";
  if (status === "pending") return "Pending";
  return "Failed";
}

function IconForTxnStatus({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 size={10} />;
  if (status === "pending") return <Clock size={10} />;
  return <AlertCircle size={10} />;
}

/**
 * Soft status pill.
 * - Txn rows: `<StatusBadge status="success" | "pending" | "failed" />`
 * - Custom: `<StatusBadge tone="success">Active</StatusBadge>`
 */
export function StatusBadge({
  status,
  children,
  tone,
  className = "",
  style,
}: {
  status?: string;
  children?: ReactNode;
  tone?: StatusTone;
  className?: string;
  style?: CSSProperties;
}) {
  const resolvedTone: StatusTone = tone ?? (status ? toneFromTxnStatus(status) : "neutral");
  const t = TONE[resolvedTone];
  const content =
    children ??
    (status ? (
      <>
        <IconForTxnStatus status={status} />
        {labelFromTxnStatus(status)}
      </>
    ) : null);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${className}`.trim()}
      style={{ background: t.bg, color: t.color, ...style }}
    >
      {content}
    </span>
  );
}

/** Map common settlement / bank status strings → tone. */
export function toneFromStatus(raw: string | null | undefined): StatusTone {
  const s = (raw ?? "").toLowerCase();
  if (
    s.includes("active") ||
    s.includes("success") ||
    s.includes("verified") ||
    s.includes("approved") ||
    s.includes("completed") ||
    s.includes("paid")
  ) {
    return "success";
  }
  if (
    s.includes("fail") ||
    s.includes("reject") ||
    s.includes("cancel") ||
    s.includes("error") ||
    s.includes("block")
  ) {
    return "danger";
  }
  if (
    s.includes("process") ||
    s.includes("pending") ||
    s.includes("queue") ||
    s.includes("review") ||
    s.includes("submitted")
  ) {
    return "pending";
  }
  return "neutral";
}
