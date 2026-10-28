"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, ShieldAlert } from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { needsSignupKycCompletion } from "@/lib/onboarding";
import { getSignupResumeStep, loadSignupDraft } from "@/lib/signupDraft";
import { useAuthStore } from "@/lib/store";
import { fetchApi } from "@/lib/api";

/** Rejection reason from the admin, loaded only while KYC is rejected. */
function useKycRejectReason(rejected: boolean): string | null {
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    if (!rejected) return;
    let cancelled = false;
    fetchApi<{ profile: { rejectReason?: string | null } }>("/kyc/me")
      .then((r) => {
        if (!cancelled) setReason(r.profile.rejectReason ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rejected]);
  return rejected ? reason : null;
}

type BannerTone = "red" | "orange" | "green";

const TONE: Record<
  BannerTone,
  {
    border: string;
    background: string;
    title: string;
    body: string;
    icon: string;
    badgeBg: string;
    badgeText: string;
    badge: string;
  }
> = {
  red: {
    border: "#FECACA",
    background: "#FEF2F2",
    title: "#991B1B",
    body: "#B91C1C",
    icon: "#DC2626",
    badgeBg: "#FEE2E2",
    badgeText: "#991B1B",
    badge: "REJECTED",
  },
  orange: {
    border: "#FDBA74",
    background: "#FFF7ED",
    title: "#9A3412",
    body: "#C2410C",
    icon: "#EA580C",
    badgeBg: "#FFEDD5",
    badgeText: "#9A3412",
    badge: "ACTION NEEDED",
  },
  green: {
    border: "#86EFAC",
    background: "#F0FDF4",
    title: "#14532D",
    body: "#15803D",
    icon: "#16A34A",
    badgeBg: "#DCFCE7",
    badgeText: "#166534",
    badge: "UNDER REVIEW",
  },
};

function continueKycHref(userId?: string, mobile?: string): string {
  const phone = (mobile || "").replace(/\D/g, "").slice(0, 10);
  const draft = (userId && loadSignupDraft(userId)) || (phone ? loadSignupDraft(phone) : null);
  const step = draft ? getSignupResumeStep(draft, 2) : 2;
  return `/signup?from=settings&step=${step}`;
}

/**
 * Same KYC states as new signup for every role:
 * incomplete → Complete KYC | submitted → under review | rejected → Resubmit.
 */
export function KycOnboardingBanner() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const rejectReason = useKycRejectReason(user?.kycStatus === "rejected");
  if (!user) return null;
  if (user.kycStatus === "verified" && user.hasKycDocs) return null;
  if (!needsSignupKycCompletion(user) && !(user.hasKycDocs && user.kycStatus !== "rejected")) {
    return null;
  }

  const rejected = user.kycStatus === "rejected";
  const pendingReview = !rejected && user.hasKycDocs && user.kycStatus !== "verified";

  let title = "Complete your KYC for Onboarding";
  let body = "Finish signup KYC to unlock services after admin approval.";
  let cta = "Complete KYC";
  let href = continueKycHref(user.id, user.mobile);
  let tone: BannerTone = "orange";

  if (rejected) {
    title = "KYC rejected — please resubmit";
    body = rejectReason
      ? `Reason: ${rejectReason}. Fix this and submit again to continue onboarding.`
      : "Update your details and submit again to continue onboarding.";
    cta = "Resubmit KYC";
    href = continueKycHref(user.id, user.mobile);
    tone = "red";
  } else if (pendingReview) {
    title = "KYC under review";
    body = "Onboarding in progress. Services stay locked until admin approval.";
    cta = "View KYC status";
    href = "/settings?tab=profile";
    tone = "green";
  } else {
    title = "Complete your KYC for Onboarding";
    body = "Continue where you left off to submit documents for approval.";
    cta = "Complete KYC";
    href = continueKycHref(user.id, user.mobile);
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
      <PrimaryButton
        type="button"
        variant="primary"
        size="sm"
        onClick={() => router.push(href)}
        className="!w-auto shrink-0"
      >
        {cta}
      </PrimaryButton>
    </div>
  );
}
