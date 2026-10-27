"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { SectionTabs } from "@/components/layout/SectionTabs";
import { TaxSettingsScreen } from "@/components/commission/TaxSettingsScreen";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function TaxCommissionTaxPage() {
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
        <SectionTabs group="tax" />
        <Suspense fallback={<p className="text-sm text-slate-500">Loading tax settings…</p>}>
          <TaxSettingsScreen />
        </Suspense>
      </div>
    </AdminShell>
  );
}
