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

/** Web only: all 9 steps — spaced icons with connectors between them. */
export function SignupStepper({
  currentIndex,
}: {
  currentIndex: number;
}) {
  const total = SIGNUP_STEPS.length;
  const idx = Math.max(0, Math.min(currentIndex, total - 1));
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold" style={{ color: B.blue }}>
          Step {idx + 1} of {total}
        </p>
        <p className="truncate text-xs font-semibold" style={{ color: B.muted }}>
          {SIGNUP_STEPS[idx]?.short}
        </p>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full" style={{ background: B.border }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: B.green }} />
      </div>

      <div className="flex w-full items-start">
        {SIGNUP_STEPS.map((step, stepIndex) => {
          const Icon = step.icon as LucideIcon;
          const done = stepIndex < idx;
          const active = stepIndex === idx;
          const bg = done ? B.green : active ? B.blue : "#F8FAFC";
          return (
            <div key={step.id} className="contents">
              {stepIndex > 0 ? (
                <div
                  className="mx-0.5 mt-5 h-[3px] min-w-[10px] flex-1 rounded-full sm:mx-1"
                  style={{ background: stepIndex <= idx ? B.green : B.border }}
                  aria-hidden
                />
              ) : null}
              <div className="flex w-12 shrink-0 flex-col items-center sm:w-[3.75rem]">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 sm:h-10 sm:w-10"
                  style={{
                    background: bg,
                    borderColor: active ? B.blue : done ? B.green : B.border,
                    color: done || active ? "#fff" : B.muted,
                    boxShadow: active ? `0 0 0 4px ${B.blue}18` : undefined,
                  }}
                  title={step.label}
                >
                  <Icon size={16} strokeWidth={2.25} />
                </div>
                <span
                  className="mt-2 w-full truncate text-center text-[10px] font-bold leading-tight sm:text-[11px]"
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
