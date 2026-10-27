"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { RateCardScreen } from "@/components/commission/rateCard/RateCardScreen";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function TaxCommissionRateCardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-6">
        <SectionTabs group="taxCommission" />
        <RateCardScreen />
      </div>
    </AdminShell>
  );
}
