"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** Shown on AEPS / DMT after the agent skipped onboarding: the screen works, transactions don't yet. */
export function OnboardingPendingBanner({ next }: { next: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-bold text-amber-900">AEPS onboarding pending</p>
          <p className="text-xs text-amber-800">
            Complete onboarding with the bank partner to unlock daily verification and transactions.
          </p>
        </div>
      </div>
      <Link
        href={`/onboarding/aeps-agent?next=${encodeURIComponent(next)}`}
        className="inline-flex cursor-pointer items-center rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800"
      >
        Complete onboarding
      </Link>
    </div>
  );
}
