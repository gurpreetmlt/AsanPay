"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, ShieldAlert } from "lucide-react";
import { needsSignupKycCompletion } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";

type BannerTone = "red" | "orange" | "yellow";

const TONE: Record<
  BannerTone,
  {
    border: string;
    background: string;
    title: string;
    body: string;
    icon: string;
    button: string;
  }
> = {
  red: {
    border: "#FECACA",
    background: "#FEF2F2",
    title: "#991B1B",
    body: "#B91C1C",
    icon: "#DC2626",
    button: "linear-gradient(135deg,#DC2626,#B91C1C)",
  },
  orange: {
    border: "#FED7AA",
    background: "#FFF7ED",
    title: "#9A3412",
    body: "#C2410C",
    icon: "#EA580C",
    button: "linear-gradient(135deg,#F97316,#EA580C)",
  },
  yellow: {
    border: "#FDE68A",
    background: "#FFFBEB",
    title: "#92400E",
    body: "#B45309",
    icon: "#D97706",
    button: "linear-gradient(135deg,#F59E0B,#D97706)",
  },
};

/** Hanging banner under page header / above wallet — KYC onboarding status. */
export function KycOnboardingBanner() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  if (!user || user.kycStatus === "verified") return null;

  const needsComplete = needsSignupKycCompletion(user);
  const rejected = user.kycStatus === "rejected";
  const pendingReview = user.kycStatus === "pending" && user.hasKycDocs;

  let title = "Complete your KYC for Onboarding";
  let body = "Finish signup KYC to unlock wallet services after admin approval.";
  let cta = "Complete KYC";
  let href = "/signup";
  let tone: BannerTone = "yellow";

  if (rejected) {
    title = "KYC rejected — please resubmit";
    body = "Update your details and submit again to continue onboarding.";
    cta = "Resubmit KYC";
    tone = "red";
  } else if (pendingReview) {
    title = "KYC under review";
    body = "Onboarding in progress. Services stay locked until admin approval.";
    cta = "";
    href = "";
    tone = "orange";
  } else if (needsComplete) {
    title = "Complete your KYC for Onboarding";
    body = "Continue where you left off to submit documents for approval.";
    tone = "yellow";
  }

  const colors = TONE[tone];
  const Icon = rejected ? ShieldAlert : pendingReview ? Clock3 : AlertTriangle;

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: colors.border,
        background: colors.background,
      }}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 shrink-0" style={{ color: colors.icon }} />
        <div>
          <p className="text-sm font-bold" style={{ color: colors.title }}>
            {title}
          </p>
          <p className="text-xs font-medium" style={{ color: colors.body }}>
            {body}
          </p>
        </div>
      </div>
      {cta ? (
        <button
          type="button"
          onClick={() => router.push(href)}
          className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white"
          style={{ background: colors.button }}
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}
