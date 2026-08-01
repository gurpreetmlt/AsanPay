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
  { id: "mobile", label: "Mobile Verification", icon: Phone },
  { id: "role", label: "Role Identification", icon: UserRound },
  { id: "pan", label: "PAN Verification", icon: CreditCard },
  { id: "aadhaar", label: "Aadhaar Verification", icon: Fingerprint },
  { id: "basic", label: "Basic Details & Email Verification", icon: Settings2 },
  { id: "business", label: "Business Details", icon: Store },
  { id: "bank", label: "Bank Details", icon: FileText },
  { id: "images", label: "Business Images", icon: Camera },
  { id: "agreement", label: "Agreement", icon: ScrollText },
] as const;

export type SignupStepId = (typeof SIGNUP_STEPS)[number]["id"];

export function SignupStepper({
  currentIndex,
}: {
  currentIndex: number;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-1 overflow-x-auto pb-1">
      {SIGNUP_STEPS.map((step, i) => {
        const Icon = step.icon as LucideIcon;
        const done = i < currentIndex;
        const active = i === currentIndex;
        const color = done ? B.green : active ? B.blue : B.muted;
        const bg = done ? B.green : active ? B.blue : "transparent";
        const border = done || active ? "transparent" : B.border;
        return (
          <div key={step.id} className="flex min-w-0 flex-1 items-center">
            <div
              className="mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2"
              style={{
                background: done || active ? bg : "#fff",
                borderColor: border === "transparent" ? bg : border,
                color: done || active ? "#fff" : color,
              }}
              title={step.label}
            >
              <Icon size={16} strokeWidth={2.2} />
            </div>
            {i < SIGNUP_STEPS.length - 1 ? (
              <div
                className="mx-0.5 h-0.5 min-w-[8px] flex-1"
                style={{ background: i < currentIndex ? B.green : B.border }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
