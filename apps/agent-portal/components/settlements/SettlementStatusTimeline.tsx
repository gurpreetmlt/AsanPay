"use client";

import { B } from "@/lib/brand";

const STEPS = [
  { key: "requested", label: "Requested" },
  { key: "processing", label: "Processing" },
  { key: "done", label: "Paid / Failed" },
] as const;

function stepIndex(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("success") || s.includes("paid") || s.includes("complete") || s.includes("fail") || s.includes("reject") || s.includes("return")) {
    return 2;
  }
  if (s.includes("process") || s.includes("pending") || s.includes("queue") || s.includes("initiated")) {
    return 1;
  }
  return 0;
}

function isFailed(status: string) {
  const s = status.toLowerCase();
  return s.includes("fail") || s.includes("reject") || s.includes("return") || s.includes("cancel");
}

/** Compact 3-step timeline for a settlement request row. */
export function SettlementStatusTimeline({
  status,
  note,
}: {
  status: string;
  note?: string | null;
}) {
  const idx = stepIndex(status);
  const failed = isFailed(status);

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => {
          const done = i <= idx;
          const color =
            i === 2 && failed && idx === 2
              ? "#DC2626"
              : done
                ? B.green
                : B.border;
          return (
            <div key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: color }}
                title={step.label}
              />
              <span
                className="truncate text-[10px] font-semibold"
                style={{ color: done ? (i === 2 && failed ? "#DC2626" : B.blue) : B.muted }}
              >
                {i === 2 && failed ? "Failed" : step.label}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="mx-0.5 h-px flex-1" style={{ background: i < idx ? B.green : B.border }} />
              ) : null}
            </div>
          );
        })}
      </div>
      {note ? (
        <p className="text-[10px] font-medium" style={{ color: B.muted }}>
          {note}
        </p>
      ) : idx < 2 ? (
        <p className="text-[10px] font-medium" style={{ color: B.muted }}>
          Usually 30 min–2 hrs after request
        </p>
      ) : null}
    </div>
  );
}
