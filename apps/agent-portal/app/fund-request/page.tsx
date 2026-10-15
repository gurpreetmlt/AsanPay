"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { isFundRequestEnabled, type ApiResponse, type AuthUser } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { FundRequestForm, type FundRequestRow } from "@/components/dashboard/FundRequestForm";
import api, { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

const FUND_REQUEST_DISABLED_MESSAGE =
  "Fund requests are not enabled for your account. Contact your sales manager to enable them.";

export default function FundRequestPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const enabled = user ? isFundRequestEnabled(user.role, user.fundRequestEnabled) : false;
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
    if (enabled) void load();
  }, [hydrated, accessToken, router, load, enabled]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    api
      .get<ApiResponse<{ user: AuthUser }>>("/auth/me")
      .then(({ data }) => {
        if (data.success && data.data?.user) useAuthStore.getState().setUser(data.data.user);
      })
      .catch(() => {});
  }, [hydrated, accessToken]);

  if (!hydrated || !accessToken) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            Fund request
          </h1>
          <p className="mt-0.5 text-[14px]" style={{ color: B.muted }}>
            Deposit cash at a company bank branch, then upload the bank receipt for verification
          </p>
        </div>

        {enabled ? (
          <FundRequestForm
            rows={rows}
            historyLoading={loading}
            onRefreshHistory={() => void load()}
            onSuccess={() => void load()}
          />
        ) : (
          <div
            className="rounded-2xl border px-5 py-8 text-center"
            style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}
          >
            <p className="text-base font-bold" style={{ color: "#92400E" }}>
              Fund requests are off for your account
            </p>
            <p className="mt-1 text-sm" style={{ color: "#92400E" }}>
              {FUND_REQUEST_DISABLED_MESSAGE}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
