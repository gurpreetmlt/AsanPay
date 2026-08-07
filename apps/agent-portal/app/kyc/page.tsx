"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SignupStepper, SIGNUP_STEPS } from "@/components/signup/SignupStepper";
import { B } from "@/lib/brand";
import { needsSignupKycCompletion } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

/**
 * Business → KYC uses the same onboarding wizard as signup.
 * Incomplete / rejected → continue on /signup (PAN → … → Agreement).
 * Pending / verified → status inside the portal shell.
 */
export default function KycPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    if (needsSignupKycCompletion(user)) {
      router.replace("/signup");
    }
  }, [hydrated, accessToken, user, router]);

  if (!hydrated || !accessToken) return null;

  if (needsSignupKycCompletion(user)) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm" style={{ color: B.muted }}>
          Opening signup KYC steps…
        </div>
      </AppShell>
    );
  }

  const rejected = user?.kycStatus === "rejected";
  const verified = user?.kycStatus === "verified";
  const pendingReview = !rejected && !verified && Boolean(user?.hasKycDocs);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[900px] space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            KYC Onboarding
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Same steps as signup — status updates after admin review
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6" style={{ borderColor: B.border }}>
          <SignupStepper currentIndex={SIGNUP_STEPS.length - 1} />

          <div
            className="mt-2 flex items-start gap-3 rounded-xl border p-4"
            style={{
              borderColor: verified ? "#86EFAC" : pendingReview ? "#86EFAC" : "#FECACA",
              background: verified || pendingReview ? "#F0FDF4" : "#FEF2F2",
            }}
          >
            {verified ? (
              <CheckCircle2 size={22} className="mt-0.5 shrink-0" style={{ color: B.green }} />
            ) : pendingReview ? (
              <Clock3 size={22} className="mt-0.5 shrink-0" style={{ color: B.green }} />
            ) : (
              <ShieldAlert size={22} className="mt-0.5 shrink-0" style={{ color: "#DC2626" }} />
            )}
            <div>
              <p
                className="text-sm font-bold"
                style={{ color: verified || pendingReview ? "#14532D" : "#991B1B" }}
              >
                {verified
                  ? "KYC verified"
                  : pendingReview
                    ? "KYC under review"
                    : "KYC rejected"}
              </p>
              <p
                className="mt-1 text-xs font-medium"
                style={{ color: verified || pendingReview ? "#15803D" : "#B91C1C" }}
              >
                {verified
                  ? "All signup KYC steps are complete. Services are unlocked."
                  : pendingReview
                    ? "You finished every signup KYC step. Services stay locked until admin approval."
                    : "Update your details on the signup KYC flow and submit again."}
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-2">
            {SIGNUP_STEPS.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: B.border }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                  style={{ background: B.green }}
                >
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className="text-sm font-semibold" style={{ color: B.blue }}>
                  {step.label}
                </span>
              </li>
            ))}
          </ul>

          {rejected ? (
            <button
              type="button"
              onClick={() => router.push("/signup")}
              className="mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: B.badgeGrad }}
            >
              Resubmit KYC
            </button>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
