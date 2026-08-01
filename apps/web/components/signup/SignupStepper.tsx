import type { LucideIcon } from "lucide-react";
import {
  Phone,
  UserRound,
  CreditCard,
  Fingerprint,
  Settings2,
  Store,
  FileText,
  Camera,
  ScrollText,
} from "lucide-react";
import { B } from "@/lib/brand";

export const SIGNUP_STEPS = [
  { id: "mobile", label: "Mobile Verification", short: "Mobile", icon: Phone },
  { id: "role", label: "Role Identification", short: "Role", icon: UserRound },
  { id: "pan", label: "PAN Verification", short: "PAN", icon: CreditCard },
  { id: "aadhaar", label: "Aadhaar Verification", short: "Aadhaar", icon: Fingerprint },
  { id: "basic", label: "Basic Details & Email Verification", short: "Details", icon: Settings2 },
  { id: "business", label: "Business Details", short: "Business", icon: Store },
  { id: "bank", label: "Bank Details", short: "Bank", icon: FileText },
  { id: "images", label: "Business Images", short: "Photos", icon: Camera },
  { id: "agreement", label: "Agreement", short: "Agree", icon: ScrollText },
] as const;

export type SignupStepId = (typeof SIGNUP_STEPS)[number]["id"];

/** Show only a 3-step window + progress bar (avoids cramped 9-icon line). */
export function SignupStepper({
  currentIndex,
}: {
  currentIndex: number;
}) {
  const total = SIGNUP_STEPS.length;
  const idx = Math.max(0, Math.min(currentIndex, total - 1));
  const progress = ((idx + 1) / total) * 100;

  let start = Math.max(0, idx - 1);
  let end = Math.min(total - 1, start + 2);
  start = Math.max(0, end - 2);
  const visible = SIGNUP_STEPS.slice(start, end + 1).map((step, offset) => ({
    ...step,
    index: start + offset,
  }));

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold" style={{ color: B.blue }}>
          Step {idx + 1} of {total}
        </p>
        <p className="truncate text-xs font-semibold" style={{ color: B.muted }}>
          {SIGNUP_STEPS[idx]?.short}
        </p>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full" style={{ background: B.border }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: B.green }} />
      </div>
      <div className="flex items-start justify-between gap-2">
        {visible.map((step, i) => {
          const Icon = step.icon as LucideIcon;
          const done = step.index < idx;
          const active = step.index === idx;
          const bg = done ? B.green : active ? B.blue : "#EEF2FF";
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-center">
              {i > 0 ? (
                <div
                  className="mx-1 mt-4 h-0.5 flex-1 rounded"
                  style={{ background: step.index <= idx ? B.green : B.border }}
                />
              ) : null}
              <div className="flex w-[4.5rem] shrink-0 flex-col items-center">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2"
                  style={{
                    background: bg,
                    borderColor: active ? B.blue : done ? B.green : B.border,
                    color: done || active ? "#fff" : B.muted,
                    transform: active ? "scale(1.06)" : undefined,
                  }}
                  title={step.label}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </div>
                <span
                  className="mt-1.5 max-w-full truncate text-center text-[11px] font-bold"
                  style={{ color: active ? B.blue : done ? B.greenDark : B.muted }}
                >
                  {step.short}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
