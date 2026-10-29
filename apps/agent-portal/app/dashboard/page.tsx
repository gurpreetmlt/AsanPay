"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { RetailerDashboard } from "@/components/dashboard/RetailerDashboard";
import { DistributorDashboard } from "@/components/dashboard/DistributorDashboard";
import { SuperDistributorDashboard } from "@/components/dashboard/SuperDistributorDashboard";
import { KycOnboardingBanner } from "@/components/dashboard/KycOnboardingBanner";
import { ServiceWindowBanner } from "@/components/dashboard/ServiceWindowBanner";
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
  const kyc = user?.kycStatus;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {/* Greeting Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: B.blue }}>
              {greeting}, {user?.name?.split(" ")[0] ?? "Partner"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs" style={{ color: B.muted }}>
                AsanPay · {roleDisplayName(user?.role)} Dashboard
              </p>
              {kyc === "verified" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: `${B.green}1f`, color: B.greenDark }}
                >
                  <BadgeCheck size={12} strokeWidth={2.5} />
                  Verified
                </span>
              ) : kyc === "rejected" ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "#FEE2E2", color: "#991B1B" }}
                >
                  KYC Rejected
                </span>
              ) : user?.hasKycDocs ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "#FEF3C7", color: "#92400E" }}
                >
                  Under Review
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: "#FFEDD5", color: "#9A3412" }}
                >
                  KYC Pending
                </span>
              )}
            </div>
          </div>
        </div>

        <ServiceWindowBanner />
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
