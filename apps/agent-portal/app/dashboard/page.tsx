"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RetailerDashboard } from "@/components/dashboard/RetailerDashboard";
import { DistributorDashboard } from "@/components/dashboard/DistributorDashboard";
import { SuperDistributorDashboard } from "@/components/dashboard/SuperDistributorDashboard";
import { KycOnboardingBanner } from "@/components/dashboard/KycOnboardingBanner";
import { nextOnboardingPath } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";
import { B } from "@/lib/brand";

export default function DashboardPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (!accessToken || !user) return;
    const blocked = nextOnboardingPath(user);
    if (blocked) router.replace(blocked);
  }, [accessToken, user, router]);

  if (!hydrated || !accessToken) return null;
  if (nextOnboardingPath(user)) return null;

  const greeting = getGreeting();

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        {/* Greeting Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              {greeting}, {user?.name?.split(" ")[0] ?? "Partner"}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: B.muted }}>
              AsanPay · {roleDisplayName(user?.role)} Dashboard
            </p>
          </div>
        </div>

        <KycOnboardingBanner />

        {/* Role-specific Dashboard */}
        {user?.role === "super_distributor" && <SuperDistributorDashboard />}
        {user?.role === "distributor" && <DistributorDashboard />}
        {(user?.role === "retailer" || !user?.role) && <RetailerDashboard />}
      </div>
    </AppShell>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function roleDisplayName(role: string | undefined | null) {
  if (role === "super_distributor") return "Super Distributor";
  if (role === "distributor") return "Distributor";
  return "Retailer";
}
