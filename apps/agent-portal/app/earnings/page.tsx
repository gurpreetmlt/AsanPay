"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { fetchApi } from "@/lib/api";
import { B } from "@/lib/brand";
import { extractApiError } from "@/lib/onboarding";
import { useAuthStore } from "@/lib/store";
import { useAuthHydrated } from "@/lib/useAuthHydrated";

type EarningsSummary = {
  from: string;
  to: string;
  totalNet: string;
  creditCount: number;
  activeServices: number;
  activeDownline: number | null;
};

type ProductRow = {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  volume: string;
  netAmount: string;
  creditCount: number;
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatInr(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function MyEarningsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const hydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPartner = user?.role === "super_distributor" || user?.role === "distributor";
  const downlineLabel = user?.role === "super_distributor" ? "Distributor-wise" : "Retailer-wise";

  const initialFrom = search.get("from") || todayYmd();
  const initialTo = search.get("to") || initialFrom;

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [mode, setMode] = useState<"product" | "downline">("product");
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  useEffect(() => {
    if (hydrated && user?.role === "retailer") router.replace("/dashboard");
  }, [hydrated, user?.role, router]);

  useEffect(() => {
    if (!accessToken || !isPartner) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [sum, prod] = await Promise.all([
          fetchApi<EarningsSummary>("/earnings/summary", { from, to }),
          fetchApi<{ products: ProductRow[] }>("/earnings/by-product", { from, to }),
        ]);
        if (!alive) return;
        setSummary(sum);
        setProducts(prod.products);
      } catch (err) {
        toast.error(extractApiError(err, "Could not load earnings"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, isPartner, from, to]);

  const badge = useMemo(() => {
    if (mode === "downline" && summary?.activeDownline != null) {
      return `${summary.activeDownline} Active ${user?.role === "super_distributor" ? "Distributors" : "Retailers"}`;
    }
    return `${summary?.activeServices ?? 0} Active Services`;
  }, [mode, summary, user?.role]);

  if (!hydrated || !accessToken || !isPartner) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[960px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: B.blue }}>
            My Earnings
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: B.muted }}>
            Net commission credited to your wallet
          </p>
        </div>

        <div
          className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4"
          style={{ borderColor: B.border }}
        >
          <label className="flex flex-col gap-1 text-xs font-bold" style={{ color: B.muted }}>
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold" style={{ color: B.muted }}>
            To
            <input
              type="date"
              value={to}
              min={from}
              max={todayYmd()}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: B.border, color: B.blue }}
            />
          </label>
          <PrimaryButton
            type="button"
            variant="primary"
            size="sm"
            showArrow={false}
            className="!w-auto"
            onClick={() => {
              const t = todayYmd();
              setFrom(t);
              setTo(t);
            }}
          >
            Today
          </PrimaryButton>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: B.border }}>
          <div className="flex flex-wrap items-center gap-4">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "#DCFCE7", color: B.green }}
            >
              <TrendingUp size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold tracking-wide" style={{ color: B.muted }}>
                TOTAL EARNINGS
              </p>
              <p className="text-3xl font-extrabold" style={{ color: B.blue }}>
                {loading && !summary ? "…" : formatInr(summary?.totalNet ?? "0")}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ background: "#EEF2FF", color: B.blueLight }}
            >
              {badge}
            </span>
          </div>
        </div>

        <div
          className="flex gap-1 rounded-2xl border bg-white p-1"
          style={{ borderColor: B.border }}
        >
          <button
            type="button"
            onClick={() => setMode("downline")}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition"
            style={{
              background: mode === "downline" ? B.blue : "transparent",
              color: mode === "downline" ? "#fff" : B.muted,
            }}
          >
            {downlineLabel}
          </button>
          <button
            type="button"
            onClick={() => setMode("product")}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition"
            style={{
              background: mode === "product" ? B.blue : "transparent",
              color: mode === "product" ? "#fff" : B.muted,
            }}
          >
            Product-wise
          </button>
        </div>

        {mode === "downline" ? (
          <div
            className="rounded-2xl border bg-white px-6 py-10 text-center"
            style={{ borderColor: B.border }}
          >
            <p className="text-base font-extrabold" style={{ color: B.blue }}>
              Coming soon
            </p>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Downline-wise earnings breakdown will be available soon.
            </p>
          </div>
        ) : loading && products.length === 0 ? (
          <p className="text-sm" style={{ color: B.muted }}>
            Loading…
          </p>
        ) : products.length === 0 ? (
          <div
            className="rounded-2xl border bg-white px-6 py-10 text-center"
            style={{ borderColor: B.border }}
          >
            <p className="text-base font-extrabold" style={{ color: B.blue }}>
              No earnings in this range
            </p>
            <p className="mt-1 text-sm" style={{ color: B.muted }}>
              Successful transactions that credit commission will show here as net earnings.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: B.border }}>
            {products.map((p, i) => (
              <div
                key={p.serviceId}
                className="flex items-center gap-3 px-4 py-3.5"
                style={i < products.length - 1 ? { borderBottom: `1px solid ${B.border}` } : undefined}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "#EEF2FF", color: B.blueLight }}
                >
                  <TrendingUp size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold" style={{ color: B.blue }}>
                    {p.serviceName}
                  </p>
                  <p className="text-xs" style={{ color: B.muted }}>
                    Vol: {formatInr(p.volume)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold" style={{ color: B.green }}>
                    +{formatInr(p.netAmount)}
                  </p>
                  <p className="text-[10px] font-extrabold tracking-wide" style={{ color: B.muted }}>
                    EARNING
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
