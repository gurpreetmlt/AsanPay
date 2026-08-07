"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, ShieldAlert } from "lucide-react";
import { needsSignupKycCompletion } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";

type BannerTone = "red" | "orange" | "green";

const TONE: Record<
  BannerTone,
  {
    border: string;
    background: string;
    title: string;
    body: string;
    icon: string;
    button: string;
    badgeBg: string;
    badgeText: string;
    badge: string;
  }
> = {
  /** Rejected */
  red: {
    border: "#FECACA",
    background: "#FEF2F2",
    title: "#991B1B",
    body: "#B91C1C",
    icon: "#DC2626",
    button: "linear-gradient(135deg,#DC2626,#B91C1C)",
    badgeBg: "#FEE2E2",
    badgeText: "#991B1B",
    badge: "REJECTED",
  },
  /** Complete KYC — action needed */
  orange: {
    border: "#FDBA74",
    background: "#FFF7ED",
    title: "#9A3412",
    body: "#C2410C",
    icon: "#EA580C",
    button: "linear-gradient(135deg,#F97316,#EA580C)",
    badgeBg: "#FFEDD5",
    badgeText: "#9A3412",
    badge: "ACTION NEEDED",
  },
  /** Under review — submitted, waiting for admin */
  green: {
    border: "#86EFAC",
    background: "#F0FDF4",
    title: "#14532D",
    body: "#15803D",
    icon: "#16A34A",
    button: "linear-gradient(135deg,#22C55E,#16A34A)",
    badgeBg: "#DCFCE7",
    badgeText: "#166534",
    badge: "UNDER REVIEW",
  },
};

/** Hanging banner under page header / above wallet — KYC onboarding status. */
export function KycOnboardingBanner() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Verified → no banner (services unlocked)
  if (!user || user.kycStatus === "verified") return null;

  const needsComplete = needsSignupKycCompletion(user);
  const rejected = user.kycStatus === "rejected";
  const pendingReview = !rejected && user.hasKycDocs;

  let title = "Complete your KYC for Onboarding";
  let body = "Finish signup KYC to unlock services after admin approval.";
  let cta = "Complete KYC";
  let href = "/settings?tab=kyc";
  let tone: BannerTone = "orange";

  if (rejected) {
    title = "KYC rejected — please resubmit";
    body = "Update your details and submit again to continue onboarding.";
    cta = "Resubmit KYC";
    tone = "red";
  } else if (pendingReview) {
    title = "KYC under review";
    body = "Onboarding in progress. Services stay locked until admin approval.";
    cta = "View KYC status";
    href = "/settings?tab=kyc";
    tone = "green";
  } else if (needsComplete) {
    title = "Complete your KYC for Onboarding";
    body = "Continue where you left off to submit documents for approval.";
    tone = "orange";
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
          <span
            className="mb-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold tracking-wide"
            style={{ background: colors.badgeBg, color: colors.badgeText }}
          >
            {colors.badge}
          </span>
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
