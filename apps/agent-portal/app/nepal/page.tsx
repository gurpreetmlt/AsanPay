"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { B } from "@/lib/brand";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function NepalPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="w-full space-y-4 px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm"
            style={{ borderColor: B.border, color: B.blue }}
            onClick={() => router.push("/dashboard")}
            aria-label="Back"
          >
            <ArrowLeft size={16} strokeWidth={2.4} />
          </button>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: B.blue }}>
            Nepal Remittance
          </h1>
        </div>

        <div
          className="flex flex-col items-center rounded-2xl border bg-white px-6 py-16 text-center"
          style={{ borderColor: B.border }}
        >
          <span
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: B.secondary, color: B.blueLight }}
          >
            <Globe2 size={26} strokeWidth={1.8} />
          </span>
          <p className="text-lg font-semibold" style={{ color: B.blue }}>
            Nepal remittance is coming soon
          </p>
          <p className="mt-2 max-w-md text-sm" style={{ color: B.muted }}>
            Sending money to Nepal is not available yet. Use Money Transfer for transfers to Indian bank
            accounts.
          </p>
          <PrimaryButton
            type="button"
            variant="primary"
            showArrow={false}
            className="mt-6 !w-auto"
            onClick={() => router.push("/dmt")}
          >
            Open Money Transfer
          </PrimaryButton>
        </div>
      </div>
    </AppShell>
  );
}
