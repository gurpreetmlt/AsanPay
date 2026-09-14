"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import type { ApiResponse } from "@asanpay/shared-types";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import api from "@/lib/api";
import { B } from "@/lib/brand";
import { createAttemptKeyHolder } from "@/lib/idempotencyKey";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type ServiceCode = "MOBILE_PREPAID" | "DTH";

const MOBILE_OPS = [
  { code: "JIO", label: "Reliance JIO" },
  { code: "AT", label: "Airtel" },
  { code: "VI", label: "Vi (Vodafone Idea)" },
  { code: "BL", label: "BSNL" },
  { code: "JPL", label: "Jio Lite" },
  { code: "TESTOP", label: "TestOperator" },
] as const;

const DTH_OPS = [
  { code: "TTV", label: "Tata Play" },
  { code: "ATV", label: "Airtel Digital TV" },
  { code: "DTV", label: "Dish TV" },
  { code: "STV", label: "Sun Direct" },
  { code: "VTV", label: "d2h" },
] as const;

function parseService(raw: string | null): ServiceCode {
  return raw === "DTH" ? "DTH" : "MOBILE_PREPAID";
}

function RechargeLoading() {
  return (
    <AppShell>
      <div className="px-4 py-8 text-sm" style={{ color: B.muted }}>
        Loading…
      </div>
    </AppShell>
  );
}

function RechargeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const serviceCode = parseService(search.get("service"));
  const ops = serviceCode === "DTH" ? DTH_OPS : MOBILE_OPS;

  const [accountRef, setAccountRef] = useState("");
  const [operatorCode, setOperatorCode] = useState<string>(ops[0]!.code);
  const [amount, setAmount] = useState("");
  const [txnPin, setTxnPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const attemptKey = useRef(createAttemptKeyHolder("recharge"));

  useEffect(() => {
    setOperatorCode(ops[0]!.code);
  }, [serviceCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    if (user?.role && user.role !== "retailer") {
      toast.error("Recharge is for retailers only");
      router.replace("/dashboard");
    }
  }, [hydrated, accessToken, user?.role, router]);

  const title = useMemo(
    () => (serviceCode === "DTH" ? "DTH recharge" : "Mobile prepaid"),
    [serviceCode],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const number = accountRef.replace(/\D/g, "");
    if (serviceCode === "MOBILE_PREPAID" && number.length !== 10) {
      toast.error("Enter a valid 10-digit mobile");
      return;
    }
    if (serviceCode === "DTH" && number.length < 8) {
      toast.error("Enter a valid DTH subscriber number");
      return;
    }
    if (!operatorCode) {
      toast.error("Select an operator");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
      toast.error("Enter a valid recharge amount");
      return;
    }
    if (txnPin.length !== 4) {
      toast.error("Enter your 4-digit transaction PIN");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<
        ApiResponse<{ txn?: { txnRef?: string; status?: string }; provider?: { status?: string; message?: string } }>
      >("/txn/recharge", {
        serviceCode,
        operatorCode,
        accountRef: number,
        amount: amount.trim(),
        txnPin,
        idempotencyKey: attemptKey.current.get(),
      });
      if (!data.success) throw new Error(data.message || "Recharge failed");
      const txn = data.data?.txn;
      const status = txn?.status ?? data.data?.provider?.status ?? "pending";
      setLastRef(txn?.txnRef ?? null);
      setLastStatus(status);
      if (status === "success") toast.success("Recharge successful");
      else if (status === "failed") toast.error(data.data?.provider?.message || "Recharge failed");
      else toast.success("Recharge submitted — status pending. Check Transactions shortly.");
      attemptKey.current.clear();
      setTxnPin("");
    } catch (err) {
      toast.error(extractApiError(err, "Recharge failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated || !accessToken) return null;
  if (user?.role && user.role !== "retailer") return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-5 sm:px-6">
        <div>
          <button
            type="button"
            className="text-sm font-semibold"
            style={{ color: B.blueLight }}
            onClick={() => router.push("/dashboard")}
          >
            ← Back
          </button>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: B.blue }}>
            {title}
          </h1>
          <p className="mt-0.5 text-[14px]" style={{ color: B.muted }}>
            Powered by VyaparAPI when enabled in Admin → Providers
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-white p-5"
          style={{ borderColor: B.border }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              {serviceCode === "DTH" ? "Subscriber ID" : "Mobile number"}
            </span>
            <input
              inputMode="numeric"
              autoComplete="tel"
              maxLength={serviceCode === "DTH" ? 20 : 10}
              value={accountRef}
              onChange={(e) => setAccountRef(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
              placeholder={serviceCode === "DTH" ? "DTH number" : "10-digit mobile"}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Operator
            </span>
            <select
              value={operatorCode}
              onChange={(e) => setOperatorCode(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
            >
              {ops.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label} ({o.code})
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Amount (₹)
            </span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: B.border }}
              placeholder="e.g. 199"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: B.blue }}>
              Transaction PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={txnPin}
              onChange={(e) => setTxnPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none tracking-widest"
              style={{ borderColor: B.border }}
              placeholder="••••"
            />
          </label>

          <PrimaryButton type="submit" variant="primary" loading={loading} className="w-full">
            Recharge
          </PrimaryButton>
        </form>

        {lastRef ? (
          <div className="rounded-2xl border bg-white p-4 text-sm" style={{ borderColor: B.border }}>
            <p style={{ color: B.muted }}>Last txn</p>
            <p className="font-semibold" style={{ color: B.blue }}>
              {lastRef}
            </p>
            <p className="mt-1 capitalize" style={{ color: B.muted }}>
              Status: {lastStatus}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-bold"
              style={{ color: B.blueLight }}
              onClick={() => router.push("/transactions")}
            >
              View transactions →
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function RechargePage() {
  return (
    <Suspense fallback={<RechargeLoading />}>
      <RechargeInner />
    </Suspense>
  );
}
