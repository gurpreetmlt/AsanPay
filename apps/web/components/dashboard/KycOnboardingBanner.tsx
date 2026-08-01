"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { B } from "@/lib/brand";
import { needsSignupKycCompletion } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";

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

  if (rejected) {
    title = "KYC rejected — please resubmit";
    body = "Update your details and submit again to continue onboarding.";
    cta = "Resubmit KYC";
  } else if (pendingReview) {
    title = "KYC under review";
    body = "Onboarding in progress. Services stay locked until admin approval.";
    cta = "";
    href = "";
  } else if (needsComplete) {
    title = "Complete your KYC for Onboarding";
    body = "Continue where you left off to submit documents for approval.";
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: rejected ? "#F59E0B66" : `${B.blue}33`,
        background: rejected ? "#FEF3C7" : `${B.blue}0F`,
      }}
    >
      <div className="flex items-start gap-3">
        {pendingReview ? (
          <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: B.blue }} />
        ) : (
          <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: rejected ? "#D97706" : B.blue }} />
        )}
        <div>
          <p className="text-sm font-bold" style={{ color: B.blue }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: B.muted }}>
            {body}
          </p>
        </div>
      </div>
      {cta ? (
        <button
          type="button"
          onClick={() => router.push(href)}
          className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-white"
          style={{ background: B.badgeGrad }}
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}
