"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { AppShell } from "@/components/layout/AppShell";
import { FundRequestForm, type FundRequestRow } from "@/components/dashboard/FundRequestForm";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

export default function FundRequestPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<FundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchApi<FundRequestRow[]>("/fund-requests", { status: "all", limit: 30 }));
    } catch (err) {
      toast.error(extractApiError(err, "Failed to load fund requests"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    if (user?.role && user.role !== "retailer") {
      toast.error("Fund requests are for retailers only");
      router.replace("/wallet");
      return;
    }
    void load();
  }, [hydrated, accessToken, user?.role, router, load]);

  if (!hydrated || !accessToken) return null;
  if (user?.role && user.role !== "retailer") return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Fund request
          </h1>
          <p className="mt-0.5 text-[14px]" style={{ color: B.muted }}>
            Deposit to company bank, then submit UTR and receipt for balance credit
          </p>
        </div>

        <FundRequestForm
          rows={rows}
          historyLoading={loading}
          onRefreshHistory={() => void load()}
          onSuccess={() => void load()}
        />
      </div>
    </AppShell>
  );
}
