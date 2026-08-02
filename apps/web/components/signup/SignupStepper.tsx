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

/** Web only: all 9 steps fit inside the card — equal columns, no overflow. */
export function SignupStepper({
  currentIndex,
}: {
  currentIndex: number;
}) {
  const total = SIGNUP_STEPS.length;
  const idx = Math.max(0, Math.min(currentIndex, total - 1));
  const progress = ((idx + 1) / total) * 100;
  const lineFillPct = total <= 1 ? 0 : (idx / (total - 1)) * 100;

  return (
    <div className="mb-8 min-w-0 overflow-hidden">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold" style={{ color: B.blue }}>
          Step {idx + 1} of {total}
        </p>
        <p className="truncate text-xs font-semibold" style={{ color: B.muted }}>
          {SIGNUP_STEPS[idx]?.short}
        </p>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full" style={{ background: B.border }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: B.green }} />
      </div>

      <div className="relative w-full min-w-0 px-0.5">
        <div
          className="pointer-events-none absolute top-[14px] h-[2px] overflow-hidden rounded-full"
          style={{ left: "5.555%", right: "5.555%", background: B.border }}
          aria-hidden
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${lineFillPct}%`, background: B.green }}
          />
        </div>

        <ol className="relative z-[1] grid w-full grid-cols-9 gap-0">
          {SIGNUP_STEPS.map((step, stepIndex) => {
            const Icon = step.icon as LucideIcon;
            const done = stepIndex < idx;
            const active = stepIndex === idx;
            const bg = done ? B.green : active ? B.blue : "#F8FAFC";
            return (
              <li key={step.id} className="flex min-w-0 flex-col items-center text-center">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 sm:h-8 sm:w-8"
                  style={{
                    background: bg,
                    borderColor: active ? B.blue : done ? B.green : B.border,
                    color: done || active ? "#fff" : B.muted,
                    boxShadow: active ? `0 0 0 2px ${B.blue}20` : undefined,
                  }}
                  title={step.label}
                >
                  <Icon size={13} strokeWidth={2.25} className="sm:hidden" />
                  <Icon size={14} strokeWidth={2.25} className="hidden sm:block" />
                </div>
                <span
                  className="mt-1.5 w-full truncate px-0.5 text-center text-[9px] font-bold leading-tight sm:text-[10px]"
                  style={{ color: active ? B.blue : done ? B.greenDark : B.muted }}
                >
                  {step.short}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
